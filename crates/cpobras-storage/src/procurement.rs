use crate::{
    construction_workflow::{add, invalid, sum, ContractTerms},
    operations::{Operation, OperationLine},
    quotation_workflow::{QuotationRequest, QuotedPrice},
    LocalStore, Result,
};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuoteResponse {
    pub id: Uuid,
    pub request_id: Uuid,
    pub supplier_id: Uuid,
    pub revision: u32,
    pub prices: Vec<QuotedPrice>,
    pub reference: String,
    pub terms: String,
}
#[derive(Serialize)]
pub struct QuoteFile {
    pub id: Uuid,
    pub response_id: Uuid,
    pub name: String,
    pub bytes: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AwardChoice {
    pub response_revision: u32,
    pub row_id: Uuid,
    pub response_id: Uuid,
    pub quantity: D,
}
#[derive(Serialize)]
pub struct AwardBalance {
    pub row_id: Uuid,
    pub quantity: D,
}
#[derive(Serialize)]
pub struct OrderLine {
    pub source_id: Uuid,
    pub description: String,
    pub quantity: D,
    pub unit_price: D,
    pub received: D,
    pub remaining: D,
    pub vendor_stock: D,
    pub requested: D,
}
#[derive(Serialize)]
pub struct SupplierOrder {
    pub document: Operation,
    pub lines: Vec<OrderLine>,
    pub paid: D,
    pub cash_paid: D,
    pub pending_payment: D,
    pub payment_state: String,
    pub delivery_state: String,
    pub editable: bool,
    pub revision: u32,
    pub supplier_credit: D,
    pub files: Vec<crate::supplier_logistics::FileInfo>,
}
impl LocalStore {
    fn quotation_request(&self, id: Uuid) -> Result<QuotationRequest> {
        Ok(crate::quotation_edits::current(&self.conn, id)?.request)
    }
    pub fn quote_responses(&self, request: Uuid) -> Result<Vec<QuoteResponse>> {
        let data = self
            .conn
            .prepare(
                "SELECT payload_json FROM quotation_responses WHERE request_id=?1 AND hidden=0 ORDER BY rowid",
            )?
            .query_map([request.to_string()], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        data.into_iter()
            .map(|j| {
                let mut response: QuoteResponse = serde_json::from_str(&j)?;
                let request = self.quotation_request(request)?;
                response.prices = request
                    .items
                    .iter()
                    .map(|i| {
                        response
                            .prices
                            .iter()
                            .find(|p| p.row_id == i.id)
                            .cloned()
                            .unwrap_or(crate::quotation_workflow::QuotedPrice {
                                row_id: i.id,
                                unit_price: None,
                                notes: String::new(),
                            })
                    })
                    .collect();
                Ok(response)
            })
            .collect()
    }
    pub fn save_quote_response(&mut self, input: &QuoteResponse) -> Result<QuoteResponse> {
        let request_revision =
            crate::quotation_edits::current(&self.conn, input.request_id)?.revision;
        let r = self.quotation_request(input.request_id)?;
        if input.id.is_nil()
            || input.reference.len() > 150
            || input.terms.len() > 4000
            || input.prices.len() > r.items.len()
        {
            return Err(invalid("Respuesta inválida"));
        }
        let partner = self
            .management_record(input.supplier_id)?
            .ok_or_else(|| invalid("Proveedor inexistente"))?;
        if !["supplier", "subcontractor", "crew"].contains(&partner.kind.as_str())
            || partner.project_id.is_some_and(|p| p != r.project_id)
        {
            return Err(invalid(
                "Seleccioná un proveedor o contratista de esta obra",
            ));
        }
        let mut ids = BTreeSet::new();
        for price in &input.prices {
            if !ids.insert(price.row_id)
                || !r.items.iter().any(|i| i.id == price.row_id)
                || price.unit_price.is_some_and(|p| p < D::ZERO)
                || price.notes.len() > 500
            {
                return Err(invalid("Renglón o precio unitario sin IVA inválido"));
            }
        }
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        if crate::quotation_edits::current(&tx, input.request_id)?.revision != request_revision {
            return Err(invalid(
                "La solicitud cambió. Recargá antes de guardar precios",
            ));
        }
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM quotation_responses WHERE id=?1 AND hidden=1)",
            [input.id.to_string()],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(invalid(
                "El proveedor fue quitado; volvé a agregarlo antes de guardar",
            ));
        }
        let old:Option<(String,u32)>=tx.query_row("SELECT id,revision FROM quotation_responses WHERE request_id=?1 AND supplier_id=?2",params![input.request_id.to_string(),input.supplier_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        if old
            .as_ref()
            .is_some_and(|(id, rev)| id != &input.id.to_string() || *rev != input.revision)
            || old.is_none() && input.revision != 0
        {
            return Err(invalid("La respuesta cambió. Recargá antes de guardar"));
        }
        if old.is_none()
            && tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM quotation_responses WHERE id=?1)",
                [input.id.to_string()],
                |r| r.get::<_, bool>(0),
            )?
        {
            return Err(invalid(
                "La respuesta pertenece a otra solicitud o proveedor",
            ));
        }
        let mut saved = input.clone();
        saved.revision = saved
            .revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute("INSERT INTO quotation_responses(id,request_id,supplier_id,revision,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload_json=excluded.payload_json",params![saved.id.to_string(),saved.request_id.to_string(),saved.supplier_id.to_string(),saved.revision,serde_json::to_string(&saved)?])?;
        tx.commit()?;
        Ok(saved)
    }
    pub fn quote_files(&self, request: Uuid) -> Result<Vec<QuoteFile>> {
        Ok(self.conn.prepare("SELECT f.id,f.response_id,f.name,length(f.content) FROM quotation_response_files f JOIN quotation_responses r ON r.id=f.response_id WHERE r.request_id=?1 ORDER BY f.rowid")?.query_map([request.to_string()],|r|{let id:String=r.get(0)?;let response:String=r.get(1)?;Ok((id,response,r.get::<_,String>(2)?,r.get::<_,u32>(3)?))})?.collect::<std::result::Result<Vec<_>,_>>()?.into_iter().map(|(id,r,name,bytes)|Ok(QuoteFile{id:id.parse()?,response_id:r.parse()?,name,bytes})).collect::<Result<Vec<_>>>()?)
    }
    pub fn attach_quote_file(&self, response: Uuid, name: &str, content: &[u8]) -> Result<Uuid> {
        let extension = name.rsplit('.').next().unwrap_or("").to_lowercase();
        let valid = match extension.as_str() {
            "pdf" => content.starts_with(b"%PDF-"),
            "png" => content.starts_with(b"\x89PNG\r\n\x1a\n"),
            "jpg" | "jpeg" => content.starts_with(&[255, 216, 255]),
            "webp" => {
                content.len() > 12 && content.starts_with(b"RIFF") && &content[8..12] == b"WEBP"
            }
            _ => false,
        };
        if !valid
            || name.is_empty()
            || name.len() > 180
            || name.contains(['/', '\\'])
            || content.len() > 10 * 1024 * 1024
        {
            return Err(invalid("Adjuntá un PDF o imagen válida de hasta 10 MB"));
        }
        let id = Uuid::new_v4();
        self.conn.execute(
            "INSERT INTO quotation_response_files(id,response_id,name,content) VALUES(?1,?2,?3,?4)",
            params![id.to_string(), response.to_string(), name, content],
        )?;
        Ok(id)
    }
    pub fn quote_file_content(&self, project: Uuid, id: Uuid) -> Result<(String, Vec<u8>)> {
        Ok(self.conn.query_row("SELECT f.name,f.content FROM quotation_response_files f JOIN quotation_responses r ON r.id=f.response_id JOIN operation_documents o ON o.id=r.request_id WHERE f.id=?1 AND o.project_id=?2",params![id.to_string(),project.to_string()],|r|Ok((r.get(0)?,r.get(1)?)))?)
    }
    pub fn award_balances(&self, request: Uuid) -> Result<Vec<AwardBalance>> {
        let r = self.quotation_request(request)?;
        let data = self
            .conn
            .prepare(
                "SELECT row_id,quantity,document_id FROM quotation_awards WHERE request_id=?1",
            )?
            .query_map([request.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        r.items
            .iter()
            .map(|i| {
                let used = sum(data
                    .iter()
                    .filter(|(id, _, _)| id == &i.id.to_string())
                    .map(|(_, q, order)| {
                        let doc = self
                            .operation_documents(Some(r.project_id))?
                            .into_iter()
                            .find(|d| d.id.to_string() == *order)
                            .ok_or_else(|| invalid("Pedido inexistente"))?;
                        let effective = doc
                            .lines
                            .iter()
                            .find(|l| {
                                l.resource_id == Some(i.source_id) || l.line_id == Some(i.source_id)
                            })
                            .map(|l| l.quantity)
                            .unwrap_or_default();
                        Ok(q.parse::<D>()
                            .map_err(|_| invalid("Cantidad inválida"))?
                            .min(effective))
                    })
                    .collect::<Result<Vec<_>>>()?
                    .into_iter())?;
                Ok(AwardBalance {
                    row_id: i.id,
                    quantity: add(i.quantity, -used)?.max(D::ZERO),
                })
            })
            .collect()
    }
    pub fn award_quotation(
        &mut self,
        request: Uuid,
        choices: &[AwardChoice],
        due_date: &str,
        contract_terms: Option<ContractTerms>,
    ) -> Result<Vec<Operation>> {
        if choices.is_empty() || choices.len() > 1000 {
            return Err(invalid("Seleccioná al menos un renglón para adjudicar"));
        }
        chrono::NaiveDate::parse_from_str(due_date, "%Y-%m-%d")
            .map_err(|_| invalid("Definí la fecha prevista de pago"))?;
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            let r = self.quotation_request(request)?;
            let responses = self.quote_responses(request)?;
            let balances = self.award_balances(request)?;
            let mut totals = BTreeMap::<Uuid, D>::new();
            let mut groups = BTreeMap::<Uuid, Vec<OperationLine>>::new();
            for c in choices {
                if c.quantity <= D::ZERO {
                    return Err(invalid("Cantidad a adjudicar inválida"));
                }
                let row = r
                    .items
                    .iter()
                    .find(|i| i.id == c.row_id)
                    .ok_or_else(|| invalid("Renglón ajeno al pedido"))?;
                let response = responses
                    .iter()
                    .find(|p| p.id == c.response_id)
                    .ok_or_else(|| invalid("Respuesta ajena a la solicitud"))?;
                if c.response_revision != response.revision {
                    return Err(invalid(
                        "La cotización cambió. Cerrá y revisá la adjudicación nuevamente",
                    ));
                }
                let price = response
                    .prices
                    .iter()
                    .find(|p| p.row_id == c.row_id)
                    .and_then(|p| p.unit_price)
                    .ok_or_else(|| invalid("Este proveedor no cotizó el material o tarea"))?;
                let v = totals.entry(row.id).or_default();
                *v = add(*v, c.quantity)?;
                if *v
                    > balances
                        .iter()
                        .find(|b| b.row_id == row.id)
                        .unwrap()
                        .quantity
                {
                    return Err(invalid("La cantidad supera lo pendiente de adjudicar"));
                }
                groups.entry(response.id).or_default().push(OperationLine {
                    resource_id: if r.kind == "material" {
                        Some(row.source_id)
                    } else {
                        None
                    },
                    line_id: if r.kind == "work" {
                        Some(row.source_id)
                    } else {
                        None
                    },
                    description: row.description.clone(),
                    quantity: c.quantity,
                    unit_price: price,
                    ..Default::default()
                });
            }
            let mut posted = vec![];
            for (response_id, lines) in groups {
                let response = responses.iter().find(|p| p.id == response_id).unwrap();
                let date = self
                    .conn
                    .query_row("SELECT date('now','-3 hours')", [], |r| {
                        r.get::<_, String>(0)
                    })?;
                let quote = self.post_operation(&Operation {
                    project_id: r.project_id,
                    estimate_id: r.estimate_id,
                    kind: "quote".into(),
                    reference_id: Some(r.id),
                    partner_id: Some(response.supplier_id),
                    date: date.clone(),
                    currency: r.currency.clone(),
                    lines: lines.clone(),
                    notes: format!("Precios unitarios SIN IVA. {}", response.reference),
                    terms: response.terms.clone(),
                    ..Default::default()
                })?;
                let doc = self.post_operation(&Operation {
                    project_id: r.project_id,
                    estimate_id: r.estimate_id,
                    kind: if r.kind == "material" {
                        "purchase_order"
                    } else {
                        "subcontract"
                    }
                    .into(),
                    reference_id: Some(quote.id),
                    partner_id: Some(response.supplier_id),
                    date,
                    currency: r.currency.clone(),
                    due_date: due_date.into(),
                    notes: format!("{} · Importes SIN IVA", r.title),
                    terms: response.terms.clone(),
                    contract_terms: if r.kind == "work" {
                        Some(contract_terms.clone().unwrap_or_default())
                    } else {
                        None
                    },
                    lines,
                    ..Default::default()
                })?;
                for choice in choices.iter().filter(|c| c.response_id == response_id) {
                    let price = response
                        .prices
                        .iter()
                        .find(|p| p.row_id == choice.row_id)
                        .unwrap()
                        .unit_price
                        .unwrap();
                    self.conn.execute("INSERT INTO quotation_awards(id,request_id,response_id,document_id,row_id,quantity,price) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![Uuid::new_v4().to_string(),request.to_string(),response_id.to_string(),doc.id.to_string(),choice.row_id.to_string(),choice.quantity.to_string(),price.to_string()])?;
                }
                posted.push(doc);
            }
            Ok(posted)
        })();
        match result {
            Ok(v) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(v)
            }
            Err(e) => {
                self.conn.execute_batch("ROLLBACK")?;
                Err(e)
            }
        }
    }
    pub fn supplier_orders(&self, project: Uuid, kind: &str) -> Result<Vec<SupplierOrder>> {
        if !["material", "work"].contains(&kind) {
            return Err(invalid("Tipo inválido"));
        }
        let docs = self.operation_documents(Some(project))?;
        let mut out = vec![];
        for order in docs.iter().filter(|o| {
            o.kind
                == if kind == "material" {
                    "purchase_order"
                } else {
                    "subcontract"
                }
        }) {
            let history = crate::supplier_logistics::movements(&self.conn, order.id)?;
            let children: BTreeSet<Uuid> = docs
                .iter()
                .filter(|o| o.reference_id == Some(order.id))
                .map(|o| o.id)
                .collect();
            let bills: BTreeSet<Uuid> = docs
                .iter()
                .filter(|o| {
                    o.kind == "payable"
                        && o.reference_id
                            .is_some_and(|id| children.contains(&id) || id == order.id)
                })
                .map(|o| o.id)
                .collect();
            let paid = sum(docs
                .iter()
                .filter(|o| {
                    ["payment", "advance_paid"].contains(&o.kind.as_str())
                        && o.currency == order.currency
                        && o.reference_id.is_some_and(|id| {
                            id == order.id || children.contains(&id) || bills.contains(&id)
                        })
                })
                .map(|o| o.amount))?;
            let cash_paid = paid;
            let paid = add(
                paid,
                order
                    .calculated
                    .get("supplier_payment_adjustment")
                    .copied()
                    .unwrap_or_default(),
            )?
            .max(D::ZERO);
            let lines = order
                .lines
                .iter()
                .filter_map(|l| {
                    let id = if kind == "material" {
                        l.resource_id
                    } else {
                        l.line_id
                    }?;
                    Some((id, l))
                })
                .map(|(id, l)| {
                    let received = sum(docs
                        .iter()
                        .filter(|o| {
                            o.reference_id == Some(order.id)
                                && o.kind
                                    == if kind == "material" {
                                        "receipt"
                                    } else {
                                        "subcertificate"
                                    }
                        })
                        .flat_map(|o| &o.lines)
                        .filter(|r| {
                            if kind == "material" {
                                r.resource_id == Some(id)
                            } else {
                                r.line_id == Some(id)
                            }
                        })
                        .map(|r| r.quantity))?;
                    let position = history.iter().rev().find_map(|m| m.stock.get(&id));
                    let since = position
                        .map(|p| add(received, -p.received))
                        .transpose()?
                        .unwrap_or_default()
                        .max(D::ZERO);
                    Ok(OrderLine {
                        vendor_stock: position
                            .map(|p| add(p.vendor_stock, -since))
                            .transpose()?
                            .unwrap_or_default()
                            .max(D::ZERO)
                            .min(add(l.quantity, -received)?.max(D::ZERO)),
                        requested: position
                            .map(|p| add(p.requested, -since))
                            .transpose()?
                            .unwrap_or_default()
                            .max(D::ZERO),
                        source_id: id,
                        description: l.description.clone(),
                        quantity: l.quantity,
                        unit_price: l.unit_price,
                        received,
                        remaining: add(l.quantity, -received)?.max(D::ZERO),
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            let any = lines.iter().any(|l| l.received > D::ZERO);
            let done = !lines.is_empty() && lines.iter().all(|l| l.remaining == D::ZERO);
            out.push(SupplierOrder {
                editable: children.is_empty() && history.iter().all(|m| m.kind == "edit"),
                revision: history.len() as u32,
                supplier_credit: self.supplier_credit(
                    project,
                    order.partner_id,
                    &order.currency,
                )?,
                files: self.operation_file_list(project, order.id)?,
                document: order.clone(),
                lines,
                paid,
                cash_paid,
                pending_payment: add(order.amount, -paid)?.max(D::ZERO),
                payment_state: if paid >= order.amount {
                    "Pagado"
                } else if paid > D::ZERO {
                    "Parcial"
                } else {
                    "Pendiente"
                }
                .into(),
                delivery_state: if done {
                    "Completa"
                } else if any {
                    "Parcial"
                } else {
                    "Solicitado"
                }
                .into(),
            });
        }
        out.reverse();
        Ok(out)
    }
    pub fn receive_material_order(
        &mut self,
        project: Uuid,
        order: Uuid,
        quantities: &BTreeMap<Uuid, D>,
    ) -> Result<Operation> {
        let o = self
            .operation_documents(Some(project))?
            .into_iter()
            .find(|o| o.id == order && o.kind == "purchase_order")
            .ok_or_else(|| invalid("Pedido ajeno a la obra"))?;
        if quantities.values().any(|q| *q < D::ZERO) {
            return Err(invalid("No se permiten recepciones negativas"));
        }
        let lines = quantities
            .iter()
            .filter(|(_, q)| **q > D::ZERO)
            .map(|(id, q)| {
                let l = o
                    .lines
                    .iter()
                    .find(|l| l.resource_id == Some(*id))
                    .ok_or_else(|| invalid("Material ajeno al pedido"))?;
                Ok(OperationLine {
                    quantity: *q,
                    ..l.clone()
                })
            })
            .collect::<Result<Vec<_>>>()?;
        self.conn.execute_batch(
            "SAVEPOINT receive_material; UPDATE automatic_codes SET last_value=last_value WHERE 0",
        )?;
        let result = (|| {
            let warehouse = if let Some(w) = self
                .operation_warehouses()?
                .into_iter()
                .find(|w| w.project_id == project)
            {
                w.id
            } else {
                let w = crate::operations::Warehouse {
                    id: Uuid::new_v4(),
                    project_id: project,
                    name: "Acopio de obra".into(),
                    location: "Obra".into(),
                };
                self.create_operation_warehouse(&w)?;
                w.id
            };
            self.post_operation(&Operation {
                project_id: project,
                estimate_id: o.estimate_id,
                kind: "receipt".into(),
                reference_id: Some(order),
                partner_id: o.partner_id,
                warehouse_id: Some(warehouse),
                currency: o.currency,
                date: self
                    .conn
                    .query_row("SELECT date('now','-3 hours')", [], |r| {
                        r.get::<_, String>(0)
                    })?,
                lines,
                ..Default::default()
            })
        })();
        match result {
            Ok(v) => {
                self.conn.execute_batch("RELEASE receive_material")?;
                Ok(v)
            }
            Err(e) => {
                self.conn
                    .execute_batch("ROLLBACK TO receive_material; RELEASE receive_material")?;
                Err(e)
            }
        }
    }
}
