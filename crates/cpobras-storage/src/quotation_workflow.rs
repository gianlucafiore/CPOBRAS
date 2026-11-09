use crate::{
    construction_workflow::invalid,
    operations::{Operation, OperationLine},
    LocalStore, Result,
};
use rusqlite::{params, Connection};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestItem {
    pub id: Uuid,
    pub source_id: Uuid,
    pub code: String,
    pub description: String,
    pub unit: String,
    pub quantity: D,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotationRequest {
    pub id: Uuid,
    pub project_id: Uuid,
    pub estimate_id: Option<Uuid>,
    pub kind: String,
    pub title: String,
    pub number: String,
    pub date: String,
    pub currency: String,
    pub partner_id: Option<Uuid>,
    pub scope: String,
    pub delivery: String,
    pub payment: String,
    pub validity: String,
    pub taxes: String,
    pub items: Vec<RequestItem>,
    #[serde(default)]
    pub profile: serde_json::Value,
    #[serde(default)]
    pub project_name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotedPrice {
    pub row_id: Uuid,
    pub unit_price: Option<D>,
    pub notes: String,
}
pub(crate) fn canonical(conn: &Connection, request: &QuotationRequest) -> Result<QuotationRequest> {
    let mut r = request.clone();
    if r.id.is_nil()
        || !["material", "work"].contains(&r.kind.as_str())
        || r.title.trim().is_empty()
        || r.title.len() > 150
        || r.items.is_empty()
        || r.items.len() > 1000
        || !["ARS", "USD"].contains(&r.currency.as_str())
        || [&r.scope, &r.delivery, &r.payment, &r.validity, &r.taxes]
            .iter()
            .any(|s| s.len() > 4000)
    {
        return Err(invalid(
            "Revisá título, tipo, moneda y renglones de la solicitud",
        ));
    }
    chrono::NaiveDate::parse_from_str(&r.date, "%Y-%m-%d")
        .map_err(|_| invalid("Fecha de solicitud inválida"))?;
    let mut ids = BTreeSet::new();
    let mut sources = BTreeSet::new();
    for item in &mut r.items {
        if item.id.is_nil()
            || !ids.insert(item.id)
            || !sources.insert(item.source_id)
            || item.quantity <= D::ZERO
        {
            return Err(invalid("Renglones duplicados o cantidades inválidas"));
        }
        if r.kind == "material" {
            let (code, description, unit): (String, String, String) = conn.query_row(
                "SELECT code,description,unit FROM resources WHERE id=?1 AND active=1 AND kind='material'",
                [item.source_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;
            item.code = code;
            item.description = description;
            item.unit = unit;
        } else {
            let eid = r
                .estimate_id
                .ok_or_else(|| invalid("Seleccioná el presupuesto para cotizar trabajos"))?;
            let (position,description,unit,qty):(i64,String,String,String)=conn.query_row("SELECT l.position,l.description,l.unit,l.quantity FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.id=?1 AND e.id=?2 AND e.project_id=?3",params![item.source_id.to_string(),eid.to_string(),r.project_id.to_string()],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)))?;
            if item.quantity > qty.parse::<D>().map_err(|_| invalid("Cantidad inválida"))? {
                return Err(invalid(
                    "La cantidad solicitada supera la partida presupuestada",
                ));
            }
            item.code = format!("{:02}", position + 1);
            item.description = description;
            item.unit = unit;
        }
    }
    r.project_name = conn.query_row(
        "SELECT name FROM projects WHERE id=?1",
        [r.project_id.to_string()],
        |row| row.get(0),
    )?;
    let profile:String=conn.query_row("SELECT o.profile_json FROM organizations o JOIN project_organizations p ON p.organization_id=o.id WHERE p.project_id=?1",[r.project_id.to_string()],|row|row.get(0))?;
    r.profile = serde_json::from_str(&profile)?;
    Ok(r)
}
impl LocalStore {
    pub fn create_quotation_request(
        &mut self,
        request: &QuotationRequest,
    ) -> Result<QuotationRequest> {
        let request = canonical(&self.conn, request)?;
        let lines = request
            .items
            .iter()
            .map(|i| OperationLine {
                description: i.description.clone(),
                resource_id: if request.kind == "material" {
                    Some(i.source_id)
                } else {
                    None
                },
                line_id: if request.kind == "work" {
                    Some(i.source_id)
                } else {
                    None
                },
                quantity: i.quantity,
                unit_price: D::ZERO,
                ..Default::default()
            })
            .collect();
        let op = Operation {
            id: request.id,
            project_id: request.project_id,
            estimate_id: request.estimate_id,
            kind: "rfq".into(),
            date: request.date.clone(),
            number: String::new(),
            currency: request.currency.clone(),
            partner_id: request.partner_id,
            notes: format!(
                "{}\nAlcance: {}\nEntrega: {}\nPago: {}\nVigencia: {}\nImpuestos: {}",
                request.title,
                request.scope,
                request.delivery,
                request.payment,
                request.validity,
                request.taxes
            ),
            lines,
            quotation_request: Some(request),
            ..Default::default()
        };
        let posted = self.post_operation(&op)?;
        posted
            .quotation_request
            .ok_or_else(|| invalid("Solicitud no generada"))
    }
    pub fn quotation_requests(&self, project: Uuid) -> Result<Vec<QuotationRequest>> {
        let data=self.conn.prepare("SELECT q.request_json FROM quotation_requests q JOIN operation_documents o ON o.id=q.id WHERE o.project_id=?1 ORDER BY o.date,o.rowid")?.query_map([project.to_string()],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;
        data.into_iter()
            .map(|j| serde_json::from_str(&j).map_err(Into::into))
            .collect()
    }
    pub fn preview_quotation_import(
        &mut self,
        request: Uuid,
        supplier: Uuid,
        prices: &[QuotedPrice],
        import_id: Uuid,
        date: &str,
        reference: &str,
    ) -> Result<Operation> {
        let json: String = self.conn.query_row(
            "SELECT request_json FROM quotation_requests WHERE id=?1",
            [request.to_string()],
            |r| r.get(0),
        )?;
        let request: QuotationRequest = serde_json::from_str(&json)?;
        if prices.len() > request.items.len() || prices.is_empty() {
            return Err(invalid(
                "La oferta no corresponde a los renglones de la solicitud",
            ));
        }
        let mut seen = BTreeSet::new();
        let mut lines = vec![];
        let mut notes = vec![];
        for p in prices {
            if !seen.insert(p.row_id) || p.notes.len() > 500 {
                return Err(invalid("Referencia repetida o nota demasiado extensa"));
            }
            let row = request
                .items
                .iter()
                .find(|i| i.id == p.row_id)
                .ok_or_else(|| invalid("El archivo contiene un renglón ajeno a esta solicitud"))?;
            if let Some(price) = p.unit_price {
                if price < D::ZERO {
                    return Err(invalid("Precio negativo"));
                }
                lines.push(OperationLine {
                    resource_id: if request.kind == "material" {
                        Some(row.source_id)
                    } else {
                        None
                    },
                    line_id: if request.kind == "work" {
                        Some(row.source_id)
                    } else {
                        None
                    },
                    description: row.description.clone(),
                    quantity: row.quantity,
                    unit_price: price,
                    ..Default::default()
                });
            }
            if !p.notes.is_empty() {
                notes.push(format!("{}: {}", row.description, p.notes));
            }
        }
        if lines.is_empty() {
            return Err(invalid("No hay precios cotizados"));
        }
        let notes = notes.join("\n");
        if notes.len() > 20000 {
            return Err(invalid("Observaciones demasiado extensas"));
        }
        let op = Operation {
            id: import_id,
            project_id: request.project_id,
            estimate_id: request.estimate_id,
            kind: "quote".into(),
            date: date.into(),
            number: reference.trim().into(),
            currency: request.currency,
            partner_id: Some(supplier),
            reference_id: Some(request.id),
            notes,
            lines,
            ..Default::default()
        };
        self.post_operation_mode(&op, true, None, None)
    }
}
