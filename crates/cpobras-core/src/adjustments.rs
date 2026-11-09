//! Contractual index baskets. A certificate freezes the publications known on its issue date.
use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndexWeight {
    pub series: String,
    pub weight: D,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_month: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdjustmentAgreement {
    pub base_month: String,
    pub lag_months: u32,
    pub weights: Vec<IndexWeight>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndexPoint {
    pub id: Uuid,
    pub series: String,
    pub period: String,
    pub value: D,
    pub publication_date: String,
    pub source: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppliedIndex {
    pub series: String,
    pub weight: D,
    pub base: IndexPoint,
    pub current: IndexPoint,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdjustmentSnapshot {
    pub agreement: AdjustmentAgreement,
    pub target_month: String,
    pub applied_month: String,
    pub provisional: bool,
    pub factor: D,
    pub indices: Vec<AppliedIndex>,
}
pub fn month(s: &str) -> Result<NaiveDate, String> {
    let d =
        NaiveDate::parse_from_str(&format!("{s}-01"), "%Y-%m-%d").map_err(|_| "Mes inválido")?;
    if d.format("%Y-%m").to_string() != s || d.year() < 1 || d.year() > 9998 {
        return Err("Mes inválido".into());
    }
    Ok(d)
}
pub fn multiply(a: D, b: D) -> Result<D, String> {
    a.checked_mul(b)
        .ok_or_else(|| "Importe fuera de rango".into())
}
pub fn add(a: D, b: D) -> Result<D, String> {
    a.checked_add(b)
        .ok_or_else(|| "Importe fuera de rango".into())
}
impl IndexPoint {
    pub fn validate(&self) -> Result<(), String> {
        month(&self.period)?;
        let p = NaiveDate::parse_from_str(&self.publication_date, "%Y-%m-%d")
            .map_err(|_| "Fecha de publicación inválida")?;
        if self.id.is_nil()
            || p.to_string() != self.publication_date
            || p < month(&self.period)?
            || self.series.trim() != self.series
            || self.series.is_empty()
            || self.series.len() > 80
            || self.value <= D::ZERO
            || self.source.len() > 2000
            || !(self.source.starts_with("https://") || self.source.starts_with("http://"))
        {
            return Err(
                "Índice: revisá serie, mes, valor positivo, fecha y enlace de la fuente".into(),
            );
        }
        Ok(())
    }
}
impl AdjustmentAgreement {
    pub fn validate(&self) -> Result<(), String> {
        month(&self.base_month)?;
        if self.lag_months > 24 || self.weights.is_empty() || self.weights.len() > 20 {
            return Err("Acuerdo de ajuste inválido".into());
        }
        let mut seen = BTreeSet::new();
        let mut sum = D::ZERO;
        for w in &self.weights {
            month(w.base_month.as_deref().unwrap_or(&self.base_month))?;
            if w.series.trim().is_empty()
                || w.series.len() > 80
                || w.series.trim() != w.series
                || w.weight <= D::ZERO
                || !seen.insert(&w.series)
            {
                return Err("Los índices deben ser únicos y tener peso positivo".into());
            }
            sum = add(sum, w.weight)?;
        }
        if sum != D::ONE {
            return Err("Los pesos del acuerdo deben sumar 100 %".into());
        }
        Ok(())
    }
    fn latest_base(&self) -> &str {
        self.weights
            .iter()
            .map(|w| w.base_month.as_deref().unwrap_or(&self.base_month))
            .max()
            .unwrap_or(&self.base_month)
    }
    pub fn target_month(&self, date: &str) -> Result<String, String> {
        let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "Fecha inválida")?;
        let n = d.year() * 12 + d.month0() as i32 - self.lag_months as i32;
        let year = n.div_euclid(12);
        if year < 1 {
            return Err("Mes objetivo fuera de rango".into());
        }
        let s = format!("{:04}-{:02}", year, n.rem_euclid(12) + 1);
        if s.as_str() < self.latest_base() {
            return Err("El mes de ajuste es anterior al mes base".into());
        }
        Ok(s)
    }
    pub fn resolve(
        &self,
        target: &str,
        as_of: &str,
        points: &[IndexPoint],
    ) -> Result<AdjustmentSnapshot, String> {
        self.validate()?;
        month(target)?;
        if target < self.latest_base() {
            return Err("El ajuste precede al mes base".into());
        }
        let find = |series: &str, period: &str| {
            points
                .iter()
                .filter(|p| {
                    p.series == series && p.period == period && p.publication_date.as_str() <= as_of
                })
                .max_by(|a, b| a.publication_date.cmp(&b.publication_date))
        };
        let candidates: BTreeSet<_> = points
            .iter()
            .filter(|p| {
                p.period.as_str() <= target
                    && p.period.as_str() >= self.latest_base()
                    && p.publication_date.as_str() <= as_of
            })
            .map(|p| p.period.clone())
            .collect();
        for candidate in candidates.into_iter().rev() {
            let mut indices = vec![];
            let mut factor = D::ZERO;
            for w in &self.weights {
                if let (Some(base), Some(current)) = (
                    find(
                        &w.series,
                        w.base_month.as_deref().unwrap_or(&self.base_month),
                    ),
                    find(&w.series, &candidate),
                ) {
                    let ratio = current
                        .value
                        .checked_div(base.value)
                        .ok_or("Índice base inválido")?;
                    factor = add(factor, multiply(w.weight, ratio)?)?;
                    indices.push(AppliedIndex {
                        series: w.series.clone(),
                        weight: w.weight,
                        base: base.clone(),
                        current: current.clone(),
                    });
                } else {
                    break;
                }
            }
            if indices.len() == self.weights.len() {
                return Ok(AdjustmentSnapshot {
                    agreement: self.clone(),
                    target_month: target.into(),
                    applied_month: candidate.clone(),
                    provisional: candidate.as_str() != target,
                    factor,
                    indices,
                });
            }
        }
        Err("Faltan índices publicados del mes base o un mes común para todos los índices del acuerdo".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn p(series: &str, period: &str, value: i64, published: &str) -> IndexPoint {
        IndexPoint {
            id: Uuid::new_v4(),
            series: series.into(),
            period: period.into(),
            value: value.into(),
            publication_date: published.into(),
            source: "https://example.org/publicacion".into(),
        }
    }
    #[test]
    fn basket_uses_ratios_and_last_common_published_month_with_frozen_sources() {
        let a = AdjustmentAgreement {
            base_month: "2026-09".into(),
            lag_months: 1,
            weights: vec![
                IndexWeight {
                    base_month: None,
                    series: "CAC".into(),
                    weight: "0.6".parse().unwrap(),
                },
                IndexWeight {
                    base_month: None,
                    series: "IPC".into(),
                    weight: "0.4".parse().unwrap(),
                },
            ],
        };
        let mut points = vec![
            p("CAC", "2026-09", 100, "2026-10-01"),
            p("IPC", "2026-09", 200, "2026-10-02"),
            p("CAC", "2026-10", 150, "2026-11-01"),
            p("IPC", "2026-10", 220, "2026-11-02"),
            p("CAC", "2026-11", 160, "2026-12-01"),
        ];
        assert_eq!(a.target_month("2026-12-20").unwrap(), "2026-11");
        let provisional = a.resolve("2026-11", "2026-12-01", &points).unwrap();
        assert!(provisional.provisional);
        assert_eq!(provisional.applied_month, "2026-10");
        assert_eq!(provisional.factor, "1.34".parse::<D>().unwrap());
        points.push(p("IPC", "2026-11", 240, "2026-12-02"));
        let definitive = a.resolve("2026-11", "2026-12-02", &points).unwrap();
        assert!(!definitive.provisional);
        assert_eq!(definitive.factor, "1.44".parse::<D>().unwrap());
        assert_eq!(provisional.indices[1].current.value, 220.into());
        assert_eq!(
            a.resolve("2026-11", "2026-12-01", &points).unwrap().factor,
            provisional.factor
        );
        assert!(a.resolve("2026-11", "2026-09-01", &points).is_err());
    }
    #[test]
    fn basket_accepts_independent_loaded_base_periods() {
        let a = AdjustmentAgreement {
            base_month: "2026-08".into(),
            lag_months: 0,
            weights: vec![
                IndexWeight {
                    series: "CAC".into(),
                    weight: "0.5".parse().unwrap(),
                    base_month: Some("2026-09".into()),
                },
                IndexWeight {
                    series: "IPC".into(),
                    weight: "0.5".parse().unwrap(),
                    base_month: Some("2026-08".into()),
                },
            ],
        };
        let points = vec![
            p("CAC", "2026-09", 100, "2026-10-01"),
            p("IPC", "2026-08", 200, "2026-09-01"),
            p("CAC", "2026-10", 150, "2026-11-01"),
            p("IPC", "2026-10", 220, "2026-11-01"),
        ];
        let snapshot = a.resolve("2026-10", "2026-11-05", &points).unwrap();
        assert_eq!(snapshot.factor, "1.30".parse::<D>().unwrap());
        assert_eq!(snapshot.indices[0].base.period, "2026-09");
        assert_eq!(snapshot.indices[1].base.period, "2026-08");
        assert!(a.target_month("2026-08-31").is_err());
    }
    #[test]
    fn agreement_rejects_duplicate_series_bad_weights_missing_base_and_invalid_points() {
        let mut a = AdjustmentAgreement {
            base_month: "2026-09".into(),
            lag_months: 0,
            weights: vec![IndexWeight {
                base_month: None,
                series: "CAC".into(),
                weight: D::ONE,
            }],
        };
        assert!(a
            .resolve(
                "2026-10",
                "2026-11-01",
                &[p("CAC", "2026-10", 110, "2026-11-01")]
            )
            .is_err());
        a.weights.push(a.weights[0].clone());
        assert!(a.validate().is_err());
        a.weights.pop();
        a.weights[0].weight = "0.9".parse().unwrap();
        assert!(a.validate().is_err());
        assert!(p("CAC", "2026-10", 0, "2026-11-01").validate().is_err());
        assert!(p("CAC", "2026-10", 100, "2026-09-01").validate().is_err());
    }
}
