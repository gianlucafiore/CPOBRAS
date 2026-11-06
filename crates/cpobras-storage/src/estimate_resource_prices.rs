//! One resource price per estimate. Changed recipes are copied, never mutated across versions.
use crate::{LocalStore, Result, StorageError};
use cpobras_core::UnitCostAnalysis;
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use std::collections::BTreeMap;
use uuid::Uuid;
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
pub(crate) fn synchronize(
    conn: &rusqlite::Connection,
    estimate: Uuid,
    overrides: &BTreeMap<Uuid, Decimal>,
) -> Result<usize> {
    let status: Option<String> = conn
        .query_row(
            "SELECT status FROM estimates WHERE id=?1",
            [estimate.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    if status.as_deref() != Some("draft") {
        return Err(invalid(
            "Los precios de un presupuesto emitido no se modifican",
        ));
    }
    for (id, price) in overrides {
        if *price < Decimal::ZERO {
            return Err(invalid("Precio de insumo negativo"));
        }
        conn.execute("INSERT INTO estimate_resource_prices(estimate_id,resource_id,amount) VALUES (?1,?2,?3) ON CONFLICT(estimate_id,resource_id) DO UPDATE SET amount=excluded.amount",params![estimate.to_string(),id.to_string(),price.to_string()])?;
    }
    let mut prices: BTreeMap<Uuid, Decimal> = BTreeMap::new();
    let rows: Vec<(String, String)> = conn
        .prepare("SELECT resource_id,amount FROM estimate_resource_prices WHERE estimate_id=?1")?
        .query_map([estimate.to_string()], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<std::result::Result<_, _>>()?;
    for (id, p) in rows {
        prices.insert(
            Uuid::parse_str(&id)?,
            p.parse()
                .map_err(|_| invalid("Precio persistido inválido"))?,
        );
    }
    let rows:Vec<(String,String,String,String,String)>=conn.prepare("SELECT l.id,l.description,l.unit,l.unit_cost_snapshot,a.snapshot_json FROM estimate_lines l JOIN analyses a ON a.id=l.analysis_id WHERE l.estimate_id=?1 ORDER BY l.position,l.id")?.query_map([estimate.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)))?.collect::<std::result::Result<_,_>>()?;
    let mut count = 0;
    for (line, description, unit, old_cost, json) in rows {
        let mut analysis: UnitCostAnalysis = serde_json::from_str(&json)?;
        let private: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM line_analysis_snapshots WHERE analysis_id=?1)",
            [analysis.id.to_string()],
            |r| r.get(0),
        )?;
        if analysis.unit != unit {
            return Err(invalid("La unidad del ACU no coincide con la partida"));
        }
        let mut changed = !private;
        for c in &mut analysis.components {
            let price = if let Some(price) = prices.get(&c.resource_id) {
                *price
            } else {
                prices.insert(c.resource_id, c.unit_price);
                conn.execute("INSERT INTO estimate_resource_prices(estimate_id,resource_id,amount) VALUES (?1,?2,?3)",params![estimate.to_string(),c.resource_id.to_string(),c.unit_price.to_string()])?;
                c.unit_price
            };
            if c.unit_price != price {
                c.unit_price = price;
                changed = true;
            }
        }
        let cost = analysis
            .direct_unit_cost()
            .map_err(|e| invalid(&e.to_string()))?;
        let old: Decimal = old_cost
            .parse()
            .map_err(|_| invalid("Costo persistido inválido"))?;
        if old != cost {
            changed = true;
            count += 1;
        }
        if changed {
            if !private {
                conn.execute("INSERT OR IGNORE INTO line_analysis_sources(line_id,analysis_id) VALUES (?1,?2)",params![line,analysis.id.to_string()])?;
            }
            analysis.id = Uuid::new_v4();
            analysis.code = format!("PART-{}", analysis.id);
            analysis.description = description;
            conn.execute("INSERT INTO analyses(id,code,description,unit,snapshot_json) VALUES (?1,?2,?3,?4,?5)",params![analysis.id.to_string(),analysis.code,analysis.description,analysis.unit,serde_json::to_string(&analysis)?])?;
            conn.execute(
                "INSERT INTO line_analysis_snapshots(analysis_id) VALUES (?1)",
                [analysis.id.to_string()],
            )?;
            conn.execute("UPDATE estimate_lines SET analysis_id=?1,unit_cost_snapshot=?2 WHERE id=?3 AND estimate_id=?4",params![analysis.id.to_string(),cost.to_string(),line,estimate.to_string()])?;
        }
    }
    crate::estimates::checked_budget_total(conn, estimate)?;
    Ok(count)
}
impl LocalStore {
    pub fn estimate_resource_prices(&self, estimate: Uuid) -> Result<BTreeMap<Uuid, Decimal>> {
        let rows: Vec<(String, String)> = self
            .conn
            .prepare(
                "SELECT resource_id,amount FROM estimate_resource_prices WHERE estimate_id=?1",
            )?
            .query_map([estimate.to_string()], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        rows.into_iter()
            .map(|(id, p)| {
                Ok((
                    Uuid::parse_str(&id)?,
                    p.parse()
                        .map_err(|_| invalid("Precio persistido inválido"))?,
                ))
            })
            .collect()
    }
    pub(crate) fn reconcile_draft_prices(&self) -> Result<()> {
        let ids:Vec<String>=self.conn.prepare("SELECT id FROM estimates WHERE status='draft' AND EXISTS(SELECT 1 FROM estimate_lines WHERE estimate_id=estimates.id AND analysis_id IS NOT NULL)")?.query_map([],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        for id in ids {
            // A legacy library recipe may have changed units since it was used. Keep that line's stored price as manual.
            tx.execute("UPDATE estimate_lines SET analysis_id=NULL WHERE estimate_id=?1 AND EXISTS(SELECT 1 FROM analyses a WHERE a.id=estimate_lines.analysis_id AND a.unit<>estimate_lines.unit AND NOT EXISTS(SELECT 1 FROM line_analysis_snapshots p WHERE p.analysis_id=a.id))",[&id])?;
            tx.execute("DELETE FROM line_analysis_sources WHERE line_id IN (SELECT id FROM estimate_lines WHERE estimate_id=?1 AND analysis_id IS NULL)",[&id])?;
            synchronize(&tx, Uuid::parse_str(&id)?, &BTreeMap::new())?;
        }
        tx.commit()?;
        Ok(())
    }
}
