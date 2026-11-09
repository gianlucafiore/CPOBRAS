//! Actual project funds and the advance attached to one budget's certification terms.
use crate::{operations::Operation, LocalStore, Result, StorageError};
use rusqlite::{params, Connection};
use rust_decimal::Decimal as D;
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
pub(crate) fn bind_advance(
    conn: &Connection,
    op: &mut Operation,
    prior: &[Operation],
) -> Result<()> {
    if op.kind != "advance_received" {
        return Ok(());
    }
    if op.estimate_id.is_none() {
        let ids: Vec<String> = conn.prepare("SELECT id FROM estimates WHERE project_id=?1 AND currency=?2 AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='estimate' AND a.entity_id=estimates.id)")?.query_map(params![op.project_id.to_string(),op.currency],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
        if ids.len() != 1 {
            return Err(invalid(
                "Elegí el presupuesto y convenio al que corresponde el anticipo del comitente",
            ));
        }
        op.estimate_id = Some(uuid::Uuid::parse_str(&ids[0])?);
    }
    let id = op.estimate_id.unwrap();
    if !conn.query_row("SELECT EXISTS(SELECT 1 FROM estimates e WHERE e.id=?1 AND e.project_id=?2 AND e.currency=?3 AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='estimate' AND a.entity_id=e.id))", params![id.to_string(),op.project_id.to_string(),op.currency], |r|r.get::<_,bool>(0))? {
        return Err(invalid("El anticipo requiere un presupuesto vigente de esta obra y moneda"));
    }
    let sale = crate::price_determination::calculate_price(conn, id)?
        .breakdown
        .total;
    let mut terms = crate::construction_workflow::terms(conn, id)?;
    let requested = op.advance_percent;
    if let Some(percent) = requested {
        if percent < D::ZERO || percent > D::from(100) {
            return Err(invalid("Recuperación de anticipo fuera de rango"));
        }
        terms.advance_recovery_percent = percent;
    } else if terms.advance_recovery_percent == D::ZERO && sale > D::ZERO && !conn.query_row("SELECT EXISTS(SELECT 1 FROM estimate_adjustment_agreements WHERE estimate_id=?1 AND terms_json<>'{}')",[id.to_string()],|r|r.get::<_,bool>(0))? {
        let received = prior
            .iter()
            .filter(|p| {
                p.kind == "advance_received"
                    && p.estimate_id == Some(id)
                    && p.currency == op.currency
            })
            .try_fold(op.amount, |a, p| {
                a.checked_add(p.amount)
                    .ok_or_else(|| invalid("Importe fuera de rango"))
            })?;
        terms.advance_recovery_percent = received
            .checked_mul(D::from(100))
            .and_then(|v| v.checked_div(sale))
            .ok_or_else(|| invalid("Importe fuera de rango"))?
            .min(D::from(100));
    }
    terms.validate()?;
    conn.execute("INSERT INTO estimate_adjustment_agreements(estimate_id,revision,definition_json,terms_json) VALUES(?1,1,'null',?2) ON CONFLICT(estimate_id) DO UPDATE SET terms_json=excluded.terms_json,revision=estimate_adjustment_agreements.revision+1",params![id.to_string(),serde_json::to_string(&terms)?])?;
    op.calculated.insert(
        "advance_recovery_percent".into(),
        terms.advance_recovery_percent,
    );
    Ok(())
}
impl LocalStore {
    pub fn project_fund_balance(
        &self,
        project: uuid::Uuid,
        currency: &str,
        as_of: &str,
    ) -> Result<D> {
        let mut balance = D::ZERO;
        for op in self
            .operation_documents(Some(project))?
            .iter()
            .filter(|o| o.currency == currency && o.date.as_str() <= as_of)
        {
            let signed = match op.kind.as_str() {
                "collection" | "advance_received" | "fund_contribution" => op.amount,
                "payment" | "advance_paid" | "direct_payment" | "fund_reimbursement" => -op.amount,
                _ => D::ZERO,
            };
            balance = balance
                .checked_add(signed)
                .ok_or_else(|| invalid("Saldo fuera de rango"))?;
        }
        Ok(balance)
    }
}

pub(crate) fn effective_link(conn: &Connection, mut op: Operation) -> Result<Operation> {
    use rusqlite::OptionalExtension;
    if op.kind == "advance_received" && op.estimate_id.is_none() {
        let id: Option<String> = conn
            .query_row(
                "SELECT estimate_id FROM advance_agreement_links WHERE document_id=?1",
                [op.id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        op.estimate_id = id.map(|id| uuid::Uuid::parse_str(&id)).transpose()?;
    }
    Ok(op)
}
impl LocalStore {
    pub fn link_client_advance(
        &mut self,
        project: uuid::Uuid,
        document: uuid::Uuid,
        estimate: uuid::Uuid,
    ) -> Result<()> {
        let tx = self.conn.savepoint()?;
        tx.execute(
            "UPDATE automatic_codes SET last_value=last_value WHERE 0",
            [],
        )?;
        let docs = crate::operations::documents(&tx, Some(project))?;
        let mut advance = docs
            .iter()
            .find(|o| o.id == document && o.kind == "advance_received")
            .cloned()
            .ok_or_else(|| invalid("Anticipo ajeno a la obra"))?;
        if let Some(current) = advance.estimate_id {
            return if current == estimate {
                Ok(())
            } else {
                Err(invalid("El anticipo ya pertenece a otro convenio"))
            };
        }
        let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM estimates e WHERE e.id=?1 AND e.project_id=?2 AND e.currency=?3 AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='estimate' AND a.entity_id=e.id))",params![estimate.to_string(),project.to_string(),advance.currency],|r|r.get(0))?;
        if !valid {
            return Err(invalid(
                "El convenio debe pertenecer a la misma obra y moneda",
            ));
        }
        advance.estimate_id = Some(estimate);
        advance.advance_percent = None;
        let others: Vec<_> = docs.into_iter().filter(|o| o.id != document).collect();
        bind_advance(&tx, &mut advance, &others)?;
        tx.execute(
            "INSERT INTO advance_agreement_links(document_id,estimate_id) VALUES(?1,?2)",
            params![document.to_string(), estimate.to_string()],
        )?;
        tx.commit()?;
        Ok(())
    }
}
