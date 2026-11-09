use crate::{
    construction_workflow::{invalid, sum},
    procurement::QuoteResponse,
    quotation_workflow::{QuotationRequest, QuotedPrice},
    LocalStore, Result,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use uuid::Uuid;
#[derive(Serialize)]
pub struct EditableRequest {
    pub request: QuotationRequest,
    pub revision: u32,
}
pub(crate) fn current(conn: &Connection, id: Uuid) -> Result<EditableRequest> {
    let latest:Option<(u32,String)>=conn.query_row("SELECT revision,request_json FROM quotation_request_revisions WHERE request_id=?1 ORDER BY revision DESC LIMIT 1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
    let (revision, json) = if let Some(row) = latest {
        row
    } else {
        (
            0,
            conn.query_row(
                "SELECT request_json FROM quotation_requests WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )?,
        )
    };
    Ok(EditableRequest {
        request: serde_json::from_str(&json)?,
        revision,
    })
}
impl LocalStore {
    pub fn editable_quotation_request(&self, id: Uuid) -> Result<EditableRequest> {
        current(&self.conn, id)
    }
    pub fn update_quotation_request(
        &mut self,
        input: &QuotationRequest,
        revision: u32,
    ) -> Result<EditableRequest> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let old = current(&tx, input.id)?;
        let o = &old.request;
        if revision != old.revision
            || input.project_id != o.project_id
            || input.estimate_id != o.estimate_id
            || input.kind != o.kind
            || input.currency != o.currency
            || input.number != o.number
            || input.date != o.date
        {
            return Err(invalid(
                "La solicitud cambió o se intentó modificar su identidad. Recargá antes de editar",
            ));
        }
        let request = crate::quotation_workflow::canonical(&tx, input)?;
        for item in &request.items {
            if o.items.iter().any(|i| {
                (i.source_id == item.source_id && i.id != item.id)
                    || (i.id == item.id && i.source_id != item.source_id)
            }) {
                return Err(invalid("Conservá la identidad de los renglones existentes"));
            }
        }
        for item in &o.items {
            let quantities: Vec<String> = tx
                .prepare("SELECT quantity FROM quotation_awards WHERE request_id=?1 AND row_id=?2")?
                .query_map(params![o.id.to_string(), item.id.to_string()], |r| r.get(0))?
                .collect::<std::result::Result<_, _>>()?;
            let awarded = sum(quantities
                .into_iter()
                .map(|q| q.parse().map_err(|_| invalid("Cantidad inválida")))
                .collect::<Result<Vec<_>>>()?
                .into_iter())?;
            let updated = request.items.iter().find(|r| r.id == item.id);
            if awarded > rust_decimal::Decimal::ZERO && updated.is_none_or(|i| i.quantity < awarded)
            {
                return Err(invalid("No se puede quitar un material adjudicado ni reducir su cantidad por debajo de lo ya pedido"));
            }
        }
        let revision = revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute("INSERT INTO quotation_request_revisions(id,request_id,revision,request_json) VALUES(?1,?2,?3,?4)",params![Uuid::new_v4().to_string(),request.id.to_string(),revision,serde_json::to_string(&request)?])?;
        tx.commit()?;
        Ok(EditableRequest { request, revision })
    }
    pub fn hide_quote_response(&mut self, request: Uuid, id: Uuid, revision: u32) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let json:Option<String>=tx.query_row("SELECT payload_json FROM quotation_responses WHERE request_id=?1 AND id=?2 AND revision=?3 AND hidden=0",params![request.to_string(),id.to_string(),revision],|r|r.get(0)).optional()?;
        let mut response: QuoteResponse = serde_json::from_str(&json.ok_or_else(|| {
            invalid("La respuesta cambió. Recargá antes de quitar el proveedor")
        })?)?;
        response.revision = response
            .revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute(
            "UPDATE quotation_responses SET hidden=1,revision=?1,payload_json=?2 WHERE id=?3",
            params![
                response.revision,
                serde_json::to_string(&response)?,
                id.to_string()
            ],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn add_quote_supplier(&mut self, request: Uuid, supplier: Uuid) -> Result<QuoteResponse> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM management_records m JOIN entity_archives a ON a.entity_id=m.person_id AND a.kind='person:supplier' WHERE m.id=?1)",[supplier.to_string()],|r|r.get::<_,bool>(0))? {return Err(invalid("El proveedor está dado de baja"));}
        let old:Option<(String,bool)>=tx.query_row("SELECT payload_json,hidden FROM quotation_responses WHERE request_id=?1 AND supplier_id=?2",params![request.to_string(),supplier.to_string()],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        if let Some((json, hidden)) = old {
            let mut response: QuoteResponse = serde_json::from_str(&json)?;
            if hidden {
                response.revision = response
                    .revision
                    .checked_add(1)
                    .ok_or_else(|| invalid("Revisión fuera de rango"))?;
                tx.execute("UPDATE quotation_responses SET hidden=0,revision=?1,payload_json=?2 WHERE id=?3",params![response.revision,serde_json::to_string(&response)?,response.id.to_string()])?;
            }
            tx.commit()?;
            return self
                .quote_responses(request)?
                .into_iter()
                .find(|r| r.id == response.id)
                .ok_or_else(|| invalid("Respuesta inexistente"));
        }
        tx.commit()?;
        let r = current(&self.conn, request)?.request;
        self.save_quote_response(&QuoteResponse {
            id: Uuid::new_v4(),
            request_id: request,
            supplier_id: supplier,
            revision: 0,
            reference: String::new(),
            terms: String::new(),
            prices: r
                .items
                .iter()
                .map(|i| QuotedPrice {
                    row_id: i.id,
                    unit_price: None,
                    notes: String::new(),
                })
                .collect(),
        })
    }
}
