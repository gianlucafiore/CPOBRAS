use crate::{operations::Operation, LocalStore, Result, StorageError};
use cpobras_core::adjustments::{
    add, multiply, AdjustmentAgreement, AdjustmentSnapshot, IndexPoint,
};
use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
fn math<T>(r: std::result::Result<T, String>) -> Result<T> {
    r.map_err(StorageError::InvalidValue)
}
#[derive(Debug, Serialize, Deserialize)]
pub struct SavedAgreement {
    pub revision: u32,
    pub definition: Option<AdjustmentAgreement>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CertificateExtra {
    pub id: Uuid,
    pub description: String,
    pub reason: String,
    pub authorization: String,
    pub amount: D,
    pub adjustable: bool,
    pub retention: bool,
    pub recover_advance: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateDifference {
    pub estimate_id: Uuid,
    pub source_id: Uuid,
    pub source_number: String,
    pub from_factor: D,
    pub snapshot: AdjustmentSnapshot,
    pub delta: D,
    pub retention_delta: D,
}
pub(crate) fn agreement(conn: &Connection, id: Uuid) -> Result<SavedAgreement> {
    let v:Option<(u32,String)>=conn.query_row("SELECT revision,definition_json FROM estimate_adjustment_agreements WHERE estimate_id=?1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
    match v {
        Some((revision, json)) => Ok(SavedAgreement {
            revision,
            definition: serde_json::from_str(&json)?,
        }),
        None => Ok(SavedAgreement {
            revision: 0,
            definition: None,
        }),
    }
}
pub(crate) fn points(conn: &Connection) -> Result<Vec<IndexPoint>> {
    let rows=conn.prepare("SELECT id,series,period,value,publication_date,source FROM index_points ORDER BY publication_date,rowid")?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?)))?.collect::<std::result::Result<Vec<_>,_>>()?;
    rows.into_iter()
        .map(|(id, series, period, value, publication_date, source)| {
            Ok(IndexPoint {
                id: id.parse()?,
                series,
                period,
                value: value.parse().map_err(|_| invalid("Puntaje inválido"))?,
                publication_date,
                source,
            })
        })
        .collect()
}
pub(crate) fn snapshot(
    conn: &Connection,
    estimate: Uuid,
    date: &str,
    as_of: &str,
) -> Result<Option<AdjustmentSnapshot>> {
    let Some(a) = agreement(conn, estimate)?.definition else {
        return Ok(None);
    };
    let target = math(a.target_month(date))?;
    math(a.resolve(&target, as_of, &points(conn)?)).map(Some)
}
pub(crate) fn differences(
    conn: &Connection,
    docs: &[Operation],
    as_of: &str,
) -> Result<Vec<CertificateDifference>> {
    let points = points(conn)?;
    let mut result = vec![];
    for source in docs
        .iter()
        .filter(|o| o.kind == "certificate" && o.date.as_str() <= as_of)
    {
        let Some(original) = &source.index_snapshot else {
            continue;
        };
        let Ok(new) = original
            .agreement
            .resolve(&original.target_month, as_of, &points)
        else {
            continue;
        };
        let previous = docs
            .iter()
            .filter(|o| o.date.as_str() <= as_of)
            .flat_map(|o| &o.reconciliations)
            .filter(|r| r.source_id == source.id)
            .last();
        let old = previous.map_or(original.factor, |r| r.snapshot.factor);
        if new.factor == old {
            continue;
        }
        let base = source
            .calculated
            .get("adjustable_base")
            .copied()
            .unwrap_or_default();
        let retention_base = source
            .calculated
            .get("retention_adjustable_base")
            .copied()
            .unwrap_or_default();
        let change = math(add(new.factor, -old))?;
        let delta = math(multiply(base, change))?;
        let retention_delta = math(multiply(
            math(multiply(retention_base, change))?,
            source.retention_percent,
        ))?
        .checked_div(D::from(100))
        .ok_or_else(|| invalid("Reparo fuera de rango"))?;
        if delta != D::ZERO {
            result.push(CertificateDifference {
                estimate_id: source
                    .estimate_id
                    .ok_or_else(|| invalid("Certificado sin presupuesto"))?,
                source_id: source.id,
                source_number: source.number.clone(),
                from_factor: old,
                snapshot: new,
                delta,
                retention_delta,
            });
        }
    }
    Ok(result)
}
impl LocalStore {
    pub fn adjustment_agreement(&self, id: Uuid) -> Result<SavedAgreement> {
        if self.get_estimate(id)?.is_none() {
            return Err(invalid("Presupuesto inexistente"));
        }
        agreement(&self.conn, id)
    }
    pub fn save_adjustment_agreement(
        &mut self,
        id: Uuid,
        revision: u32,
        definition: Option<AdjustmentAgreement>,
    ) -> Result<SavedAgreement> {
        if let Some(a) = &definition {
            math(a.validate())?;
        }
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let status: Option<String> = tx
            .query_row(
                "SELECT status FROM estimates WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        if status.as_deref() != Some("draft") {
            return Err(invalid("El acuerdo se edita con el presupuesto en borrador; los certificados emitidos conservan su acuerdo"));
        }
        let current = agreement(&tx, id)?;
        if current.revision != revision {
            return Err(invalid("El acuerdo cambió; recargá antes de guardar"));
        }
        let next = revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute("INSERT INTO estimate_adjustment_agreements(estimate_id,revision,definition_json) VALUES(?1,?2,?3) ON CONFLICT(estimate_id) DO UPDATE SET revision=excluded.revision,definition_json=excluded.definition_json",params![id.to_string(),next,serde_json::to_string(&definition)?])?;
        tx.commit()?;
        Ok(SavedAgreement {
            revision: next,
            definition,
        })
    }
    pub fn certificate_index_preview(
        &self,
        id: Uuid,
        cut: &str,
        as_of: &str,
    ) -> Result<Option<AdjustmentSnapshot>> {
        if self.get_estimate(id)?.is_none() {
            return Err(invalid("Presupuesto inexistente"));
        }
        snapshot(&self.conn, id, cut, as_of)
    }
    pub fn pending_adjustment_differences(
        &self,
        project: Uuid,
        as_of: &str,
    ) -> Result<Vec<CertificateDifference>> {
        differences(&self.conn, &self.operation_documents(Some(project))?, as_of)
    }
}

#[derive(Debug, Serialize)]
pub struct CertificationOverview {
    pub cut: String,
    pub start: String,
    pub amount: D,
    pub next_expenses: D,
    pub remainder: D,
    pub collection_date: String,
    pub factor: Option<D>,
    pub index_status: String,
    pub state: String,
    pub certificate_ids: Vec<Uuid>,
}
impl LocalStore {
    pub fn certification_overview(
        &self,
        project: Uuid,
        estimate: Uuid,
        as_of: &str,
    ) -> Result<Vec<CertificationOverview>> {
        let e = self
            .get_estimate(estimate)?
            .ok_or_else(|| invalid("Presupuesto inexistente"))?;
        if e.project_id != project {
            return Err(invalid("Presupuesto ajeno a la obra"));
        }
        let Some(saved) = self.project_plan(project)? else {
            return Ok(vec![]);
        };
        let report = self.operations_report(project, Some(estimate), as_of)?;
        let f = report.financial_projection;
        let docs = self.operation_documents(Some(project))?;
        let mut cuts = saved.plan.finance.cut_dates.clone();
        cuts.sort();
        let mut start = saved.plan.calendar.start_date.clone();
        let mut rows = vec![];
        for (index, cut) in cuts.iter().enumerate() {
            let emitted: Vec<_> = docs
                .iter()
                .filter(|o| {
                    o.kind == "certificate"
                        && o.estimate_id == Some(estimate)
                        && o.period_end <= *cut
                        && o.period_end >= start
                        && o.date.as_str() <= as_of
                })
                .collect();
            let planned = f
                .as_ref()
                .and_then(|f| f.periods.iter().find(|p| p.end == *cut));
            let preview = crate::adjustments::snapshot(&self.conn, estimate, cut, as_of);
            let (factor, status) = match preview {
                Ok(Some(p)) => (
                    Some(p.factor),
                    if p.provisional {
                        format!(
                            "Provisorio · {} (corresponde {})",
                            p.applied_month, p.target_month
                        )
                    } else {
                        format!("Definitivo · {}", p.applied_month)
                    },
                ),
                Ok(None) => (Some(D::ONE), "Sin ajuste pactado".into()),
                Err(e) => (None, format!("Pendiente: {e}")),
            };
            let amount = if !emitted.is_empty() {
                emitted
                    .iter()
                    .try_fold(D::ZERO, |s, o| math(add(s, o.amount)))?
            } else {
                planned.map_or(D::ZERO, |p| p.net)
            };
            let next_expenses = if let Some(f) = &f {
                f.events
                    .iter()
                    .filter(|e| {
                        e.date > *cut && cuts.get(index + 1).is_none_or(|next| e.date <= *next)
                    })
                    .try_fold(D::ZERO, |s, e| math(add(s, e.expense)))?
            } else {
                D::ZERO
            };
            let collection = planned
                .map(|p| p.collection_date.clone())
                .unwrap_or_else(|| {
                    let d = chrono::NaiveDate::parse_from_str(cut, "%Y-%m-%d").unwrap();
                    (d + chrono::Duration::days(i64::from(
                        saved.plan.finance.collection_delay_days,
                    )))
                    .to_string()
                });
            let (factor, status) = if let Some(last) = emitted.last() {
                match &last.index_snapshot {
                    Some(s) => (
                        Some(s.factor),
                        format!(
                            "{} · {}",
                            if s.provisional {
                                "Provisorio emitido"
                            } else {
                                "Emitido con índice definitivo"
                            },
                            s.applied_month
                        ),
                    ),
                    None => (Some(D::ONE), "Emitido sin ajuste".into()),
                }
            } else {
                (factor, status)
            };
            rows.push(CertificationOverview {
                cut: cut.clone(),
                start: start.clone(),
                amount,
                next_expenses,
                remainder: math(add(amount, -next_expenses))?,
                collection_date: collection,
                factor,
                index_status: status,
                state: if emitted.is_empty() {
                    "Previsto"
                } else {
                    "Emitido"
                }
                .into(),
                certificate_ids: emitted.iter().map(|o| o.id).collect(),
            });
            start = (chrono::NaiveDate::parse_from_str(cut, "%Y-%m-%d").unwrap()
                + chrono::Duration::days(1))
            .to_string();
        }
        Ok(rows)
    }
}
