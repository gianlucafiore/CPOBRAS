//! Construction operations: immutable source documents, exact stock and financial reconciliation.
use crate::{LocalStore, Result, StorageError};
use chrono::NaiveDate;
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub const KINDS: &[&str] = &[
    "request",
    "rfq",
    "quote",
    "purchase_order",
    "service_order",
    "subcontract",
    "stock_opening",
    "receipt",
    "service_receipt",
    "consumption",
    "return",
    "transfer",
    "daily",
    "certificate",
    "subcertificate",
    "index",
    "adjustment",
    "payable",
    "receivable",
    "payment",
    "collection",
    "advance_paid",
    "advance_received",
    "retention_payable",
    "retention_receivable",
    "forecast",
];
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct OperationLine {
    pub resource_id: Option<Uuid>,
    pub line_id: Option<Uuid>,
    pub center_id: Option<Uuid>,
    pub entry_type: String,
    pub attendance: String,
    pub description: String,
    pub quantity: D,
    pub unit_price: D,
    pub hours: D,
}
impl Default for OperationLine {
    fn default() -> Self {
        Self {
            resource_id: None,
            line_id: None,
            center_id: None,
            entry_type: "production".into(),
            attendance: "present".into(),
            description: String::new(),
            quantity: D::ONE,
            unit_price: D::ZERO,
            hours: D::ZERO,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PriceCostLink {
    pub row_id: Uuid,
    pub item_id: Uuid,
    pub period_start: String,
}
#[derive(Debug, Serialize)]
pub struct RecurringExpense {
    pub row_id: Uuid,
    pub item_id: Uuid,
    pub description: String,
    pub currency: String,
    pub period_start: String,
    pub period_end: String,
    pub due_date: String,
    pub amount: D,
    pub invoiced: D,
    pub unbilled: D,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Operation {
    pub work_units: D,
    pub quotation_request: Option<crate::quotation_workflow::QuotationRequest>,
    pub advance_before_index: bool,
    pub advance_percent: Option<D>,
    pub progress_sources: Vec<crate::construction_workflow::ProgressSource>,
    pub contract_terms: Option<crate::construction_workflow::ContractTerms>,
    pub index_snapshot: Option<cpobras_core::adjustments::AdjustmentSnapshot>,
    pub extras: Vec<crate::adjustments::CertificateExtra>,
    pub reconcile_ids: Vec<Uuid>,
    pub reconciliations: Vec<crate::adjustments::CertificateDifference>,
    pub price_cost: Option<PriceCostLink>,
    pub id: Uuid,
    pub project_id: Uuid,
    pub kind: String,
    pub number: String,
    pub date: String,
    pub currency: String,
    pub partner_id: Option<Uuid>,
    pub reference_id: Option<Uuid>,
    pub warehouse_id: Option<Uuid>,
    pub destination_id: Option<Uuid>,
    pub estimate_id: Option<Uuid>,
    pub period_start: String,
    pub period_end: String,
    pub due_date: String,
    pub notes: String,
    pub terms: String,
    pub crew: String,
    pub incidents: String,
    pub photos: Vec<String>,
    pub lines: Vec<OperationLine>,
    pub amount: D,
    pub advance: D,
    pub discount: D,
    pub retention_percent: D,
    pub index_series: String,
    pub index_source: String,
    pub index_period: String,
    pub index_value: D,
    pub adjustment_weights: Vec<IndexWeight>,
    pub base_period: String,
    pub target_period: String,
    pub calculated: BTreeMap<String, D>,
}
impl Default for Operation {
    fn default() -> Self {
        Self {
            work_units: D::ZERO,
            quotation_request: None,
            advance_before_index: false,
            advance_percent: None,
            progress_sources: vec![],
            contract_terms: None,
            index_snapshot: None,
            extras: vec![],
            reconcile_ids: vec![],
            reconciliations: vec![],
            price_cost: None,
            id: Uuid::new_v4(),
            project_id: Uuid::nil(),
            kind: String::new(),
            number: String::new(),
            date: String::new(),
            currency: "ARS".into(),
            partner_id: None,
            reference_id: None,
            warehouse_id: None,
            destination_id: None,
            estimate_id: None,
            period_start: String::new(),
            period_end: String::new(),
            due_date: String::new(),
            notes: String::new(),
            terms: String::new(),
            crew: String::new(),
            incidents: String::new(),
            photos: vec![],
            lines: vec![],
            amount: D::ZERO,
            advance: D::ZERO,
            discount: D::ZERO,
            retention_percent: D::ZERO,
            index_series: String::new(),
            index_source: String::new(),
            index_period: String::new(),
            index_value: D::ZERO,
            adjustment_weights: vec![],
            base_period: String::new(),
            target_period: String::new(),
            calculated: BTreeMap::new(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndexWeight {
    pub series: String,
    pub weight: D,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warehouse {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub location: String,
}
#[derive(Debug, Serialize)]
pub struct StockBalance {
    pub warehouse_id: Uuid,
    pub resource_id: Uuid,
    pub currency: String,
    pub quantity: D,
    pub value: D,
}
fn err(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
fn add(a: D, b: D) -> Result<D> {
    a.checked_add(b)
        .ok_or_else(|| err("Importe fuera de rango"))
}
fn sub(a: D, b: D) -> Result<D> {
    a.checked_sub(b)
        .ok_or_else(|| err("Importe fuera de rango"))
}
fn mul(a: D, b: D) -> Result<D> {
    a.checked_mul(b)
        .ok_or_else(|| err("Importe fuera de rango"))
}
fn div(a: D, b: D) -> Result<D> {
    a.checked_div(b)
        .ok_or_else(|| err("Divisor nulo o fuera de rango"))
}
fn sum(mut values: impl Iterator<Item = D>) -> Result<D> {
    values.try_fold(D::ZERO, add)
}
fn date(s: &str) -> Result<()> {
    if s.len() != 10 || NaiveDate::parse_from_str(s, "%Y-%m-%d").is_err() {
        return Err(err("Fecha inválida; usá AAAA-MM-DD"));
    }
    Ok(())
}
fn month(s: &str) -> Result<()> {
    date(&format!("{s}-01"))
}
fn total(o: &Operation) -> Result<D> {
    sum(o
        .lines
        .iter()
        .map(|l| mul(l.quantity, l.unit_price))
        .collect::<Result<Vec<_>>>()?
        .into_iter())
}
fn document(conn: &rusqlite::Connection, id: Uuid) -> Result<Option<Operation>> {
    let json: Option<String> = conn
        .query_row(
            "SELECT payload FROM operation_documents WHERE id=?1",
            [id.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    json.map(|v| serde_json::from_str(&v).map_err(Into::into))
        .transpose()
}
pub(crate) fn documents(
    conn: &rusqlite::Connection,
    project: Option<Uuid>,
) -> Result<Vec<Operation>> {
    let rows=conn.prepare("SELECT payload FROM operation_documents WHERE (?1 IS NULL OR project_id=?1) ORDER BY date,created_at,rowid")?.query_map([project.map(|id|id.to_string())],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;
    rows.iter()
        .map(|v| serde_json::from_str(v).map_err(Into::into))
        .collect()
}
fn warehouse(conn: &rusqlite::Connection, id: Uuid) -> Result<Warehouse> {
    Ok(conn
        .query_row(
            "SELECT id,project_id,name,location FROM operation_warehouses WHERE id=?1",
            [id.to_string()],
            |r| {
                Ok(Warehouse {
                    id,
                    project_id: Uuid::parse_str(&r.get::<_, String>(1)?).unwrap_or_default(),
                    name: r.get(2)?,
                    location: r.get(3)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| err("Depósito inexistente"))?)
}
fn balance(
    conn: &rusqlite::Connection,
    wh: Uuid,
    resource: Uuid,
    currency: &str,
    at: &str,
) -> Result<(D, D)> {
    let rows=conn.prepare("SELECT s.quantity,s.value FROM operation_stock s JOIN operation_documents d ON d.id=s.document_id WHERE s.warehouse_id=?1 AND s.resource_id=?2 AND s.currency=?3 AND d.date<=?4 ORDER BY d.date,d.rowid")?.query_map(params![wh.to_string(),resource.to_string(),currency,at],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?.collect::<std::result::Result<Vec<_>,_>>()?;
    let (mut q, mut v) = (D::ZERO, D::ZERO);
    for (a, b) in rows {
        q = add(q, a.parse().map_err(|_| err("Stock inválido"))?)?;
        v = add(v, b.parse().map_err(|_| err("Valor de stock inválido"))?)?;
    }
    Ok((q, v))
}
impl LocalStore {
    pub fn operation_documents(&self, project: Option<Uuid>) -> Result<Vec<Operation>> {
        documents(&self.conn, project)
    }
    pub fn operation_warehouses(&self) -> Result<Vec<Warehouse>> {
        Ok(self.conn.prepare("SELECT id,project_id,name,location FROM operation_warehouses ORDER BY name,location")?.query_map([],|r|Ok(Warehouse{id:Uuid::parse_str(&r.get::<_,String>(0)?).unwrap_or_default(),project_id:Uuid::parse_str(&r.get::<_,String>(1)?).unwrap_or_default(),name:r.get(2)?,location:r.get(3)?}))?.collect::<std::result::Result<_,_>>()?)
    }
    pub fn create_operation_warehouse(&mut self, w: &Warehouse) -> Result<Warehouse> {
        if w.name.trim().is_empty() || w.name.len() > 200 || w.location.len() > 500 {
            return Err(err("Nombre o ubicación de depósito inválidos"));
        }
        self.conn.execute(
            "INSERT INTO operation_warehouses(id,project_id,name,location) VALUES (?1,?2,?3,?4)",
            params![
                w.id.to_string(),
                w.project_id.to_string(),
                w.name.trim(),
                w.location.trim()
            ],
        )?;
        Ok(w.clone())
    }
    pub fn operation_stock(&self, at: &str) -> Result<Vec<StockBalance>> {
        date(at)?;
        let keys = self
            .conn
            .prepare("SELECT DISTINCT warehouse_id,resource_id,currency FROM operation_stock")?
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        keys.into_iter()
            .map(|(wh, res, currency)| {
                let warehouse_id = Uuid::parse_str(&wh)?;
                let resource_id = Uuid::parse_str(&res)?;
                let (quantity, value) =
                    balance(&self.conn, warehouse_id, resource_id, &currency, at)?;
                Ok(StockBalance {
                    warehouse_id,
                    resource_id,
                    currency,
                    quantity,
                    value,
                })
            })
            .collect()
    }
    pub fn post_operation(&mut self, input: &Operation) -> Result<Operation> {
        self.post_operation_mode(input, false, None, None)
    }
    pub(crate) fn post_operation_mode(
        &mut self,
        input: &Operation,
        preview: bool,
        draft: Option<(Uuid, u32)>,
        known: Option<&str>,
    ) -> Result<Operation> {
        let mut o = input.clone();
        o.calculated.clear();
        o.index_snapshot = None;
        o.reconciliations.clear();
        o.number = o.number.trim().into();
        if !KINDS.contains(&o.kind.as_str())
            || o.id.is_nil()
            || (o.number.trim().is_empty()
                && ![
                    "stock_opening",
                    "certificate",
                    "subcertificate",
                    "rfq",
                    "quote",
                    "subcontract",
                    "purchase_order",
                    "receipt",
                    "payment",
                ]
                .contains(&o.kind.as_str()))
            || o.number.len() > 100
            || o.notes.len() > 20000
            || o.terms.len() > 20000
            || o.crew.len() > 500
            || o.incidents.len() > 20000
            || o.lines.len() > 1000
            || o.photos.len() > 8
            || o.photos.iter().any(|p| {
                p.len() > 3_000_000
                    || !(p.starts_with("data:image/jpeg;base64,")
                        || p.starts_with("data:image/png;base64,"))
            })
        {
            return Err(err("Documento inválido (número obligatorio, hasta 1000 renglones y 8 fotos JPG/PNG de 2 MB)"));
        }
        date(&o.date)?;
        if !["ARS", "USD"].contains(&o.currency.as_str()) {
            return Err(err("Moneda inválida"));
        }
        for d in [&o.period_start, &o.period_end, &o.due_date] {
            if !d.is_empty() {
                date(d)?;
            }
        }
        if !o.period_start.is_empty() && o.period_end < o.period_start {
            return Err(err("Período invertido"));
        }
        for value in [o.amount, o.advance, o.discount, o.retention_percent] {
            if value < D::ZERO {
                return Err(err("Importes negativos"));
            }
        }
        if o.retention_percent > D::from(100) {
            return Err(err("Reparo superior a 100%"));
        }
        // Validate and mutate under one write reservation, including cross-document limits.
        let mut tx = self.conn.savepoint()?;
        tx.execute(
            "UPDATE automatic_codes SET last_value=last_value WHERE 0",
            [],
        )?;
        if document(&tx, o.id)?.is_some() {
            return Err(err("Este documento ya fue registrado; no se duplicó"));
        }
        if !tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1)",
            [o.project_id.to_string()],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(err("Obra inexistente"));
        }
        if let Some(id) = o.estimate_id {
            if !tx.query_row("SELECT EXISTS(SELECT 1 FROM estimates WHERE id=?1 AND project_id=?2 AND currency=?3)",params![id.to_string(),o.project_id.to_string(),o.currency],|r|r.get::<_,bool>(0))?{return Err(err("El presupuesto debe pertenecer a esta obra y moneda"));}
        }
        if let Some(link) = &o.price_cost {
            if o.kind != "payable" || o.estimate_id.is_none() || o.reference_id.is_some() {
                return Err(err("El gasto periódico se vincula a una factura por pagar sin otro origen y con presupuesto"));
            }
            let json: Option<String> = tx
                .query_row(
                    "SELECT definition_json FROM estimate_price_definitions WHERE estimate_id=?1",
                    [o.estimate_id.unwrap().to_string()],
                    |r| r.get(0),
                )
                .optional()?;
            let def: cpobras_core::price_determination::PriceDefinition = serde_json::from_str(
                &json.ok_or_else(|| err("Guardá primero la determinación de precio"))?,
            )?;
            let item = def
                .rows
                .iter()
                .find(|r| {
                    r.id == link.row_id
                        && r.enabled
                        && !r.subtract
                        && r.kind == cpobras_core::price_determination::PriceKind::Detailed
                        && r.detail_mode == cpobras_core::price_determination::DetailMode::Items
                })
                .and_then(|r| r.items.iter().find(|i| i.id == link.item_id && !i.group))
                .ok_or_else(|| err("Gasto periódico inexistente o inactivo"))?;
            if !item
                .payments()
                .map_err(StorageError::InvalidValue)?
                .iter()
                .any(|p| p.period_start == link.period_start)
            {
                return Err(err("Período del gasto inexistente"));
            }
        }
        if o.kind == "stock_opening" && o.number.is_empty() {
            o.number = crate::project_dashboard::next_code(&tx, "stock_opening", "ACO-")?;
        }
        if o.number.is_empty()
            && [
                "certificate",
                "subcertificate",
                "rfq",
                "quote",
                "subcontract",
                "purchase_order",
                "receipt",
                "payment",
            ]
            .contains(&o.kind.as_str())
        {
            let prefix = match o.kind.as_str() {
                "certificate" => "CERT-",
                "subcertificate" => "SUB-",
                "rfq" => "SOL-",
                "quote" => "COT-",
                "purchase_order" => "PED-",
                "receipt" => "REC-",
                "payment" => "PAG-",
                _ => "CONT-",
            };
            o.number = crate::project_dashboard::next_code(
                &tx,
                &format!("document:{}:{}", o.kind, o.project_id),
                prefix,
            )?;
        }
        if let Some((id, revision)) = draft {
            let ok:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM certificate_drafts WHERE id=?1 AND project_id=?2 AND estimate_id=?3 AND revision=?4 AND issued_id IS NULL)",params![id.to_string(),o.project_id.to_string(),o.estimate_id.map(|id|id.to_string()),revision],|r|r.get(0))?;
            if !ok {
                return Err(err(
                    "El borrador ya se emitió o cambió; recargá antes de emitir",
                ));
            }
        }
        if let Some(r) = &o.quotation_request {
            if o.kind != "rfq"
                || r.id != o.id
                || r.project_id != o.project_id
                || r.estimate_id != o.estimate_id
            {
                return Err(err("Solicitud ajena al documento"));
            }
            let mut r = crate::quotation_workflow::canonical(&tx, r)?;
            r.number = o.number.clone();
            o.quotation_request = Some(r);
        }
        let prior = documents(&tx, Some(o.project_id))?;
        if let Some(t) = &o.contract_terms {
            if o.kind != "subcontract" {
                return Err(err(
                    "Las condiciones contractuales pertenecen a un subcontrato",
                ));
            }
            t.validate()?;
            for l in &o.lines {
                if let Some(id) = l.line_id {
                    if t.contributes_progress {
                        let capacity: String = tx.query_row(
                            "SELECT quantity FROM estimate_lines WHERE id=?1",
                            [id.to_string()],
                            |r| r.get(0),
                        )?;
                        let assigned = sum(prior
                            .iter()
                            .filter(|p| {
                                p.kind == "subcontract"
                                    && p.contract_terms
                                        .as_ref()
                                        .is_none_or(|t| t.contributes_progress)
                            })
                            .flat_map(|p| &p.lines)
                            .filter(|x| x.line_id == Some(id))
                            .map(|x| x.quantity))?;
                        let current = sum(o
                            .lines
                            .iter()
                            .filter(|x| x.line_id == Some(id))
                            .map(|x| x.quantity))?;
                        if add(assigned, current)?
                            > capacity.parse().map_err(|_| err("Cantidad inválida"))?
                        {
                            return Err(err("Las asignaciones de contratistas superan la cantidad de la partida; reducí la porción o marcá un alcance que no genera avance físico"));
                        }
                    }
                }
            }
        }
        if !o.progress_sources.is_empty() {
            if o.kind != "certificate" {
                return Err(err(
                    "Solo el certificado al comitente incorpora avances aprobados",
                ));
            }
            let available = crate::construction_workflow::available(
                &tx,
                o.project_id,
                o.estimate_id.ok_or_else(|| err("Falta presupuesto"))?,
            )?;
            let mut seen = BTreeSet::new();
            let mut line_totals = BTreeMap::new();
            for s in &o.progress_sources {
                let source = available
                    .iter()
                    .find(|a| a.source_id == s.source_id && a.line_id == s.line_id)
                    .ok_or_else(|| {
                        err("Avance de subcontratista inexistente, ajeno o ya incorporado")
                    })?;
                if s.quantity <= D::ZERO
                    || s.quantity > source.quantity
                    || !seen.insert((s.source_id, s.line_id))
                {
                    return Err(err(
                        "El avance aprobado ya se utilizó o la cantidad supera su saldo",
                    ));
                }
                let v = line_totals.entry(s.line_id).or_default();
                *v = add(*v, s.quantity)?;
            }
            for (id, q) in line_totals {
                let entered = sum(o
                    .lines
                    .iter()
                    .filter(|l| l.line_id == Some(id))
                    .map(|l| l.quantity))?;
                if q > entered {
                    return Err(err(
                        "El origen aprobado supera el avance ingresado en el certificado",
                    ));
                }
            }
        }

        if prior
            .iter()
            .any(|p| p.kind == o.kind && p.number == o.number && p.partner_id == o.partner_id)
        {
            return Err(err(
                "Número de documento repetido para este tipo y contraparte",
            ));
        }
        if let Some(id) = o.partner_id {
            let kind: Option<String> = tx
                .query_row(
                    "SELECT kind FROM management_records WHERE id=?1",
                    [id.to_string()],
                    |r| r.get(0),
                )
                .optional()?;
            let foreign_crew:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM management_records WHERE id=?1 AND kind='crew' AND project_id IS NOT NULL AND project_id<>?2)",params![id.to_string(),o.project_id.to_string()],|r|r.get(0))?;
            if foreign_crew {
                return Err(err("La cuadrilla pertenece a otra obra"));
            }
            if !kind.is_some_and(|k| {
                ["supplier", "subcontractor", "contact", "crew"].contains(&k.as_str())
            }) {
                return Err(err(
                    "Seleccioná proveedor, subcontratista o contacto válido",
                ));
            }
        }
        let mut seen = BTreeSet::new();
        for l in &o.lines {
            if !["production", "labor", "equipment"].contains(&l.entry_type.as_str())
                || !["present", "absent", "justified"].contains(&l.attendance.as_str())
                || (l.attendance != "present" && l.hours != D::ZERO)
                || l.description.trim().is_empty()
                || l.description.len() > 1000
                || l.quantity <= D::ZERO
                || l.unit_price < D::ZERO
                || l.hours < D::ZERO
            {
                return Err(err(
                    "Renglón inválido: descripción, cantidad positiva, precio y horas no negativos",
                ));
            }
            mul(l.quantity, l.unit_price)?;
            if let Some(id) = l.resource_id {
                if !tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM resources WHERE id=?1 AND active=1)",
                    [id.to_string()],
                    |r| r.get::<_, bool>(0),
                )? {
                    return Err(err("Insumo inexistente o inactivo"));
                }
            }
            if let Some(id) = l.line_id {
                let relation:Option<(String,String,String)>=tx.query_row("SELECT e.project_id,l.estimate_id,e.currency FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.id=?1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?;
                let relation = if relation.is_none()
                    && ["receipt", "service_receipt", "return"].contains(&o.kind.as_str())
                {
                    tx.query_row("SELECT project_id,estimate_id,currency FROM deleted_estimate_lines WHERE id=?1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?
                } else {
                    relation
                };
                let Some((project, estimate, currency)) = relation else {
                    return Err(err("Partida inexistente"));
                };
                if project != o.project_id.to_string()
                    || o.estimate_id.is_some_and(|i| i.to_string() != estimate)
                    || currency != o.currency
                {
                    return Err(err(
                        "La partida debe pertenecer a esta obra, presupuesto y moneda",
                    ));
                }
            }
            if let Some(id) = l.center_id {
                if !tx.query_row("SELECT EXISTS(SELECT 1 FROM management_records WHERE id=?1 AND kind='cost_center' AND (project_id IS NULL OR project_id=?2))",params![id.to_string(),o.project_id.to_string()],|r|r.get::<_,bool>(0))?{return Err(err("Centro de costos ajeno a la obra"));}
            }
            if !seen.insert((l.resource_id, l.line_id, l.description.clone())) {
                return Err(err("Renglones repetidos: unificá las cantidades"));
            }
        }
        if [
            "request",
            "rfq",
            "quote",
            "purchase_order",
            "service_order",
            "subcontract",
            "receipt",
            "service_receipt",
            "consumption",
            "return",
            "transfer",
            "certificate",
            "subcertificate",
        ]
        .contains(&o.kind.as_str())
            && o.lines.is_empty()
            && !(o.kind == "subcontract"
                && o.contract_terms.as_ref().is_some_and(|t| {
                    !t.contributes_progress
                        && ["fixed", "daily", "hourly"].contains(&t.method.as_str())
                }))
            && !(o.kind == "subcertificate"
                && o.reference_id
                    .and_then(|id| prior.iter().find(|p| p.id == id))
                    .and_then(|r| r.contract_terms.as_ref())
                    .is_some_and(|t| ["fixed", "daily", "hourly"].contains(&t.method.as_str())))
            && !(o.kind == "certificate" && (!o.extras.is_empty() || !o.reconcile_ids.is_empty()))
        {
            return Err(err("Agregá al menos un renglón"));
        }
        if [
            "quote",
            "purchase_order",
            "service_order",
            "subcontract",
            "subcertificate",
            "payable",
        ]
        .contains(&o.kind.as_str())
            && o.partner_id.is_none()
        {
            return Err(err("Seleccioná una contraparte"));
        }
        let reference = o
            .reference_id
            .map(|id| document(&tx, id)?.ok_or_else(|| err("Documento de origen inexistente")))
            .transpose()?;
        if let Some(r) = &reference {
            if r.project_id != o.project_id || r.currency != o.currency || r.date > o.date {
                return Err(err(
                    "El origen debe ser de la misma obra y moneda y no ser posterior",
                ));
            }
        }
        if [
            "rfq",
            "quote",
            "purchase_order",
            "service_order",
            "subcontract",
        ]
        .contains(&o.kind.as_str())
        {
            if let Some(r) = &reference {
                let valid = match o.kind.as_str() {
                    "rfq" => r.kind == "request",
                    "quote" => r.kind == "rfq",
                    "purchase_order" | "service_order" => r.kind == "quote" || r.kind == "request",
                    "subcontract" => r.kind == "quote",
                    _ => false,
                };
                if !valid {
                    return Err(err("Origen incompatible con este documento"));
                }
                if r.kind == "quote" && r.partner_id != o.partner_id {
                    return Err(err("La contraparte no coincide con la cotización"));
                }
            }
            o.amount = if o.kind == "subcontract" {
                if let Some(t) = &o.contract_terms {
                    if ["fixed", "daily", "hourly"].contains(&t.method.as_str()) {
                        t.ceiling
                    } else {
                        total(&o)?
                    }
                } else {
                    total(&o)?
                }
            } else {
                total(&o)?
            };
        }
        if o.kind == "stock_opening" {
            if o.reference_id.is_some() || o.lines.is_empty() {
                return Err(err(
                    "El acopio existente requiere renglones y no lleva documento de compra",
                ));
            }
        }
        if ["receipt", "service_receipt"].contains(&o.kind.as_str()) {
            let r = reference
                .as_ref()
                .ok_or_else(|| err("Seleccioná orden o contrato de origen"))?;
            if !(o.kind == "receipt" && r.kind == "purchase_order"
                || o.kind == "service_receipt"
                    && ["service_order", "subcontract"].contains(&r.kind.as_str()))
                || o.partner_id != r.partner_id
            {
                return Err(err("Recepción incompatible con la orden o contraparte"));
            }
            if o.kind == "service_receipt" && r.kind == "subcontract" && r.contract_terms.is_some()
            {
                return Err(err("Este contrato registra la aceptación y el costo mediante su certificado de subcontratista; no dupliques la recepción de servicio"));
            }
            for l in &mut o.lines {
                let original = r
                    .lines
                    .iter()
                    .find(|x| {
                        x.resource_id == l.resource_id
                            && x.line_id == l.line_id
                            && x.description == l.description
                    })
                    .ok_or_else(|| err("El renglón no pertenece a la orden"))?;
                let received = sum(prior
                    .iter()
                    .filter(|p| p.reference_id == Some(r.id) && p.kind == o.kind)
                    .flat_map(|p| &p.lines)
                    .filter(|x| {
                        x.resource_id == l.resource_id
                            && x.line_id == l.line_id
                            && x.description == l.description
                    })
                    .map(|x| x.quantity))?;
                if add(received, l.quantity)? > original.quantity {
                    return Err(err("La recepción supera el saldo de la orden"));
                }
                l.unit_price = original.unit_price;
            }
            o.amount = total(&o)?;
        }
        if [
            "stock_opening",
            "receipt",
            "consumption",
            "return",
            "transfer",
        ]
        .contains(&o.kind.as_str())
        {
            let wh = warehouse(
                &tx,
                o.warehouse_id
                    .ok_or_else(|| err("Seleccioná depósito de origen"))?,
            )?;
            if wh.project_id != o.project_id {
                return Err(err("El depósito pertenece a otra obra"));
            }
            if prior.iter().any(|p| {
                p.date > o.date
                    && [
                        "stock_opening",
                        "receipt",
                        "consumption",
                        "return",
                        "transfer",
                    ]
                    .contains(&p.kind.as_str())
            }) {
                return Err(err(
                    "El movimiento no puede anteceder al último movimiento de stock de la obra",
                ));
            }
            let destination = if o.kind == "transfer" {
                let dest = warehouse(
                    &tx,
                    o.destination_id
                        .ok_or_else(|| err("Seleccioná depósito de destino"))?,
                )?;
                if dest.id == wh.id {
                    return Err(err("Origen y destino iguales"));
                }
                let future:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM operation_stock s JOIN operation_documents d ON d.id=s.document_id WHERE s.warehouse_id=?1 AND d.date>?2)",params![dest.id.to_string(),o.date],|r|r.get(0))?;
                if future {
                    return Err(err("Hay movimientos posteriores en el destino"));
                }
                Some(dest)
            } else {
                None
            };
            if o.kind == "return" {
                let mut keys = BTreeSet::new();
                if o.lines
                    .iter()
                    .any(|l| !keys.insert((l.resource_id, l.line_id)))
                {
                    return Err(err("Unificá las devoluciones del mismo insumo y partida"));
                }
                let r = reference
                    .as_ref()
                    .ok_or_else(|| err("Seleccioná consumo que se devuelve"))?;
                if r.kind != "consumption" || r.warehouse_id != o.warehouse_id {
                    return Err(err(
                        "La devolución debe vincularse al consumo del mismo depósito",
                    ));
                }
                for l in &mut o.lines {
                    let original = r
                        .lines
                        .iter()
                        .find(|x| x.resource_id == l.resource_id && x.line_id == l.line_id)
                        .ok_or_else(|| err("Insumo no consumido en el origen"))?;
                    let returned = sum(prior
                        .iter()
                        .filter(|p| p.kind == "return" && p.reference_id == Some(r.id))
                        .flat_map(|p| &p.lines)
                        .filter(|x| x.resource_id == l.resource_id && x.line_id == l.line_id)
                        .map(|x| x.quantity))?;
                    let original_quantity = sum(r
                        .lines
                        .iter()
                        .filter(|x| x.resource_id == l.resource_id && x.line_id == l.line_id)
                        .map(|x| x.quantity))?;
                    if add(returned, l.quantity)? > original_quantity {
                        return Err(err("Devolución superior al consumo"));
                    }
                    l.unit_price = original.unit_price;
                }
            }
            let mut quantities = BTreeMap::<Uuid, D>::new();
            for l in &o.lines {
                let id = l
                    .resource_id
                    .ok_or_else(|| err("Stock requiere un insumo por renglón"))?;
                quantities.insert(
                    id,
                    add(quantities.get(&id).copied().unwrap_or_default(), l.quantity)?,
                );
            }
            for l in &mut o.lines {
                let id = l.resource_id.unwrap();
                let (q, v) = balance(&tx, wh.id, id, &o.currency, &o.date)?;
                if ["consumption", "transfer"].contains(&o.kind.as_str()) {
                    if q < quantities[&id] {
                        return Err(err("Existencia insuficiente para la suma de los renglones"));
                    }
                    l.unit_price = div(v, q)?;
                }
            }
            let mut remaining_values = BTreeMap::<Uuid, D>::new();
            let mut remaining_quantities = quantities.clone();
            for (id, quantity) in &quantities {
                if ["consumption", "transfer"].contains(&o.kind.as_str()) {
                    let (q, v) = balance(&tx, wh.id, *id, &o.currency, &o.date)?;
                    remaining_values.insert(
                        *id,
                        if q == *quantity {
                            v
                        } else {
                            mul(*quantity, div(v, q)?)?
                        },
                    );
                }
            }
            let mut movement_value = D::ZERO;
            for (i, l) in o.lines.iter().enumerate() {
                let resource = l.resource_id.unwrap();
                let mut value = mul(l.quantity, l.unit_price)?;
                if ["consumption", "transfer"].contains(&o.kind.as_str()) {
                    let remaining = remaining_quantities[&resource];
                    if remaining == l.quantity {
                        value = remaining_values[&resource];
                    }
                    remaining_values.insert(resource, sub(remaining_values[&resource], value)?);
                    remaining_quantities.insert(resource, sub(remaining, l.quantity)?);
                }
                if o.kind == "return" {
                    let r = reference.as_ref().unwrap();
                    let original_quantity = sum(r
                        .lines
                        .iter()
                        .filter(|x| x.resource_id == l.resource_id && x.line_id == l.line_id)
                        .map(|x| x.quantity))?;
                    let original_value = sum(r
                        .lines
                        .iter()
                        .enumerate()
                        .filter(|(_, x)| x.resource_id == l.resource_id && x.line_id == l.line_id)
                        .map(|(j, x)| {
                            r.calculated
                                .get(&format!("line_value:{j}"))
                                .copied()
                                .map(Ok)
                                .unwrap_or_else(|| mul(x.quantity, x.unit_price))
                        })
                        .collect::<Result<Vec<_>>>()?
                        .into_iter())?;
                    let returns: Vec<_> = prior
                        .iter()
                        .filter(|p| p.kind == "return" && p.reference_id == Some(r.id))
                        .collect();
                    let returned_quantity = sum(returns
                        .iter()
                        .flat_map(|p| &p.lines)
                        .filter(|x| x.resource_id == l.resource_id && x.line_id == l.line_id)
                        .map(|x| x.quantity))?;
                    let returned_value = sum(returns
                        .iter()
                        .flat_map(|p| p.lines.iter().enumerate().map(move |(j, x)| (*p, j, x)))
                        .filter(|(_, _, x)| {
                            x.resource_id == l.resource_id && x.line_id == l.line_id
                        })
                        .map(|(p, j, x)| {
                            p.calculated
                                .get(&format!("line_value:{j}"))
                                .copied()
                                .map(Ok)
                                .unwrap_or_else(|| mul(x.quantity, x.unit_price))
                        })
                        .collect::<Result<Vec<_>>>()?
                        .into_iter())?;
                    value = if add(returned_quantity, l.quantity)? == original_quantity {
                        sub(original_value, returned_value)?
                    } else {
                        mul(l.quantity, div(original_value, original_quantity)?)?
                    };
                }
                o.calculated.insert(format!("line_value:{i}"), value);
                movement_value = add(movement_value, value)?;
            }
            o.amount = movement_value;
            o.calculated.insert("stock_value".into(), o.amount);
            if let Some(dest) = destination {
                o.calculated.insert(
                    "destination_project_is_different".into(),
                    if dest.project_id != o.project_id {
                        D::ONE
                    } else {
                        D::ZERO
                    },
                );
            }
        }
        if o.kind == "daily" {
            if o.lines.is_empty()
                && o.incidents.trim().is_empty()
                && o.notes.trim().is_empty()
                && o.photos.is_empty()
            {
                return Err(err("El parte está vacío"));
            }
            for l in &o.lines {
                if let Some(id) = l.line_id {
                    let planned: String = tx.query_row(
                        "SELECT quantity FROM estimate_lines WHERE id=?1",
                        [id.to_string()],
                        |r| r.get(0),
                    )?;
                    let executed = sum(prior
                        .iter()
                        .filter(|p| p.kind == "daily")
                        .flat_map(|p| &p.lines)
                        .filter(|x| x.line_id == Some(id) && x.entry_type == "production")
                        .map(|x| x.quantity))?;
                    let current = sum(o
                        .lines
                        .iter()
                        .filter(|x| x.line_id == Some(id) && x.entry_type == "production")
                        .map(|x| x.quantity))?;
                    if add(executed, current)?
                        > planned
                            .parse()
                            .map_err(|_| err("Cantidad prevista inválida"))?
                    {
                        return Err(err(
                            "La producción acumulada supera la partida; revisá el presupuesto",
                        ));
                    }
                }
            }
            // Daily unit_price is labor/equipment cost per hour; quantities are production units.
            o.amount = sum(o
                .lines
                .iter()
                .map(|l| mul(l.hours, l.unit_price))
                .collect::<Result<Vec<_>>>()?
                .into_iter())?;
        }
        if ["advance_paid", "advance_received"].contains(&o.kind.as_str()) {
            if o.amount <= D::ZERO || (o.kind == "advance_paid" && o.partner_id.is_none()) {
                return Err(err(
                    "El anticipo requiere monto positivo y contraparte para pagos",
                ));
            }
            if let Some(r) = &reference {
                if r.kind != "subcontract"
                    || o.kind != "advance_paid"
                    || r.partner_id != o.partner_id
                {
                    return Err(err("Anticipo incompatible con el contrato"));
                }
                let paid = sum(prior
                    .iter()
                    .filter(|p| p.kind == "advance_paid" && p.reference_id == Some(r.id))
                    .map(|p| p.amount))?;
                if add(paid, o.amount)? > r.amount {
                    return Err(err("Anticipos superiores al contrato"));
                }
            }
        }
        if o.kind != "certificate" && (!o.extras.is_empty() || !o.reconcile_ids.is_empty()) {
            return Err(err(
                "Adicionales y diferencias se agregan a certificados del comitente",
            ));
        }
        if o.extras.len() > 100 || o.reconcile_ids.len() > 200 {
            return Err(err("Demasiados adicionales o diferencias"));
        }
        let mut extra_ids = BTreeSet::new();
        for extra in &o.extras {
            if extra.id.is_nil()
                || !extra_ids.insert(extra.id)
                || extra.description.trim().is_empty()
                || extra.description.len() > 500
                || extra.reason.trim().is_empty()
                || extra.reason.len() > 2000
                || extra.authorization.trim().is_empty()
                || extra.authorization.len() > 2000
                || extra.amount <= D::ZERO
            {
                return Err(err(
                    "El adicional requiere descripción, motivo, autorización e importe positivo",
                ));
            }
            if prior
                .iter()
                .any(|p| p.extras.iter().any(|e| e.id == extra.id))
            {
                return Err(err("Este adicional ya se incluyó en una certificación"));
            }
        }
        if ["certificate", "subcertificate"].contains(&o.kind.as_str()) {
            let estimate = o
                .estimate_id
                .ok_or_else(|| err("Seleccioná presupuesto emitido"))?;
            let relation: Option<(String, String, String)> = tx
                .query_row(
                    "SELECT project_id,status,currency FROM estimates WHERE id=?1",
                    [estimate.to_string()],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?;
            if relation
                != Some((
                    o.project_id.to_string(),
                    "issued".into(),
                    o.currency.clone(),
                ))
            {
                return Err(err(
                    "La certificación requiere un presupuesto emitido de esta obra y moneda",
                ));
            }
            date(&o.period_start)?;
            date(&o.period_end)?;
            if o.date < o.period_end {
                return Err(err(
                    "La fecha de emisión no puede preceder al fin del período",
                ));
            }
            if prior.iter().any(|p| {
                p.kind == o.kind
                    && p.estimate_id == Some(estimate)
                    && p.partner_id == o.partner_id
                    && (o.kind != "subcertificate" || p.reference_id == o.reference_id)
                    && p.period_end >= o.period_start
            }) {
                return Err(err(
                    "El período se solapa o antecede a una certificación existente",
                ));
            }
            if o.kind == "subcertificate" {
                let r = reference
                    .as_ref()
                    .ok_or_else(|| err("Seleccioná contrato de subcontratista"))?;
                if r.kind != "subcontract" || r.partner_id != o.partner_id {
                    return Err(err("Contrato incompatible con el subcontratista"));
                }
            }
            let direct = crate::estimates::checked_budget_total(&tx, estimate)?;
            let sale = if o.kind == "certificate" {
                crate::price_determination::calculate_price(&tx, estimate)?
                    .breakdown
                    .total
            } else {
                reference.as_ref().unwrap().amount
            };
            if o.kind == "certificate" && direct == D::ZERO && sale > D::ZERO {
                return Err(err("No se puede distribuir la determinación de precio entre partidas con costo directo cero"));
            }
            let sale_factor = if o.kind == "certificate" && direct > D::ZERO {
                div(sale, direct)?
            } else {
                D::ONE
            };
            let mut used = BTreeSet::new();
            let (mut previous, mut pending) = (D::ZERO, D::ZERO);
            for l in &mut o.lines {
                let id = l
                    .line_id
                    .ok_or_else(|| err("Seleccioná partida por renglón"))?;
                if !used.insert(id) {
                    return Err(err("Partida repetida en certificado"));
                }
                let(q,price):(String,String)=tx.query_row("SELECT quantity,unit_cost_snapshot FROM estimate_lines WHERE id=?1 AND estimate_id=?2",params![id.to_string(),estimate.to_string()],|r|Ok((r.get(0)?,r.get(1)?)))?;
                let q: D = q.parse().map_err(|_| err("Cantidad inválida"))?;
                l.unit_price = mul(
                    price.parse().map_err(|_| err("Precio inválido"))?,
                    sale_factor,
                )?;
                if o.kind == "subcertificate" {
                    let r = reference.as_ref().unwrap();
                    let contracted = r
                        .lines
                        .iter()
                        .find(|x| x.line_id == Some(id))
                        .ok_or_else(|| err("La partida no pertenece al subcontrato"))?;
                    l.unit_price = contracted.unit_price;
                    if l.quantity > contracted.quantity {
                        return Err(err("Cantidad superior al subcontrato"));
                    }
                }
                let accumulated = sum(prior
                    .iter()
                    .filter(|p| {
                        p.kind == o.kind
                            && p.estimate_id == o.estimate_id
                            && p.partner_id == o.partner_id
                            && (o.kind != "subcertificate" || p.reference_id == o.reference_id)
                    })
                    .flat_map(|p| &p.lines)
                    .filter(|x| x.line_id == Some(id))
                    .map(|x| x.quantity))?;
                let cap = if o.kind == "subcertificate" {
                    reference
                        .as_ref()
                        .unwrap()
                        .lines
                        .iter()
                        .find(|x| x.line_id == Some(id))
                        .unwrap()
                        .quantity
                        .min(q)
                } else {
                    q
                };
                if add(accumulated, l.quantity)? > cap {
                    return Err(err("La cantidad certificada supera el saldo contractual"));
                }
                o.calculated
                    .insert(format!("previous_quantity:{id}"), accumulated);
                o.calculated
                    .insert(format!("period_quantity:{id}"), l.quantity);
                o.calculated.insert(
                    format!("pending_quantity:{id}"),
                    sub(cap, add(accumulated, l.quantity)?)?,
                );
                previous = add(previous, mul(accumulated, l.unit_price)?)?;
                pending = add(
                    pending,
                    mul(sub(cap, add(accumulated, l.quantity)?)?, l.unit_price)?,
                )?;
            }
            let base_work = if o.kind == "subcertificate" {
                if let Some(t) = reference.as_ref().and_then(|r| r.contract_terms.as_ref()) {
                    t.validate()?;
                    if !t.start.is_empty() && (o.period_start < t.start || o.period_end > t.end) {
                        return Err(err("El certificado está fuera del período contratado"));
                    }
                    let due = crate::construction_workflow::pay_date(&o.period_end, &t.frequency)?;
                    o.due_date = (chrono::NaiveDate::parse_from_str(&due, "%Y-%m-%d")
                        .map_err(|_| err("Fecha inválida"))?
                        + chrono::Duration::days(i64::from(t.payment_delay_days)))
                    .to_string();
                    if t.method == "fixed" {
                        if crate::construction_workflow::pay_date(&o.period_start, &t.frequency)?
                            != due
                            || prior
                                .iter()
                                .filter(|p| {
                                    p.kind == "subcertificate" && p.reference_id == o.reference_id
                                })
                                .any(|p| {
                                    crate::construction_workflow::pay_date(
                                        &p.period_end,
                                        &t.frequency,
                                    )
                                    .ok()
                                    .as_deref()
                                        == Some(due.as_str())
                                })
                        {
                            return Err(err("El pago fijo de este período ya fue liquidado o el certificado abarca varios períodos"));
                        }
                        t.rate
                    } else if ["daily", "hourly"].contains(&t.method.as_str()) {
                        if o.work_units <= D::ZERO {
                            return Err(err("Indicá las jornadas u horas efectivamente aprobadas"));
                        }
                        mul(t.rate, o.work_units)?
                    } else {
                        total(&o)?
                    }
                } else {
                    total(&o)?
                }
            } else {
                total(&o)?
            };
            if let Some(percent) = o.advance_percent {
                if percent < D::ZERO || percent > D::from(100) {
                    return Err(err("Recuperación de anticipo fuera de rango"));
                }
                let kind = if o.kind == "certificate" {
                    "advance_received"
                } else {
                    "advance_paid"
                };
                let received = sum(prior
                    .iter()
                    .filter(|p| {
                        p.kind == kind
                            && p.currency == o.currency
                            && p.partner_id == o.partner_id
                            && p.date <= o.date
                            && (o.kind == "certificate" || p.reference_id == o.reference_id)
                    })
                    .map(|p| p.amount))?;
                let recovered = sum(prior
                    .iter()
                    .filter(|p| {
                        p.kind == o.kind
                            && p.currency == o.currency
                            && p.partner_id == o.partner_id
                            && (o.kind == "certificate" || p.reference_id == o.reference_id)
                    })
                    .map(|p| p.advance))?;
                let eligible = add(
                    base_work,
                    sum(o
                        .extras
                        .iter()
                        .filter(|e| e.recover_advance)
                        .map(|e| e.amount))?,
                )?;
                o.advance = div(mul(eligible, percent)?, 100.into())?
                    .min(add(received, -recovered)?.max(D::ZERO));
            }
            if o.advance > D::ZERO {
                let advance_kind = if o.kind == "certificate" {
                    "advance_received"
                } else {
                    "advance_paid"
                };
                let available = sum(prior
                    .iter()
                    .filter(|p| {
                        p.kind == advance_kind
                            && p.currency == o.currency
                            && p.partner_id == o.partner_id
                            && (o.kind == "certificate" || p.reference_id == o.reference_id)
                    })
                    .map(|p| p.amount))?;
                let recovered = sum(prior
                    .iter()
                    .filter(|p| {
                        p.kind == o.kind
                            && p.currency == o.currency
                            && p.partner_id == o.partner_id
                            && (o.kind == "certificate" || p.reference_id == o.reference_id)
                    })
                    .map(|p| p.advance))?;
                if add(recovered, o.advance)? > available {
                    return Err(err("El descuento de anticipo supera el anticipo registrado pendiente de recuperar"));
                }
            }
            if o.kind == "certificate" {
                o.index_snapshot = crate::adjustments::snapshot(
                    &tx,
                    estimate,
                    &o.period_end,
                    known.unwrap_or(&o.date),
                )?;
            }
            let factor = o.index_snapshot.as_ref().map_or(D::ONE, |s| s.factor);
            if o.index_snapshot.is_none() && o.extras.iter().any(|x| x.adjustable) {
                return Err(err("Un adicional ajustable requiere un acuerdo de índices en el presupuesto; configurá el acuerdo o declaralo de importe fijo"));
            }
            let eligible = add(
                base_work,
                sum(o
                    .extras
                    .iter()
                    .filter(|e| e.recover_advance)
                    .map(|e| e.amount))?,
            )?;
            let allocated = |amount: D, recover: bool| -> Result<D> {
                if o.advance_before_index && recover && eligible > D::ZERO {
                    div(mul(o.advance, amount)?, eligible)
                } else {
                    Ok(D::ZERO)
                }
            };
            let remaining_work = add(base_work, -allocated(base_work, true)?)?;
            let work_index_base = if o.advance_before_index {
                remaining_work
            } else {
                base_work
            };
            let mut gross = add(base_work, mul(work_index_base, add(factor, -D::ONE)?)?)?;
            let mut retention_basis = gross;
            let advance_basis = if o.advance_before_index {
                eligible
            } else {
                add(
                    mul(base_work, factor)?,
                    sum(o
                        .extras
                        .iter()
                        .filter(|e| e.recover_advance)
                        .map(|e| mul(e.amount, if e.adjustable { factor } else { D::ONE }))
                        .collect::<Result<Vec<_>>>()?
                        .into_iter())?,
                )?
            };
            let mut adjustable_base = work_index_base;
            let mut retention_adjustable_base = work_index_base;
            let mut extras_total = D::ZERO;
            for extra in &o.extras {
                let index_base = if extra.adjustable {
                    if o.advance_before_index {
                        add(
                            extra.amount,
                            -allocated(extra.amount, extra.recover_advance)?,
                        )?
                    } else {
                        extra.amount
                    }
                } else {
                    D::ZERO
                };
                let value = add(extra.amount, mul(index_base, add(factor, -D::ONE)?)?)?;
                extras_total = add(extras_total, value)?;
                gross = add(gross, value)?;
                if extra.retention {
                    retention_basis = add(retention_basis, value)?;
                }
                if extra.adjustable {
                    adjustable_base = add(adjustable_base, index_base)?;
                    if extra.retention {
                        retention_adjustable_base = add(retention_adjustable_base, index_base)?;
                    }
                }
            }
            o.calculated.insert(
                "index_adjustment".into(),
                mul(adjustable_base, add(factor, -D::ONE)?)?,
            );
            o.calculated.insert(
                "recovery_percent".into(),
                if eligible > D::ZERO {
                    mul(div(o.advance, eligible)?, 100.into())?
                } else {
                    D::ZERO
                },
            );
            let pending_differences = crate::adjustments::differences(&tx, &prior, &o.date)?;
            let mut unique = BTreeSet::new();
            let mut delta = D::ZERO;
            let mut retention_delta = D::ZERO;
            for id in &o.reconcile_ids {
                if !unique.insert(*id) {
                    return Err(err("Diferencia repetida"));
                }
                let source=prior.iter().find(|p|p.id==*id && p.kind=="certificate" && p.estimate_id==o.estimate_id && p.currency==o.currency && p.partner_id==o.partner_id && p.date<=o.date).ok_or_else(||err("La diferencia debe pertenecer al mismo presupuesto, moneda y comitente"))?;
                let d=pending_differences.iter().find(|d|d.source_id==source.id).ok_or_else(||err("La diferencia ya fue liquidada o no tiene una nueva publicación disponible"))?;
                delta = add(delta, d.delta)?;
                retention_delta = add(retention_delta, d.retention_delta)?;
                o.reconciliations.push(d.clone());
            }
            gross = add(gross, delta)?;
            if o.advance > advance_basis {
                return Err(err(
                    "El anticipo supera los conceptos habilitados para recuperación",
                ));
            }
            o.calculated.extend([
                ("base_work".into(), base_work),
                ("adjustable_base".into(), adjustable_base),
                (
                    "retention_adjustable_base".into(),
                    retention_adjustable_base,
                ),
                ("index_factor".into(), factor),
                ("extras".into(), extras_total),
                ("adjustment_difference".into(), delta),
            ]);
            previous = sum(prior
                .iter()
                .filter(|p| {
                    p.kind == o.kind
                        && p.estimate_id == o.estimate_id
                        && p.partner_id == o.partner_id
                        && (o.kind != "subcertificate" || p.reference_id == o.reference_id)
                })
                .map(|p| p.calculated.get("gross").copied().unwrap_or_default()))?;
            pending = if o.kind == "certificate" {
                let prior_base = sum(prior
                    .iter()
                    .filter(|p| {
                        p.kind == "certificate"
                            && p.estimate_id == o.estimate_id
                            && p.partner_id == o.partner_id
                    })
                    .map(|p| {
                        p.calculated.get("base_work").copied().unwrap_or_else(|| {
                            p.calculated.get("gross").copied().unwrap_or_default()
                        })
                    }))?;
                let base_pending = sub(sale, add(prior_base, base_work)?)?.max(D::ZERO);
                o.calculated.insert("pending_base".into(), base_pending);
                mul(base_pending, factor)?
            } else {
                sub(sale, add(previous, gross)?)?.max(D::ZERO)
            };
            let retention = add(
                div(mul(retention_basis, o.retention_percent)?, D::from(100))?,
                retention_delta,
            )?;
            let deductions = add(add(o.advance, o.discount)?, retention)?;
            if deductions > gross {
                return Err(err("El certificado resultaría con saldo negativo: conservá la diferencia a favor del comitente para un próximo certificado con saldo suficiente"));
            }
            o.amount = sub(gross, deductions)?;
            o.calculated.extend([
                ("previous".into(), previous),
                ("gross".into(), gross),
                ("retention".into(), retention),
                ("accumulated".into(), add(previous, gross)?),
                ("pending".into(), pending),
                ("net".into(), o.amount),
            ]);
            if o.kind == "subcertificate" {
                let r = reference.as_ref().unwrap();
                let already = sum(prior
                    .iter()
                    .filter(|p| p.kind == "subcertificate" && p.reference_id == Some(r.id))
                    .map(|p| p.calculated.get("gross").copied().unwrap_or(D::ZERO)))?;
                if add(already, gross)? > r.amount {
                    return Err(err("Certificación superior al monto del subcontrato"));
                }
            }
        }
        if o.kind == "index" {
            month(&o.index_period)?;
            if !["CAC", "IPC", "INDEC"].contains(&o.index_series.as_str())
                || o.index_source.trim().len() < 8
                || o.index_source.len() > 2000
                || !(o.index_source.starts_with("https://")
                    || o.index_source.starts_with("http://"))
                || o.index_value <= D::ZERO
            {
                return Err(err(
                    "Índice requiere serie CAC/IPC/INDEC, valor positivo y URL verificable",
                ));
            }
            if prior.iter().any(|p| {
                p.kind == "index"
                    && p.index_series == o.index_series
                    && p.index_period == o.index_period
            }) {
                return Err(err("Ya hay un índice para esa serie y período en la obra"));
            }
            if o.date < format!("{}-01", o.index_period) {
                return Err(err("El índice no puede publicarse antes de su período"));
            }
        }
        if o.kind == "adjustment" {
            month(&o.base_period)?;
            month(&o.target_period)?;
            if o.target_period < o.base_period
                || o.adjustment_weights.is_empty()
                || o.adjustment_weights.len() > 3
            {
                return Err(err("Períodos o fórmula de ajuste inválidos"));
            }
            let source = reference
                .as_ref()
                .ok_or_else(|| err("Seleccioná certificado de origen"))?;
            if source.index_snapshot.is_some() {
                return Err(err("Este certificado usa acuerdo de índices: incluí su diferencia pendiente en un certificado posterior"));
            }
            if !["certificate", "subcertificate"].contains(&source.kind.as_str()) {
                return Err(err("El ajuste requiere un certificado"));
            }
            let mut series = BTreeSet::new();
            let (mut weights, mut factor) = (D::ZERO, D::ZERO);
            let publications = crate::adjustments::points(&tx)?;
            for w in &o.adjustment_weights {
                if w.weight < D::ZERO || !series.insert(&w.series) {
                    return Err(err("Ponderadores negativos o series repetidas"));
                }
                weights = add(weights, w.weight)?;
                let find = |period: &str| {
                    prior
                        .iter()
                        .find(|p| {
                            p.kind == "index"
                                && p.index_series == w.series
                                && p.index_period == period
                                && p.date <= o.date
                        })
                        .map(|p| p.index_value)
                        .or_else(|| {
                            publications
                                .iter()
                                .filter(|p| {
                                    p.series == w.series
                                        && p.period == period
                                        && p.publication_date <= o.date
                                })
                                .max_by(|a, b| a.publication_date.cmp(&b.publication_date))
                                .map(|p| p.value)
                        })
                        .ok_or_else(|| {
                            err("Falta índice con fuente y fecha verificables para la fórmula")
                        })
                };
                factor = add(
                    factor,
                    mul(
                        w.weight,
                        div(find(&o.target_period)?, find(&o.base_period)?)?,
                    )?,
                )?;
            }
            if weights != D::ONE {
                return Err(err("Los ponderadores deben sumar exactamente 1"));
            }
            if prior
                .iter()
                .any(|p| p.kind == "adjustment" && p.reference_id == o.reference_id)
            {
                return Err(err("El certificado ya tiene un ajuste; no se duplica"));
            }
            let base = source
                .calculated
                .get("gross")
                .copied()
                .unwrap_or(source.amount);
            let delta = mul(base, sub(factor, D::ONE)?)?;
            o.amount = delta;
            o.calculated.extend([
                ("base".into(), base),
                ("factor".into(), factor),
                ("adjusted".into(), mul(base, factor)?),
                ("difference".into(), delta),
            ]);
        }
        if ["retention_payable", "retention_receivable"].contains(&o.kind.as_str()) {
            let source = reference
                .as_ref()
                .ok_or_else(|| err("Seleccioná certificado con fondo de reparo"))?;
            let expected = if o.kind == "retention_payable" {
                "subcertificate"
            } else {
                "certificate"
            };
            if source.kind != expected || source.partner_id != o.partner_id {
                return Err(err("Certificado incompatible con la liberación de reparo"));
            }
            let released = sum(prior
                .iter()
                .filter(|p| p.kind == o.kind && p.reference_id == o.reference_id)
                .map(|p| p.amount))?;
            let retained = source
                .calculated
                .get("retention")
                .copied()
                .unwrap_or_default();
            if o.amount <= D::ZERO || add(released, o.amount)? > retained {
                return Err(err("La liberación supera el fondo de reparo pendiente"));
            }
            date(&o.due_date)?;
        }
        if o.kind == "payable" && o.advance > D::ZERO {
            if o.reference_id.is_some()
                || o.price_cost.is_some()
                || o.partner_id.is_none()
                || o.period_start.is_empty()
                || o.period_end.is_empty()
            {
                return Err(err(
                    "La recuperación directa requiere cuadrilla, período y factura sin otro origen",
                ));
            }
            let is_crew: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM management_records WHERE id=?1 AND kind='crew')",
                [o.partner_id.unwrap().to_string()],
                |r| r.get(0),
            )?;
            if !is_crew {
                return Err(err(
                    "La recuperación directa es para liquidaciones de cuadrilla",
                ));
            }
            let paid = sum(prior
                .iter()
                .filter(|p| {
                    p.kind == "advance_paid"
                        && p.partner_id == o.partner_id
                        && p.currency == o.currency
                        && p.date <= o.date
                })
                .map(|p| p.amount))?;
            let recovered = sum(prior
                .iter()
                .filter(|p| {
                    matches!(p.kind.as_str(), "payable" | "subcertificate")
                        && p.partner_id == o.partner_id
                        && p.currency == o.currency
                })
                .map(|p| p.advance))?;
            if add(recovered, o.advance)? > paid || o.advance > o.amount {
                return Err(err(
                    "Recuperación superior al anticipo pendiente o al importe bruto",
                ));
            }
            o.calculated.insert("gross".into(), o.amount);
            o.amount = sub(o.amount, o.advance)?;
        } else if o.kind == "payable" {
            o.calculated.insert("gross".into(), o.amount);
        }
        if ["payable", "receivable"].contains(&o.kind.as_str()) {
            date(&o.due_date)?;
            if o.due_date < o.date
                || o.amount < D::ZERO
                || (o.amount == D::ZERO && o.advance == D::ZERO)
            {
                return Err(err(
                    "Factura: monto positivo y vencimiento no anterior a la emisión",
                ));
            }
            if let Some(r) = &reference {
                let allowed = if o.kind == "payable" {
                    ["receipt", "service_receipt", "subcertificate", "adjustment"]
                        .contains(&r.kind.as_str())
                } else {
                    ["certificate", "adjustment"].contains(&r.kind.as_str())
                };
                if o.kind == "payable"
                    && r.kind == "receipt"
                    && prior
                        .iter()
                        .any(|p| p.kind == "payment" && p.reference_id == r.reference_id)
                {
                    return Err(err("Este pedido tiene pagos directos registrados; no generes una deuda duplicada por su recepción"));
                }
                if !allowed || r.partner_id != o.partner_id {
                    return Err(err("Origen de factura incompatible"));
                }
                let billed = sum(prior
                    .iter()
                    .filter(|p| p.kind == o.kind && p.reference_id == Some(r.id))
                    .map(|p| p.amount))?;
                let settled = sum(prior
                    .iter()
                    .filter(|p| {
                        ["payment", "collection"].contains(&p.kind.as_str())
                            && p.reference_id == Some(r.id)
                    })
                    .map(|p| p.amount))?;
                if add(add(billed, settled)?, o.amount)? > r.amount {
                    return Err(err(
                        "La facturación supera el saldo del documento de origen",
                    ));
                }
            }
        }
        if ["payment", "collection"].contains(&o.kind.as_str()) {
            let r = reference
                .as_ref()
                .ok_or_else(|| err("Seleccioná factura o certificado de origen"))?;
            let valid = if o.kind == "payment" {
                [
                    "payable",
                    "subcertificate",
                    "retention_payable",
                    "purchase_order",
                ]
                .contains(&r.kind.as_str())
            } else {
                ["receivable", "certificate", "retention_receivable"].contains(&r.kind.as_str())
            };
            if !valid || r.partner_id != o.partner_id {
                return Err(err("Origen o contraparte del pago/cobro incompatible"));
            }
            if prior.iter().any(|p| {
                ["payable", "receivable"].contains(&p.kind.as_str()) && p.reference_id == Some(r.id)
            }) {
                return Err(err(
                    "El documento ya fue facturado; aplicá el pago/cobro a la factura",
                ));
            }
            if r.kind == "purchase_order" {
                let children: BTreeSet<_> = prior
                    .iter()
                    .filter(|p| p.reference_id == Some(r.id))
                    .map(|p| p.id)
                    .collect();
                let bills: BTreeSet<_> = prior
                    .iter()
                    .filter(|p| {
                        p.kind == "payable"
                            && p.reference_id.is_some_and(|id| children.contains(&id))
                    })
                    .map(|p| p.id)
                    .collect();
                let paid = sum(prior
                    .iter()
                    .filter(|p| {
                        p.kind == "payment"
                            && p.reference_id.is_some_and(|id| {
                                id == r.id || children.contains(&id) || bills.contains(&id)
                            })
                    })
                    .map(|p| p.amount))?;
                if add(paid, o.amount)? > r.amount {
                    return Err(err("El pago supera el saldo total del pedido"));
                }
                if prior.iter().any(|p| {
                    p.kind == "payable" && p.reference_id.is_some_and(|id| children.contains(&id))
                }) {
                    return Err(err("El pedido tiene facturas; registrá sus pagos desde Finanzas para conciliarlas"));
                }
            }
            let paid = sum(prior
                .iter()
                .filter(|p| p.kind == o.kind && p.reference_id == Some(r.id))
                .map(|p| p.amount))?;
            if o.amount <= D::ZERO || add(paid, o.amount)? > r.amount {
                return Err(err("El pago/cobro debe ser positivo y no superar el saldo"));
            }
        }
        if o.kind == "forecast" {
            if o.amount < D::ZERO {
                return Err(err("Costo a terminar negativo"));
            }
            date(&o.due_date)?;
            if o.due_date < o.date {
                return Err(err("Fecha prevista anterior a la proyección"));
            }
        }
        tx.execute("INSERT INTO operation_documents(id,project_id,kind,date,reference_id,payload,partner_id,estimate_id,warehouse_id,destination_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![o.id.to_string(),o.project_id.to_string(),o.kind,o.date,o.reference_id.map(|x|x.to_string()),serde_json::to_string(&o)?,o.partner_id.map(|x|x.to_string()),o.estimate_id.map(|x|x.to_string()),o.warehouse_id.map(|x|x.to_string()),o.destination_id.map(|x|x.to_string())])?;
        for (i, l) in o.lines.iter().enumerate() {
            let archived = if let Some(id) = l.line_id {
                tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM deleted_estimate_lines WHERE id=?1)",
                    [id.to_string()],
                    |r| r.get::<_, bool>(0),
                )?
            } else {
                false
            };
            tx.execute("INSERT INTO operation_links(document_id,position,resource_id,line_id,center_id,archived_line_id) VALUES (?1,?2,?3,?4,?5,?6)",params![o.id.to_string(),i as i64,l.resource_id.map(|x|x.to_string()),if archived{None}else{l.line_id.map(|x|x.to_string())},l.center_id.map(|x|x.to_string()),if archived{l.line_id.map(|x|x.to_string())}else{None}])?;
        }
        if [
            "stock_opening",
            "receipt",
            "consumption",
            "return",
            "transfer",
        ]
        .contains(&o.kind.as_str())
        {
            for (i, l) in o.lines.iter().enumerate() {
                let sign = if ["consumption", "transfer"].contains(&o.kind.as_str()) {
                    -D::ONE
                } else {
                    D::ONE
                };
                let wh = o.warehouse_id.unwrap();
                let resource = l.resource_id.unwrap();
                let value = o.calculated[&format!("line_value:{i}")];
                tx.execute("INSERT INTO operation_stock(document_id,position,warehouse_id,resource_id,quantity,value,currency) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![o.id.to_string(),i as i64,wh.to_string(),resource.to_string(),mul(sign,l.quantity)?.to_string(),mul(sign,value)?.to_string(),o.currency])?;
                if o.kind == "transfer" {
                    tx.execute("INSERT INTO operation_stock(document_id,position,warehouse_id,resource_id,quantity,value,currency) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![o.id.to_string(),i as i64,o.destination_id.unwrap().to_string(),resource.to_string(),l.quantity.to_string(),value.to_string(),o.currency])?;
                }
            }
        }
        if let Some(request) = &o.quotation_request {
            tx.execute(
                "INSERT INTO quotation_requests(id,request_json) VALUES(?1,?2)",
                params![o.id.to_string(), serde_json::to_string(request)?],
            )?;
        }
        for source in &o.progress_sources {
            tx.execute("INSERT INTO certified_sources(document_id,source_id,line_id,quantity) VALUES(?1,?2,?3,?4)",params![o.id.to_string(),source.source_id.to_string(),source.line_id.to_string(),source.quantity.to_string()])?;
        }
        if ["certificate", "subcertificate"].contains(&o.kind.as_str()) {
            let sheet = crate::construction_workflow::sheet(&tx, &o, false)?;
            tx.execute(
                "INSERT INTO certificate_sheets(operation_id,sheet_json) VALUES(?1,?2)",
                params![o.id.to_string(), serde_json::to_string(&sheet)?],
            )?;
        }
        if let Some((id, _)) = draft {
            let json: String = tx.query_row(
                "SELECT payload_json FROM certificate_drafts WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )?;
            let mut d: crate::construction_workflow::CertificateDraft =
                serde_json::from_str(&json)?;
            d.issued_id = Some(o.id);
            d.operation = o.clone();
            tx.execute(
                "UPDATE certificate_drafts SET issued_id=?1,payload_json=?2 WHERE id=?3",
                params![o.id.to_string(), serde_json::to_string(&d)?, id.to_string()],
            )?;
        }
        if preview {
            tx.rollback()?;
        } else {
            tx.commit()?;
        }
        Ok(o)
    }
}

#[derive(Debug, Default, Serialize)]
pub struct FinancialSummary {
    pub expected_margin_percent: Option<D>,
    pub cost_deviation: D,
    pub expected_cost_deviation: D,
    pub advance_paid_balance: D,
    pub advance_received_balance: D,
    pub retained_payable: D,
    pub retained_receivable: D,
    pub currency: String,
    pub budget_cost: D,
    pub budget_sale: D,
    pub committed: D,
    pub accrued: D,
    pub paid: D,
    pub collected: D,
    pub payable: D,
    pub receivable: D,
    pub overdue_payable: D,
    pub overdue_receivable: D,
    pub cash: D,
    pub cost_to_finish: D,
    pub expected_result: D,
    pub physical_percent: D,
    pub certified: D,
}
#[derive(Debug, Serialize)]
pub struct CashPeriod {
    pub month: String,
    pub currency: String,
    pub planned_in: D,
    pub planned_out: D,
    pub actual_in: D,
    pub actual_out: D,
}
#[derive(Debug, Serialize)]
pub struct ProductionStatus {
    pub line_id: Uuid,
    pub description: String,
    pub section: String,
    pub planned_quantity: D,
    pub executed_quantity: D,
    pub percent: D,
    pub hours: D,
    pub actual_hours_per_unit: Option<D>,
    pub planned_hours_per_unit: Option<D>,
    pub productivity_variance: Option<D>,
}
#[derive(Debug, Serialize)]
pub struct CostGroup {
    pub line_description: String,
    pub certified_income: D,
    pub result: D,
    pub line_id: Option<Uuid>,
    pub center_id: Option<Uuid>,
    pub currency: String,
    pub actual: D,
}
#[derive(Debug, Default, Serialize)]
pub struct SectionResult {
    pub section: String,
    pub currency: String,
    pub budget_cost: D,
    pub certified_income: D,
    pub actual_cost: D,
    pub result: D,
    pub variance: D,
}
#[derive(Debug, Serialize)]
pub struct QuoteComparison {
    pub reference_id: Option<Uuid>,
    pub quote_id: Uuid,
    pub partner_id: Option<Uuid>,
    pub currency: String,
    pub number: String,
    pub total: D,
    pub complete: bool,
}
#[derive(Debug, Serialize)]
pub struct MaterialNeed {
    pub resource_id: Uuid,
    pub description: String,
    pub required: D,
    pub requested: D,
    pub ordered: D,
    pub received: D,
    pub consumed: D,
    pub stock: D,
    pub shortage: D,
}
#[derive(Debug, Serialize)]
pub struct ProjectOperationsReport {
    pub project_id: Uuid,
    pub name: String,
    pub as_of: String,
    pub estimate_id: Option<Uuid>,
    pub summaries: Vec<FinancialSummary>,
    pub cash_flow: Vec<CashPeriod>,
    pub recurring_costs: Vec<RecurringExpense>,
    pub financial_projection: Option<crate::financial_planning::FinancialProjection>,
    pub certified_percent: D,
    pub approved_pending_percent: D,
    pub production: Vec<ProductionStatus>,
    pub costs: Vec<CostGroup>,
    pub section_results: Vec<SectionResult>,
    pub quotes: Vec<QuoteComparison>,
    pub needs: Vec<MaterialNeed>,
    pub alerts: Vec<String>,
    pub scheduled_finish: Option<String>,
    pub planned_percent: Option<D>,
}
impl LocalStore {
    pub fn operations_report(
        &self,
        project_id: Uuid,
        estimate_id: Option<Uuid>,
        as_of: &str,
    ) -> Result<ProjectOperationsReport> {
        date(as_of)?;
        let project = self
            .get_project(project_id)?
            .ok_or_else(|| err("Obra inexistente"))?;
        let docs: Vec<_> = self
            .operation_documents(Some(project_id))?
            .into_iter()
            .filter(|o| o.date.as_str() <= as_of)
            .collect();
        let estimate = if let Some(id) = estimate_id {
            let e = self
                .get_estimate(id)?
                .ok_or_else(|| err("Presupuesto inexistente"))?;
            if e.project_id != project_id {
                return Err(err("Presupuesto ajeno a la obra"));
            }
            Some(e)
        } else {
            let mut es = self.list_project_estimates(project_id)?;
            let issued = es.iter().position(|e| e.issued);
            issued
                .map(|i| es.remove(i))
                .or_else(|| es.into_iter().next())
        };
        let mut summaries = BTreeMap::<String, FinancialSummary>::new();
        let mut production = vec![];
        let mut requirements = BTreeMap::<Uuid, D>::new();
        let mut alerts = vec![];
        if let Some(e) = &estimate {
            let currency = match e.currency {
                cpobras_core::Currency::Ars => "ARS",
                cpobras_core::Currency::Usd => "USD",
            };
            let s = summaries.entry(currency.into()).or_default();
            s.currency = currency.into();
            s.budget_cost = self.estimate_total(e.id)?;
            s.budget_sale = self.priced_estimate_total(e.id)?.total;
            if !e.issued {
                alerts.push("El presupuesto de referencia aún es un borrador".into());
            }
            let sections = self.list_budget_sections(e.id)?;
            let assignments: BTreeMap<_, _> = self.list_line_sections(e.id)?.into_iter().collect();
            let mut earned = D::ZERO;
            for l in self.estimate_items(e.id)? {
                let executed = sum(docs
                    .iter()
                    .filter(|o| o.kind == "daily")
                    .flat_map(|o| &o.lines)
                    .filter(|x| x.line_id == Some(l.id) && x.entry_type == "production")
                    .map(|x| x.quantity))?;
                let hours = sum(docs
                    .iter()
                    .filter(|o| o.kind == "daily")
                    .flat_map(|o| &o.lines)
                    .filter(|x| x.line_id == Some(l.id) && x.entry_type != "equipment")
                    .map(|x| x.hours))?;
                let actual = if executed > D::ZERO {
                    Some(div(hours, executed)?)
                } else {
                    None
                };
                let mut planned_hours = None;
                if let Some(id) = l.analysis_id {
                    if let Some(analysis) = self.get_analysis(id)? {
                        let mut planned = D::ZERO;
                        let mut has_labor = false;
                        let mut comparable = true;
                        for component in analysis.components {
                            if component.kind == cpobras_core::ResourceKind::Material {
                                let required = mul(l.quantity, component.quantity_per_unit)?;
                                let old = requirements
                                    .get(&component.resource_id)
                                    .copied()
                                    .unwrap_or_default();
                                requirements.insert(component.resource_id, add(old, required)?);
                            }
                            if component.kind == cpobras_core::ResourceKind::Labor {
                                planned = add(planned, component.quantity_per_unit)?;
                                has_labor = true;
                                if !self.get_resource(component.resource_id)?.is_some_and(|r| {
                                    ["h", "hs", "hora", "horas"]
                                        .contains(&r.unit.to_lowercase().as_str())
                                }) {
                                    comparable = false;
                                }
                            }
                        }
                        if has_labor && comparable {
                            planned_hours = Some(planned);
                        }
                    }
                }
                let variance = if let (Some(a), Some(p)) = (actual, planned_hours) {
                    if p > D::ZERO {
                        Some(mul(div(sub(a, p)?, p)?, D::from(100))?)
                    } else {
                        None
                    }
                } else {
                    None
                };
                earned = add(earned, mul(executed.min(l.quantity), l.unit_cost_snapshot)?)?;
                production.push(ProductionStatus {
                    line_id: l.id,
                    description: l.description,
                    section: assignments
                        .get(&l.id)
                        .and_then(|id| sections.iter().find(|x| x.id == *id))
                        .map(|x| format!("{} · {}", x.code, x.title))
                        .unwrap_or_else(|| "Sin rubro".into()),
                    planned_quantity: l.quantity,
                    executed_quantity: executed,
                    percent: if l.quantity > D::ZERO {
                        mul(div(executed, l.quantity)?, D::from(100))?
                    } else {
                        D::ZERO
                    },
                    hours,
                    actual_hours_per_unit: actual,
                    planned_hours_per_unit: planned_hours,
                    productivity_variance: variance,
                });
            }
            s.physical_percent = if s.budget_cost > D::ZERO {
                mul(div(earned, s.budget_cost)?, D::from(100))?
            } else {
                D::ZERO
            };
        } else {
            alerts.push("Sin presupuesto de referencia".into());
        }
        let mut cash = BTreeMap::<(String, String), CashPeriod>::new();
        let mut costs = BTreeMap::<(Option<Uuid>, Option<Uuid>, String), D>::new();
        let mut quotes = vec![];
        let mut incomes = BTreeMap::<(Option<Uuid>, Option<Uuid>, String), D>::new();
        for o in &docs {
            let s = summaries.entry(o.currency.clone()).or_default();
            s.currency = o.currency.clone();
            if ["purchase_order", "service_order", "subcontract"].contains(&o.kind.as_str()) {
                s.committed = add(s.committed, o.amount)?;
            }
            if ["consumption", "service_receipt", "daily"].contains(&o.kind.as_str())
                || o.kind == "return"
            {
                let sign = if o.kind == "return" { -D::ONE } else { D::ONE };
                s.accrued = add(s.accrued, mul(sign, o.amount)?)?;
                for (i, l) in o.lines.iter().enumerate() {
                    let cost = o
                        .calculated
                        .get(&format!("line_value:{i}"))
                        .copied()
                        .map(Ok)
                        .unwrap_or_else(|| {
                            mul(
                                if o.kind == "daily" {
                                    l.hours
                                } else {
                                    l.quantity
                                },
                                l.unit_price,
                            )
                        })?;
                    let key = (l.line_id, l.center_id, o.currency.clone());
                    let old = costs.get(&key).copied().unwrap_or_default();
                    costs.insert(key, add(old, mul(sign, cost)?)?);
                }
            }
            if o.kind == "subcertificate"
                && o.reference_id
                    .and_then(|id| docs.iter().find(|r| r.id == id))
                    .is_some_and(|c| c.contract_terms.is_some())
            {
                let gross = o.calculated.get("base_work").copied().unwrap_or(o.amount);
                s.accrued = add(s.accrued, gross)?;
                let physical = sum(o
                    .lines
                    .iter()
                    .map(|l| mul(l.quantity, l.unit_price))
                    .collect::<Result<Vec<_>>>()?
                    .into_iter())?;
                if physical > D::ZERO {
                    for l in &o.lines {
                        let amount = mul(div(mul(l.quantity, l.unit_price)?, physical)?, gross)?;
                        let key = (l.line_id, l.center_id, o.currency.clone());
                        let old = costs.get(&key).copied().unwrap_or_default();
                        costs.insert(key, add(old, amount)?);
                    }
                } else {
                    let key = (None, None, o.currency.clone());
                    let old = costs.get(&key).copied().unwrap_or_default();
                    costs.insert(key, add(old, gross)?);
                }
            }
            if o.kind == "certificate" {
                for l in &o.lines {
                    let key = (l.line_id, l.center_id, o.currency.clone());
                    let old = incomes.get(&key).copied().unwrap_or_default();
                    incomes.insert(
                        key,
                        add(
                            old,
                            mul(
                                mul(l.quantity, l.unit_price)?,
                                o.index_snapshot.as_ref().map_or(D::ONE, |s| s.factor),
                            )?,
                        )?,
                    );
                }
            }
            if o.kind == "certificate" {
                let additional = add(
                    o.calculated.get("extras").copied().unwrap_or_default(),
                    o.calculated
                        .get("adjustment_difference")
                        .copied()
                        .unwrap_or_default(),
                )?;
                if additional != D::ZERO {
                    let key = (None, None, o.currency.clone());
                    let old = incomes.get(&key).copied().unwrap_or_default();
                    incomes.insert(key, add(old, additional)?);
                }
            }
            if o.kind == "adjustment" {
                if o.reference_id
                    .and_then(|id| docs.iter().find(|p| p.id == id))
                    .is_some_and(|p| p.kind == "certificate")
                {
                    let key = (None, None, o.currency.clone());
                    let old = incomes.get(&key).copied().unwrap_or_default();
                    incomes.insert(key, add(old, o.amount)?);
                }
            }
            if o.kind == "certificate" {
                s.certified = add(
                    s.certified,
                    o.calculated.get("gross").copied().unwrap_or_default(),
                )?;
            }
            if ["payment", "advance_paid"].contains(&o.kind.as_str()) {
                s.paid = add(s.paid, o.amount)?;
            }
            if ["collection", "advance_received"].contains(&o.kind.as_str()) {
                s.collected = add(s.collected, o.amount)?;
            }
            if o.kind == "advance_paid" {
                s.advance_paid_balance = add(s.advance_paid_balance, o.amount)?;
            }
            if o.kind == "advance_received" {
                s.advance_received_balance = add(s.advance_received_balance, o.amount)?;
            }
            if o.kind == "subcertificate" || o.kind == "payable" {
                s.advance_paid_balance = sub(s.advance_paid_balance, o.advance)?;
                s.retained_payable = add(
                    s.retained_payable,
                    o.calculated.get("retention").copied().unwrap_or_default(),
                )?;
            }
            if o.kind == "certificate" {
                s.advance_received_balance = sub(s.advance_received_balance, o.advance)?;
                s.retained_receivable = add(
                    s.retained_receivable,
                    o.calculated.get("retention").copied().unwrap_or_default(),
                )?;
            }
            if o.kind == "retention_payable" {
                s.retained_payable = sub(s.retained_payable, o.amount)?;
            }
            if o.kind == "retention_receivable" {
                s.retained_receivable = sub(s.retained_receivable, o.amount)?;
            }
            let expected_kind = match o.kind.as_str() {
                "payable" | "subcertificate" | "retention_payable" => Some("payment"),
                "receivable" | "certificate" | "retention_receivable" => Some("collection"),
                _ => None,
            };
            if let Some(kind) = expected_kind {
                // A certificate that has been invoiced is represented by its invoice, preventing double counting.
                let invoices = sum(docs
                    .iter()
                    .filter(|p| {
                        ["payable", "receivable"].contains(&p.kind.as_str())
                            && p.reference_id == Some(o.id)
                    })
                    .map(|p| p.amount))?;
                let settled = sum(docs
                    .iter()
                    .filter(|p| p.kind == kind && p.reference_id == Some(o.id))
                    .map(|p| p.amount))?;
                let open = sub(sub(o.amount, invoices)?, settled)?;
                let due = if o.due_date.is_empty() {
                    o.date.as_str()
                } else {
                    &o.due_date
                };
                if kind == "payment" {
                    s.payable = add(s.payable, open)?;
                    if due < as_of {
                        s.overdue_payable = add(s.overdue_payable, open)?;
                    }
                } else {
                    s.receivable = add(s.receivable, open)?;
                    if due < as_of {
                        s.overdue_receivable = add(s.overdue_receivable, open)?;
                    }
                }
                let key = (due[..7].into(), o.currency.clone());
                let p = cash.entry(key).or_insert(CashPeriod {
                    month: due[..7].into(),
                    currency: o.currency.clone(),
                    planned_in: D::ZERO,
                    planned_out: D::ZERO,
                    actual_in: D::ZERO,
                    actual_out: D::ZERO,
                });
                let expected = sub(o.amount, invoices)?;
                if kind == "payment" {
                    p.planned_out = add(p.planned_out, expected)?;
                } else {
                    p.planned_in = add(p.planned_in, expected)?;
                }
            }
            if ["payment", "collection", "advance_paid", "advance_received"]
                .contains(&o.kind.as_str())
            {
                let key = (o.date[..7].into(), o.currency.clone());
                let p = cash.entry(key).or_insert(CashPeriod {
                    month: o.date[..7].into(),
                    currency: o.currency.clone(),
                    planned_in: D::ZERO,
                    planned_out: D::ZERO,
                    actual_in: D::ZERO,
                    actual_out: D::ZERO,
                });
                if ["payment", "advance_paid"].contains(&o.kind.as_str()) {
                    p.actual_out = add(p.actual_out, o.amount)?;
                } else {
                    p.actual_in = add(p.actual_in, o.amount)?;
                }
            }
            if ["purchase_order", "service_order", "subcontract"].contains(&o.kind.as_str()) {
                let descendants: BTreeSet<_> = docs
                    .iter()
                    .filter(|p| {
                        p.reference_id == Some(o.id)
                            && ["receipt", "service_receipt"].contains(&p.kind.as_str())
                    })
                    .map(|p| p.id)
                    .collect();
                let invoiced = sum(docs
                    .iter()
                    .filter(|p| {
                        p.kind == "payable"
                            && p.reference_id
                                .is_some_and(|id| descendants.contains(&id) || id == o.id)
                    })
                    .map(|p| p.amount))?;
                let certified = sum(docs
                    .iter()
                    .filter(|p| p.kind == "subcertificate" && p.reference_id == Some(o.id))
                    .map(|p| p.calculated.get("gross").copied().unwrap_or_default()))?;
                let advances = sum(docs
                    .iter()
                    .filter(|p| p.kind == "advance_paid" && p.reference_id == Some(o.id))
                    .map(|p| p.amount))?;
                let direct_paid = sum(docs
                    .iter()
                    .filter(|p| p.kind == "payment" && p.reference_id == Some(o.id))
                    .map(|p| p.amount))?;
                let remaining = sub(
                    sub(sub(o.amount, invoiced.max(certified))?, advances)?,
                    direct_paid,
                )?
                .max(D::ZERO);
                let due = if o.due_date.is_empty() {
                    o.date.as_str()
                } else {
                    &o.due_date
                };
                let p = cash
                    .entry((due[..7].into(), o.currency.clone()))
                    .or_insert(CashPeriod {
                        month: due[..7].into(),
                        currency: o.currency.clone(),
                        planned_in: D::ZERO,
                        planned_out: D::ZERO,
                        actual_in: D::ZERO,
                        actual_out: D::ZERO,
                    });
                p.planned_out = add(p.planned_out, remaining)?;
            }
            if o.kind == "quote" {
                let origin = o
                    .reference_id
                    .and_then(|id| docs.iter().find(|d| d.id == id));
                let complete = origin.is_some_and(|r| {
                    r.lines.len() == o.lines.len()
                        && r.lines.iter().all(|l| {
                            o.lines.iter().any(|x| {
                                x.resource_id == l.resource_id
                                    && x.description == l.description
                                    && x.quantity == l.quantity
                            })
                        })
                });
                quotes.push(QuoteComparison {
                    reference_id: o.reference_id,
                    quote_id: o.id,
                    partner_id: o.partner_id,
                    currency: o.currency.clone(),
                    number: o.number.clone(),
                    total: o.amount,
                    complete,
                });
            }
        }
        for s in summaries.values_mut() {
            s.cash = sub(s.collected, s.paid)?;
            let forecast = docs
                .iter()
                .rev()
                .find(|o| o.kind == "forecast" && o.currency == s.currency);
            s.cost_to_finish = if let Some(f) = forecast {
                f.amount
            } else {
                mul(
                    s.budget_cost,
                    sub(D::ONE, div(s.physical_percent, D::from(100))?)?,
                )?
            };
            s.expected_result = sub(s.budget_sale, add(s.accrued, s.cost_to_finish)?)?;
            s.expected_margin_percent = if s.budget_sale > D::ZERO {
                Some(mul(div(s.expected_result, s.budget_sale)?, D::from(100))?)
            } else {
                None
            };
            s.cost_deviation = sub(
                s.accrued,
                mul(s.budget_cost, div(s.physical_percent, D::from(100))?)?,
            )?;
            s.expected_cost_deviation = sub(add(s.accrued, s.cost_to_finish)?, s.budget_cost)?;
            if s.overdue_payable > D::ZERO || s.overdue_receivable > D::ZERO {
                alerts.push(format!("{}: hay vencimientos pendientes", s.currency));
            }
            if s.accrued > s.budget_cost && s.budget_cost > D::ZERO {
                alerts.push(format!(
                    "{}: costo real superior al presupuesto",
                    s.currency
                ));
            }
        }
        let warehouses = self.operation_warehouses()?;
        let stock = self.operation_stock(as_of)?;
        let mut needs = vec![];
        for (resource_id, required) in requirements {
            let qty = |kind: &str| {
                sum(docs
                    .iter()
                    .filter(|o| o.kind == kind)
                    .flat_map(|o| &o.lines)
                    .filter(|l| l.resource_id == Some(resource_id))
                    .map(|l| l.quantity))
            };
            let available = sum(stock
                .iter()
                .filter(|b| {
                    b.resource_id == resource_id
                        && warehouses
                            .iter()
                            .any(|w| w.id == b.warehouse_id && w.project_id == project_id)
                })
                .map(|b| b.quantity))?;
            let consumed = sub(qty("consumption")?, qty("return")?)?;
            let shortage = sub(sub(required, consumed)?, available)?.max(D::ZERO);
            needs.push(MaterialNeed {
                resource_id,
                description: self
                    .get_resource(resource_id)?
                    .map(|r| r.description)
                    .unwrap_or_default(),
                required,
                requested: qty("request")?,
                ordered: qty("purchase_order")?,
                received: qty("receipt")?,
                consumed,
                stock: available,
                shortage,
            });
        }
        let (mut scheduled_finish, mut planned_percent) = (None, None);
        if let Some(saved) = self.project_plan(project_id)? {
            let schedule = saved
                .plan
                .schedule(as_of)
                .map_err(|e| err(&e.to_string()))?;
            scheduled_finish = Some(schedule.finish.clone());
            planned_percent = Some(schedule.planned_progress);
            alerts.extend(schedule.warnings);
            if schedule.finish.as_str() < as_of
                && summaries
                    .values()
                    .any(|s| s.physical_percent < D::from(100))
            {
                alerts.push("Plazo programado vencido con producción pendiente".into());
            }
        }
        let mut groups = vec![];
        for key in incomes.keys() {
            costs.entry(key.clone()).or_default();
        }
        let mut section_results = BTreeMap::<(String, String), SectionResult>::new();
        if let Some(e) = &estimate {
            let currency = match e.currency {
                cpobras_core::Currency::Ars => "ARS",
                cpobras_core::Currency::Usd => "USD",
            };
            for l in self.estimate_items(e.id)? {
                let section = production
                    .iter()
                    .find(|p| p.line_id == l.id)
                    .map(|p| p.section.clone())
                    .unwrap_or_else(|| "Sin rubro".into());
                let row = section_results
                    .entry((section.clone(), currency.into()))
                    .or_default();
                row.section = section;
                row.currency = currency.into();
                row.budget_cost = add(row.budget_cost, mul(l.quantity, l.unit_cost_snapshot)?)?;
            }
        }
        for ((line_id, center_id, currency), actual) in costs {
            let income = incomes
                .get(&(line_id, center_id, currency.clone()))
                .copied()
                .unwrap_or_default();
            let section = line_id
                .and_then(|id| production.iter().find(|p| p.line_id == id))
                .map(|p| p.section.clone())
                .unwrap_or_else(|| "Sin rubro / fuera del presupuesto de referencia".into());
            let row = section_results
                .entry((section.clone(), currency.clone()))
                .or_default();
            row.section = section;
            row.currency = currency.clone();
            row.actual_cost = add(row.actual_cost, actual)?;
            row.certified_income = add(row.certified_income, income)?;
            let line_description = if let Some(id) = line_id {
                self.conn.query_row("SELECT description FROM estimate_lines WHERE id=?1 UNION ALL SELECT json_extract(line_json,'$.description') || ' (eliminada)' FROM deleted_estimate_lines WHERE id=?1 LIMIT 1",[id.to_string()],|r|r.get::<_,String>(0)).optional()?.unwrap_or_else(||"Sin partida".into())
            } else {
                "Sin partida".into()
            };
            groups.push(CostGroup {
                line_description,
                line_id,
                center_id,
                currency,
                actual,
                certified_income: income,
                result: sub(income, actual)?,
            });
        }
        for row in section_results.values_mut() {
            row.result = sub(row.certified_income, row.actual_cost)?;
            row.variance = sub(row.actual_cost, row.budget_cost)?;
        }
        let mut recurring_costs = vec![];
        if let Some(e) = &estimate {
            let saved = self.get_price_definition(e.id)?;
            for row in &saved.definition.rows {
                if !row.enabled
                    || row.subtract
                    || row.kind != cpobras_core::price_determination::PriceKind::Detailed
                    || row.detail_mode != cpobras_core::price_determination::DetailMode::Items
                {
                    continue;
                }
                for item in &row.items {
                    for period in item.payments().map_err(StorageError::InvalidValue)? {
                        let invoiced = sum(docs
                            .iter()
                            .filter(|o| {
                                o.kind == "payable"
                                    && o.estimate_id == Some(e.id)
                                    && o.price_cost.as_ref().is_some_and(|l| {
                                        l.row_id == row.id
                                            && l.item_id == item.id
                                            && l.period_start == period.period_start
                                    })
                            })
                            .map(|o| o.amount))?;
                        let unbilled = sub(period.amount, invoiced)?.max(D::ZERO);
                        let currency = match e.currency {
                            cpobras_core::Currency::Ars => "ARS",
                            cpobras_core::Currency::Usd => "USD",
                        }
                        .to_string();
                        let entry = cash
                            .entry((period.due_date[..7].into(), currency.clone()))
                            .or_insert(CashPeriod {
                                month: period.due_date[..7].into(),
                                currency: currency.clone(),
                                planned_in: D::ZERO,
                                planned_out: D::ZERO,
                                actual_in: D::ZERO,
                                actual_out: D::ZERO,
                            });
                        entry.planned_out = add(entry.planned_out, unbilled)?;
                        if invoiced > period.amount {
                            alerts.push(format!(
                                "{}: lo facturado en {} supera el alquiler previsto",
                                item.description, period.period_start
                            ));
                        }
                        recurring_costs.push(RecurringExpense {
                            row_id: row.id,
                            item_id: item.id,
                            description: item.description.clone(),
                            currency,
                            period_start: period.period_start,
                            period_end: period.period_end,
                            due_date: period.due_date,
                            amount: period.amount,
                            invoiced,
                            unbilled,
                        });
                    }
                }
            }
        }
        let financial_projection = self.financial_projection(
            project_id,
            estimate.as_ref().map(|e| e.id),
            as_of,
            &recurring_costs,
        )?;
        let mut certified_percent = D::ZERO;
        let mut approved_pending_percent = D::ZERO;
        if let Some(id) = estimate_id {
            let items = self.estimate_items(id)?;
            let total = sum(items
                .iter()
                .map(|l| mul(l.quantity, l.unit_cost_snapshot))
                .collect::<Result<Vec<_>>>()?
                .into_iter())?;
            if total > D::ZERO {
                let approved = self.available_progress(project_id, id)?;
                let mut certified = D::ZERO;
                let mut pending = D::ZERO;
                for l in &items {
                    let q = sum(docs
                        .iter()
                        .filter(|o| o.kind == "certificate" && o.estimate_id == Some(id))
                        .flat_map(|o| &o.lines)
                        .filter(|x| x.line_id == Some(l.id))
                        .map(|x| x.quantity))?;
                    certified = add(certified, mul(q, l.unit_cost_snapshot)?)?;
                    let q = sum(approved
                        .iter()
                        .filter(|x| x.line_id == l.id)
                        .map(|x| x.quantity))?;
                    pending = add(pending, mul(q, l.unit_cost_snapshot)?)?;
                }
                certified_percent = mul(div(certified, total)?, 100.into())?;
                approved_pending_percent = mul(div(pending, total)?, 100.into())?;
            }
        }
        Ok(ProjectOperationsReport {
            project_id,
            name: project.name,
            as_of: as_of.into(),
            estimate_id: estimate.map(|e| e.id),
            summaries: summaries.into_values().collect(),
            cash_flow: cash.into_values().collect(),
            recurring_costs,
            financial_projection,
            certified_percent,
            approved_pending_percent,
            production,
            costs: groups,
            section_results: section_results.into_values().collect(),
            quotes,
            needs,
            alerts,
            scheduled_finish,
            planned_percent,
        })
    }
    pub fn operations_portfolio(&self, as_of: &str) -> Result<Vec<ProjectOperationsReport>> {
        self.list_projects()?
            .iter()
            .map(|p| self.operations_report(p.id, None, as_of))
            .collect()
    }
}
