//! Immutable order revisions, external stock and supplier credit. Cash payments stay untouched.
use crate::{
    construction_workflow::{add, invalid, sum},
    operations::{Operation, OperationLine},
    LocalStore, Result,
};
use rusqlite::{params, Connection};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, deny_unknown_fields)]
pub struct SupplierMovement {
    pub id: Uuid,
    pub order_id: Uuid,
    pub project_id: Uuid,
    pub kind: String,
    pub revision: u32,
    pub quantities: BTreeMap<Uuid, D>,
    pub amount: D,
    pub reason: String,
    pub lines: Vec<OperationLine>,
    pub partner_id: Option<Uuid>,
    pub due_date: Option<String>,
    pub proof: Option<Proof>,
    pub stock: BTreeMap<Uuid, StockPosition>,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StockPosition {
    pub vendor_stock: D,
    pub requested: D,
    pub received: D,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proof {
    pub name: String,
    pub content: Vec<u8>,
}
#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub id: Uuid,
    pub document_id: Uuid,
    pub document_number: String,
    pub date: String,
    pub name: String,
}
pub(crate) fn movements(conn: &Connection, order: Uuid) -> Result<Vec<SupplierMovement>> {
    let rows = conn
        .prepare("SELECT payload FROM supplier_movements WHERE order_id=?1 ORDER BY rowid")?
        .query_map([order.to_string()], |r| r.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|s| Ok(serde_json::from_str(&s)?))
        .collect()
}
pub(crate) fn effective(conn: &Connection, mut o: Operation) -> Result<Operation> {
    if !["purchase_order", "subcontract"].contains(&o.kind.as_str()) {
        return Ok(o);
    }
    let history = movements(conn, o.id)?;
    if history.is_empty() {
        return Ok(o);
    }
    let mut adjustment = D::ZERO;
    for m in history {
        match m.kind.as_str() {
            "edit" | "scope" => {
                o.lines = m.lines;
                o.partner_id = m.partner_id;
                o.due_date = m.due_date.unwrap_or_default();
            }
            "release" => {
                for l in &mut o.lines {
                    if let Some(q) = l.resource_id.and_then(|id| m.quantities.get(&id)) {
                        adjustment = add(
                            adjustment,
                            -q.checked_mul(l.unit_price)
                                .ok_or_else(|| invalid("Importe fuera de rango"))?,
                        )?;
                        l.quantity = add(l.quantity, -*q)?;
                    }
                }
            }
            "apply" => adjustment = add(adjustment, m.amount)?,
            _ => {}
        }
    }
    o.amount = sum(o
        .lines
        .iter()
        .map(|l| {
            l.quantity
                .checked_mul(l.unit_price)
                .ok_or_else(|| invalid("Importe fuera de rango"))
        })
        .collect::<Result<Vec<_>>>()?
        .into_iter())?;
    o.calculated
        .insert("supplier_payment_adjustment".into(), adjustment);
    Ok(o)
}
pub(crate) fn validate_proof(p: &Proof) -> Result<()> {
    let ext = p.name.rsplit('.').next().unwrap_or("").to_lowercase();
    let valid = match ext.as_str() {
        "pdf" => p.content.starts_with(b"%PDF-"),
        "png" => p.content.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => p.content.starts_with(&[255, 216, 255]),
        "webp" => {
            p.content.len() > 12 && p.content.starts_with(b"RIFF") && &p.content[8..12] == b"WEBP"
        }
        _ => false,
    };
    if !valid
        || p.name.is_empty()
        || p.name.len() > 180
        || p.name.contains(['/', '\\'])
        || p.name.chars().any(char::is_control)
        || p.content.len() > 10 * 1024 * 1024
    {
        return Err(invalid("Adjuntá PDF o imagen válida de hasta 10 MB"));
    }
    Ok(())
}
impl LocalStore {
    pub fn supplier_movements(&self, project: Uuid, order: Uuid) -> Result<Vec<SupplierMovement>> {
        if !self
            .operation_documents(Some(project))?
            .iter()
            .any(|o| o.id == order && ["purchase_order", "subcontract"].contains(&o.kind.as_str()))
        {
            return Err(invalid("Pedido ajeno a la obra"));
        }
        let mut rows = movements(&self.conn, order)?;
        for m in &mut rows {
            if let Some(p) = &mut m.proof {
                p.content.clear();
            }
        }
        Ok(rows)
    }
    pub fn operation_file_list(&self, project: Uuid, order: Uuid) -> Result<Vec<FileInfo>> {
        let rows=self.conn.prepare("SELECT f.id,f.document_id,f.name,json_extract(o.payload,'$.number'),o.date FROM operation_files f JOIN operation_documents o ON o.id=f.document_id WHERE o.project_id=?1 AND (o.id=?2 OR json_extract(o.payload,'$.reference_id')=?2) ORDER BY f.rowid")?.query_map(params![project.to_string(),order.to_string()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?)))?.collect::<std::result::Result<Vec<_>,_>>()?;
        rows.into_iter()
            .map(|(id, d, name, document_number, date)| {
                Ok(FileInfo {
                    id: id.parse()?,
                    document_id: d.parse()?,
                    document_number,
                    date,
                    name,
                })
            })
            .collect()
    }
    pub fn operation_file_content(&self, project: Uuid, id: Uuid) -> Result<(String, Vec<u8>)> {
        Ok(self.conn.query_row("SELECT f.name,f.content FROM operation_files f JOIN operation_documents o ON o.id=f.document_id WHERE f.id=?1 AND o.project_id=?2",params![id.to_string(),project.to_string()],|r|Ok((r.get(0)?,r.get(1)?)))?)
    }
    pub(crate) fn insert_operation_proof(&self, document: Uuid, p: &Proof) -> Result<()> {
        validate_proof(p)?;
        self.conn.execute(
            "INSERT INTO operation_files(id,document_id,name,content) VALUES(?1,?2,?3,?4)",
            params![
                Uuid::new_v4().to_string(),
                document.to_string(),
                p.name,
                p.content
            ],
        )?;
        Ok(())
    }
    pub fn receive_material_order_with_proof(
        &mut self,
        project: Uuid,
        order: Uuid,
        q: &BTreeMap<Uuid, D>,
        proof: Option<Proof>,
    ) -> Result<Operation> {
        if let Some(p) = &proof {
            validate_proof(p)?;
        }
        self.conn.execute_batch("SAVEPOINT reception_proof")?;
        let result = (|| {
            let doc = self.receive_material_order(project, order, q)?;
            if let Some(p) = proof {
                self.insert_operation_proof(doc.id, &p)?;
            }
            Ok(doc)
        })();
        match result {
            Ok(v) => {
                self.conn.execute_batch("RELEASE reception_proof")?;
                Ok(v)
            }
            Err(e) => {
                self.conn
                    .execute_batch("ROLLBACK TO reception_proof; RELEASE reception_proof")?;
                Err(e)
            }
        }
    }
    pub fn material_payment_with_proof(
        &mut self,
        operation: &Operation,
        proof: Option<Proof>,
    ) -> Result<Operation> {
        if operation.kind != "payment" {
            return Err(invalid("Movimiento de pago inválido"));
        }
        if let Some(p) = &proof {
            validate_proof(p)?;
        }
        self.conn.execute_batch("SAVEPOINT payment_proof")?;
        let result = (|| {
            let doc = self.post_operation(operation)?;
            if let Some(p) = proof {
                self.insert_operation_proof(doc.id, &p)?;
            }
            Ok(doc)
        })();
        match result {
            Ok(v) => {
                self.conn.execute_batch("RELEASE payment_proof")?;
                Ok(v)
            }
            Err(e) => {
                self.conn
                    .execute_batch("ROLLBACK TO payment_proof; RELEASE payment_proof")?;
                Err(e)
            }
        }
    }
    pub fn revise_subcontract(
        &mut self,
        project: Uuid,
        id: Uuid,
        revision: u32,
        quantities: &BTreeMap<Uuid, D>,
        reason: &str,
    ) -> Result<()> {
        if reason.trim().is_empty() || reason.len() > 2000 {
            return Err(invalid("Indicá el motivo de reducción o baja"));
        }
        self.conn.execute_batch(
            "SAVEPOINT contract_scope; UPDATE automatic_codes SET last_value=last_value WHERE 0",
        )?;
        let result = (|| {
            let orders = self.supplier_orders(project, "work")?;
            let order = orders
                .iter()
                .find(|o| o.document.id == id)
                .ok_or_else(|| invalid("Subcontrato ajeno a la obra"))?;
            if order.revision != revision {
                return Err(invalid(
                    "El subcontrato cambió; recargá antes de modificarlo",
                ));
            }
            let mut lines = order.document.lines.clone();
            for l in &mut lines {
                let id = l.line_id.ok_or_else(|| invalid("Partida inválida"))?;
                let q = quantities
                    .get(&id)
                    .ok_or_else(|| invalid("Indicá las cantidades del contrato"))?;
                let old = order.lines.iter().find(|l| l.source_id == id).unwrap();
                if *q < old.received || *q > old.quantity {
                    return Err(invalid(
                        "Solo se reduce trabajo pendiente; lo certificado se conserva",
                    ));
                }
                l.quantity = *q;
            }
            let m = SupplierMovement {
                id: Uuid::new_v4(),
                order_id: id,
                project_id: project,
                kind: "scope".into(),
                revision,
                lines,
                partner_id: order.document.partner_id,
                due_date: Some(order.document.due_date.clone()),
                reason: reason.into(),
                created_at: self.conn.query_row(
                    "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",
                    [],
                    |r| r.get(0),
                )?,
                ..Default::default()
            };
            self.conn.execute("INSERT INTO supplier_movements(id,order_id,project_id,kind,payload) VALUES(?1,?2,?3,?4,?5)",params![m.id.to_string(),id.to_string(),project.to_string(),m.kind,serde_json::to_string(&m)?])?;
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.conn.execute_batch("RELEASE contract_scope")?;
                Ok(())
            }
            Err(e) => {
                self.conn
                    .execute_batch("ROLLBACK TO contract_scope; RELEASE contract_scope")?;
                Err(e)
            }
        }
    }
    pub fn supplier_credit(
        &self,
        project: Uuid,
        supplier: Option<Uuid>,
        currency: &str,
    ) -> Result<D> {
        let docs = self.operation_documents(Some(project))?;
        let mut credit = D::ZERO;
        for o in docs.iter().filter(|o| {
            o.kind == "purchase_order" && o.partner_id == supplier && o.currency == currency
        }) {
            for m in movements(&self.conn, o.id)? {
                if m.kind == "release" {
                    credit = add(credit, m.amount)?;
                } else if m.kind == "apply" {
                    credit = add(credit, -m.amount)?;
                }
            }
        }
        Ok(credit)
    }
    pub fn record_supplier_movement(
        &mut self,
        input: &SupplierMovement,
    ) -> Result<SupplierMovement> {
        if let Some(p) = &input.proof {
            validate_proof(p)?;
        }
        self.conn.execute_batch(
            "SAVEPOINT supplier_movement; UPDATE automatic_codes SET last_value=last_value WHERE 0",
        )?;
        let result = (|| {
            let orders = self.supplier_orders(input.project_id, "material")?;
            let o = orders
                .iter()
                .find(|o| o.document.id == input.order_id)
                .ok_or_else(|| invalid("Pedido ajeno a la obra"))?;
            let history = movements(&self.conn, o.document.id)?;
            if history.len() as u32 != input.revision {
                return Err(invalid("El pedido cambió. Recargá antes de continuar"));
            }
            let mut m = input.clone();
            m.id = Uuid::new_v4();
            m.created_at =
                self.conn
                    .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                        r.get(0)
                    })?;
            if m.reason.len() > 2000
                || m.amount < D::ZERO
                || m.quantities.values().any(|q| *q < D::ZERO)
            {
                return Err(invalid("Revisá motivo, cantidades e importe"));
            }
            match m.kind.as_str() {
                "edit" | "scope" => {
                    if !o.editable {
                        return Err(invalid(
                            "El pedido quedó fijado por movimientos registrados",
                        ));
                    }
                    if m.lines.is_empty() || m.lines.len() > 2000 || m.partner_id.is_none() {
                        return Err(invalid("Proveedor y materiales obligatorios"));
                    }
                    let partner = self
                        .management_record(m.partner_id.unwrap())?
                        .ok_or_else(|| invalid("Proveedor inexistente"))?;
                    if !["supplier", "subcontractor", "crew"].contains(&partner.kind.as_str())
                        || partner.project_id.is_some_and(|p| p != m.project_id)
                    {
                        return Err(invalid("Proveedor ajeno a la obra"));
                    }
                    let mut seen = std::collections::BTreeSet::new();
                    for l in &m.lines {
                        let id = l
                            .resource_id
                            .ok_or_else(|| invalid("Material obligatorio"))?;
                        if !seen.insert(id)
                            || l.quantity <= D::ZERO
                            || l.unit_price < D::ZERO
                            || !self.get_resource(id)?.is_some_and(|r| {
                                r.active && r.kind == cpobras_core::ResourceKind::Material
                            })
                        {
                            return Err(invalid("Materiales o cantidades inválidas"));
                        }
                    }
                    if let Some(d) = &m.due_date {
                        chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
                            .map_err(|_| invalid("Fecha inválida"))?;
                    }
                }
                "apply" => {
                    let credit = self.supplier_credit(
                        m.project_id,
                        o.document.partner_id,
                        &o.document.currency,
                    )?;
                    if m.amount <= D::ZERO || m.amount > credit || m.amount > o.pending_payment {
                        return Err(invalid(
                            "El saldo aplicado supera el disponible o el saldo del pedido",
                        ));
                    }
                }
                "reserve" | "request" | "release" => {
                    if m.quantities.is_empty() || !m.quantities.values().any(|q| *q > D::ZERO) {
                        return Err(invalid("Ingresá cantidades"));
                    }
                    let mut value = D::ZERO;
                    for (id, q) in &m.quantities {
                        let l = o
                            .lines
                            .iter()
                            .find(|l| l.source_id == *id)
                            .ok_or_else(|| invalid("Material ajeno al pedido"))?;
                        let cap = if m.kind == "request" {
                            add(l.vendor_stock, -l.requested)?.max(D::ZERO)
                        } else if m.kind == "reserve" {
                            add(l.remaining, -l.vendor_stock)?
                        } else {
                            l.remaining
                        };
                        if *q > cap {
                            return Err(invalid("La cantidad supera el material disponible"));
                        }
                        value = add(
                            value,
                            q.checked_mul(l.unit_price)
                                .ok_or_else(|| invalid("Importe fuera de rango"))?,
                        )?;
                    }
                    if m.kind == "reserve" {
                        let reserved = sum(o
                            .lines
                            .iter()
                            .map(|l| {
                                l.vendor_stock
                                    .checked_mul(l.unit_price)
                                    .ok_or_else(|| invalid("Importe fuera de rango"))
                            })
                            .collect::<Result<Vec<_>>>()?
                            .into_iter())?;
                        if add(
                            add(value, reserved)?,
                            sum(o
                                .lines
                                .iter()
                                .map(|l| {
                                    l.received
                                        .checked_mul(l.unit_price)
                                        .ok_or_else(|| invalid("Importe fuera de rango"))
                                })
                                .collect::<Result<Vec<_>>>()?
                                .into_iter())?,
                        )? > o.paid
                        {
                            return Err(invalid(
                                "Solo se puede acopiar en proveedor material pagado",
                            ));
                        }
                    }
                    if m.kind == "release" {
                        let received_value = sum(o
                            .lines
                            .iter()
                            .map(|l| {
                                l.received
                                    .checked_mul(l.unit_price)
                                    .ok_or_else(|| invalid("Importe fuera de rango"))
                            })
                            .collect::<Result<Vec<_>>>()?
                            .into_iter())?;
                        let refundable = add(o.paid, -received_value)?.max(D::ZERO);
                        if m.reason.trim().is_empty() || m.amount > value || m.amount > refundable {
                            return Err(invalid(
                                "Indicá el motivo y un saldo reconocido respaldado por el pago",
                            ));
                        }
                    } else {
                        m.amount = D::ZERO;
                    }
                }
                _ => return Err(invalid("Movimiento de proveedor inválido")),
            }
            m.stock = o
                .lines
                .iter()
                .map(|l| {
                    let q = m.quantities.get(&l.source_id).copied().unwrap_or_default();
                    let vendor_stock = match m.kind.as_str() {
                        "reserve" => add(l.vendor_stock, q)?,
                        "release" => add(l.vendor_stock, -q)?.max(D::ZERO),
                        _ => l.vendor_stock,
                    };
                    let requested = match m.kind.as_str() {
                        "request" => add(l.requested, q)?,
                        "release" => add(l.requested, -q)?.max(D::ZERO),
                        _ => l.requested,
                    };
                    Ok((
                        l.source_id,
                        StockPosition {
                            vendor_stock,
                            requested,
                            received: l.received,
                        },
                    ))
                })
                .collect::<Result<BTreeMap<_, _>>>()?;
            if let Some(p) = m.proof.take() {
                self.insert_operation_proof(o.document.id, &p)?;
                m.proof = Some(Proof {
                    name: p.name,
                    content: Vec::new(),
                });
            }
            self.conn.execute("INSERT INTO supplier_movements(id,order_id,project_id,kind,payload) VALUES(?1,?2,?3,?4,?5)",params![m.id.to_string(),m.order_id.to_string(),m.project_id.to_string(),m.kind,serde_json::to_string(&m)?])?;
            Ok(m)
        })();
        match result {
            Ok(v) => {
                self.conn.execute_batch("RELEASE supplier_movement")?;
                Ok(v)
            }
            Err(e) => {
                self.conn
                    .execute_batch("ROLLBACK TO supplier_movement; RELEASE supplier_movement")?;
                Err(e)
            }
        }
    }
}
