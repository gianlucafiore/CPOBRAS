use crate::{LocalStore, Result, StorageError};
use cpobras_core::{
    adjustments::IndexPoint,
    planning::{Calendar, CalendarException, Plan},
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct GeneralCalendar {
    pub revision: u32,
    pub nonworking_weekdays: Vec<u32>,
    pub exceptions: BTreeMap<String, CalendarException>,
}
impl Default for GeneralCalendar {
    fn default() -> Self {
        Self {
            revision: 0,
            nonworking_weekdays: vec![5, 6],
            exceptions: BTreeMap::new(),
        }
    }
}
impl GeneralCalendar {
    pub fn validate(&self) -> Result<()> {
        Calendar {
            start_date: "2026-01-01".into(),
            nonworking_weekdays: self.nonworking_weekdays.clone(),
            holidays: vec![],
            exceptions: self.exceptions.clone(),
        }
        .validate()
        .map_err(StorageError::InvalidValue)
    }
}
impl LocalStore {
    pub fn general_calendar(&self) -> Result<GeneralCalendar> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT calendar_json FROM system_calendar WHERE id=1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        json.map(|j| serde_json::from_str(&j).map_err(Into::into))
            .unwrap_or_else(|| Ok(GeneralCalendar::default()))
    }
    pub fn apply_general_calendar(&self, plan: &mut Plan) -> Result<()> {
        if plan.calendar_overrides.is_none() {
            let mut dates = plan.calendar.exceptions.clone();
            for day in &plan.calendar.holidays {
                dates.entry(day.clone()).or_insert(CalendarException {
                    description: "Feriado previo".into(),
                    working: false,
                });
            }
            plan.calendar_overrides = Some(cpobras_core::planning::CalendarOverrides {
                nonworking_weekdays: if plan.calendar.nonworking_weekdays == vec![5, 6] {
                    None
                } else {
                    Some(plan.calendar.nonworking_weekdays.clone())
                },
                exceptions: dates,
            });
        }
        if let Some(local) = &plan.calendar_overrides {
            let general = self.general_calendar()?;
            plan.calendar.nonworking_weekdays = local
                .nonworking_weekdays
                .clone()
                .unwrap_or(general.nonworking_weekdays);
            plan.calendar.exceptions = general.exceptions;
            for (day, entry) in &local.exceptions {
                let mut entry = entry.clone();
                if let Some(g) = plan.calendar.exceptions.get(day) {
                    if !g.description.is_empty() && !entry.description.contains(&g.description) {
                        entry.description = format!("{} · {}", g.description, entry.description)
                            .chars()
                            .take(500)
                            .collect();
                    }
                }
                plan.calendar.exceptions.insert(day.clone(), entry);
            }
            plan.calendar.holidays = vec![];
        }
        Ok(())
    }
    pub fn save_general_calendar(&mut self, input: &GeneralCalendar) -> Result<GeneralCalendar> {
        input.validate()?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let revision: u32 = tx.query_row(
            "SELECT COALESCE((SELECT revision FROM system_calendar WHERE id=1),0)",
            [],
            |r| r.get(0),
        )?;
        if revision != input.revision {
            return Err(StorageError::InvalidValue(
                "El calendario general cambió; recargá antes de guardar".into(),
            ));
        }
        let mut saved = input.clone();
        saved.revision = revision
            .checked_add(1)
            .ok_or_else(|| StorageError::InvalidValue("Revisión fuera de rango".into()))?;
        tx.execute("INSERT INTO system_calendar(id,revision,calendar_json) VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,calendar_json=excluded.calendar_json",params![saved.revision,serde_json::to_string(&saved)?])?;
        tx.commit()?;
        Ok(saved)
    }
    pub fn index_points(&self) -> Result<Vec<IndexPoint>> {
        crate::adjustments::points(&self.conn)
    }
    pub fn save_index_point(&mut self, point: &IndexPoint) -> Result<IndexPoint> {
        point.validate().map_err(StorageError::InvalidValue)?;
        self.conn.execute("INSERT INTO index_points(id,series,period,value,publication_date,source) VALUES(?1,?2,?3,?4,?5,?6)",params![point.id.to_string(),point.series,point.period,point.value.to_string(),point.publication_date,point.source])?;
        Ok(point.clone())
    }
}
