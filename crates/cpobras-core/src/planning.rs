//! Working-day CPM, dependency constraints and valued schedules.
use chrono::{Datelike, Duration, NaiveDate};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarException {
    pub description: String,
    pub working: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Calendar {
    #[serde(default)]
    pub exceptions: BTreeMap<String, CalendarException>,
    pub start_date: String,
    pub nonworking_weekdays: Vec<u32>,
    pub holidays: Vec<String>,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum DependencyKind {
    FS,
    SS,
    FF,
    SF,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub task_id: Uuid,
    pub kind: DependencyKind,
    pub lag_days: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assignment {
    pub resource_id: Uuid,
    pub units_per_day: Decimal,
    pub kind: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub estimate_line_id: Option<Uuid>,
    pub name: String,
    pub duration_days: u32,
    pub predecessors: Vec<Dependency>,
    pub not_before: Option<String>,
    pub finish_by: Option<String>,
    pub assignments: Vec<Assignment>,
    pub budget: Decimal,
    pub actual_progress: Decimal,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PertPresentation {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub estimates: Option<[u32; 3]>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSegment {
    pub group_id: Uuid,
    pub percent: Decimal,
    pub base_budget: Decimal,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct FinanceSettings {
    pub cut_dates: Vec<String>,
    pub collection_delay_days: u32,
    pub opening_cash: Decimal,
    pub cash_currency: Option<String>,
    pub retention_percent: Decimal,
    pub advance_recovery_percent: Decimal,
}
impl FinanceSettings {
    pub fn validate(&self, start: &str) -> Result<(), String> {
        if self
            .cash_currency
            .as_ref()
            .is_some_and(|s| !["ARS", "USD"].contains(&s.as_str()))
        {
            return Err("Moneda de caja inválida".into());
        }
        if self.cut_dates.len() > 240
            || self.collection_delay_days > 365
            || self.opening_cash < Decimal::ZERO
            || self.retention_percent < Decimal::ZERO
            || self.retention_percent > Decimal::from(100)
            || self.advance_recovery_percent < Decimal::ZERO
            || self.advance_recovery_percent > Decimal::from(100)
        {
            return Err("Configuración financiera inválida".into());
        }
        let mut dates = BTreeSet::new();
        for day in &self.cut_dates {
            let parsed = NaiveDate::parse_from_str(day, "%Y-%m-%d")
                .map_err(|_| "Fecha de corte inválida")?;
            if parsed.to_string() != *day
                || day.as_str() < start
                || parsed.year() > 9998
                || !dates.insert(day)
            {
                return Err("Los cortes deben ser únicos y posteriores al inicio de obra".into());
            }
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    #[serde(default)]
    pub finance: FinanceSettings,
    #[serde(default)]
    pub segments: BTreeMap<Uuid, TaskSegment>,
    #[serde(default)]
    pub presentation: BTreeMap<Uuid, PertPresentation>,
    pub calendar: Calendar,
    pub tasks: Vec<Task>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: Uuid,
    pub start: String,
    pub finish: String,
    pub start_day: i32,
    pub finish_day: i32,
    pub float_days: i32,
    pub critical: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurvePoint {
    pub date: String,
    pub period_cost: Decimal,
    pub cumulative_cost: Decimal,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub tasks: Vec<ScheduledTask>,
    pub duration_days: i32,
    pub finish: String,
    pub curve: Vec<CurvePoint>,
    pub budget: Decimal,
    pub planned_progress: Decimal,
    pub actual_progress: Decimal,
    pub warnings: Vec<String>,
}

fn date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| format!("Fecha inválida: {value}"))
}
impl Calendar {
    fn validate(&self) -> Result<(), String> {
        date(&self.start_date)?;
        let weekdays: BTreeSet<_> = self.nonworking_weekdays.iter().copied().collect();
        if weekdays.len() == 7 || weekdays.iter().any(|day| *day > 6) {
            return Err("El calendario debe tener días laborables".into());
        }
        if self.exceptions.len() > 10000 {
            return Err("Máximo 10.000 fechas especiales por calendario".into());
        }
        for (day, exception) in &self.exceptions {
            date(day)?;
            if exception.description.chars().count() > 500 {
                return Err("Descripción de fecha demasiado larga".into());
            }
        }
        for holiday in &self.holidays {
            date(holiday)?;
        }
        Ok(())
    }
    pub fn working(&self, day: NaiveDate) -> bool {
        if let Some(exception) = self.exceptions.get(&day.to_string()) {
            return exception.working;
        }

        !self
            .nonworking_weekdays
            .contains(&day.weekday().num_days_from_monday())
            && !self.holidays.contains(&day.to_string())
    }
    fn dates(&self, count: usize) -> Result<Vec<NaiveDate>, String> {
        self.validate()?;
        let mut current = date(&self.start_date)?;
        let mut days = Vec::with_capacity(count);
        for _ in 0..365_000 {
            if self.working(current) {
                days.push(current);
                if days.len() == count {
                    return Ok(days);
                }
            }
            current = current
                .checked_add_signed(Duration::days(1))
                .ok_or("Calendario fuera de rango")?;
        }
        Err("Calendario excede el horizonte admitido".into())
    }
}
fn offset(kind: DependencyKind, predecessor_duration: i32, duration: i32, lag: i32) -> i32 {
    lag + match kind {
        DependencyKind::FS => predecessor_duration,
        DependencyKind::SS => 0,
        DependencyKind::FF => predecessor_duration - duration,
        DependencyKind::SF => -duration,
    }
}

impl Plan {
    pub fn schedule(&self, as_of: &str) -> Result<Schedule, String> {
        self.finance.validate(&self.calendar.start_date)?;
        let mut line_allocations = BTreeMap::<Uuid, Decimal>::new();
        let mut groups = BTreeMap::<Uuid, (Option<Uuid>, Decimal, Decimal)>::new();
        for task in &self.tasks {
            let part = self.segments.get(&task.id);
            let percent = part.map_or(Decimal::from(100), |p| p.percent);
            if percent <= Decimal::ZERO || percent > Decimal::from(100) {
                return Err(
                    "El porcentaje de un tramo debe ser mayor que 0 y no superar 100".into(),
                );
            }
            if let Some(line) = task.estimate_line_id {
                let sum = line_allocations.entry(line).or_default();
                *sum = sum
                    .checked_add(percent)
                    .ok_or("Porcentaje fuera de rango")?;
                if *sum > Decimal::from(100) {
                    return Err("Los tramos superan el 100 % de la partida".into());
                }
            }
            if let Some(p) = part {
                if p.base_budget < Decimal::ZERO {
                    return Err("Costo de origen inválido".into());
                }
                let group = groups.entry(p.group_id).or_insert((
                    task.estimate_line_id,
                    p.base_budget,
                    Decimal::ZERO,
                ));
                if group.0 != task.estimate_line_id || group.1 != p.base_budget {
                    return Err(
                        "Los tramos deben conservar la misma partida y costo de origen".into(),
                    );
                }
                group.2 = group
                    .2
                    .checked_add(percent)
                    .ok_or("Porcentaje fuera de rango")?;
                if group.2 > Decimal::from(100) {
                    return Err("Los tramos superan el 100 % de su tarea original".into());
                }
            }
        }
        if self
            .segments
            .keys()
            .any(|id| !self.tasks.iter().any(|t| t.id == *id))
        {
            return Err("Tramo de tarea inexistente".into());
        }
        for (id, node) in &self.presentation {
            if !node.x.is_finite()
                || !node.y.is_finite()
                || node.x.abs() > 10000000.0
                || node.y.abs() > 10000000.0
                || !self.tasks.iter().any(|t| t.id == *id)
            {
                return Err("Posición PERT inválida".into());
            }
            if let Some([o, m, p]) = node.estimates {
                if o > m || m > p || p > 36500 {
                    return Err("PERT requiere optimista ≤ probable ≤ pesimista".into());
                }
                let expected = (o + 4 * m + p).div_ceil(6);
                if self
                    .tasks
                    .iter()
                    .find(|t| t.id == *id)
                    .unwrap()
                    .duration_days
                    != expected
                {
                    return Err("La duración no coincide con la estimación PERT".into());
                }
            }
        }
        let today = date(as_of)?;
        if self.tasks.len() > 10_000 {
            return Err("Máximo 10.000 tareas por cronograma".into());
        }
        let map: BTreeMap<_, _> = self.tasks.iter().map(|task| (task.id, task)).collect();
        if map.len() != self.tasks.len() {
            return Err("Identificadores de tarea repetidos".into());
        }
        let total_duration: u32 = self.tasks.iter().try_fold(0u32, |total, task| {
            if task.name.trim().is_empty()
                || task.duration_days > 36_500
                || task.budget < Decimal::ZERO
                || task.actual_progress < Decimal::ZERO
                || task.actual_progress > Decimal::from(100)
            {
                return Err("Nombre, duración, presupuesto o avance inválido".to_string());
            }
            for assignment in &task.assignments {
                if assignment.units_per_day < Decimal::ZERO
                    || !["crew", "equipment", "resource"].contains(&assignment.kind.as_str())
                {
                    return Err("Asignación de recursos inválida".into());
                }
            }
            let mut parents = BTreeSet::new();
            let mut parent = task.parent_id;
            while let Some(id) = parent {
                if id == task.id || !parents.insert(id) {
                    return Err("Jerarquía de tareas circular".into());
                }
                parent = map.get(&id).ok_or("Tarea superior inexistente")?.parent_id;
            }
            if let Some(value) = &task.not_before {
                date(value)?;
            }
            if let Some(value) = &task.finish_by {
                date(value)?;
            }
            total
                .checked_add(task.duration_days)
                .ok_or("Duración fuera de rango".into())
        })?;
        if total_duration > 36_500 {
            return Err("El cronograma excede 36.500 días laborables".into());
        }
        let days = self.calendar.dates(36_502)?;
        let mut pending: BTreeSet<Uuid> = map.keys().copied().collect();
        let mut order = Vec::new();
        let mut starts: BTreeMap<Uuid, i32> = BTreeMap::new();
        while !pending.is_empty() {
            let ready: Vec<_> = pending
                .iter()
                .copied()
                .filter(|id| {
                    map[id]
                        .predecessors
                        .iter()
                        .all(|dep| starts.contains_key(&dep.task_id))
                })
                .collect();
            if ready.is_empty() {
                return Err("Dependencias circulares o referencias a tareas inexistentes".into());
            }
            for id in ready {
                let task = map[&id];
                let mut start = 0;
                if let Some(value) = &task.not_before {
                    let constraint = date(value)?;
                    start = days.partition_point(|day| *day < constraint) as i32;
                }
                for dep in &task.predecessors {
                    if dep.lag_days.unsigned_abs() > 36_500 {
                        return Err("Desfase fuera de rango".into());
                    }
                    start = start.max(
                        starts[&dep.task_id]
                            + offset(
                                dep.kind,
                                map[&dep.task_id].duration_days as i32,
                                task.duration_days as i32,
                                dep.lag_days,
                            ),
                    );
                }
                if start + task.duration_days as i32 > 36_500 {
                    return Err("Fechas fuera del horizonte del cronograma".into());
                }
                starts.insert(id, start);
                order.push(id);
                pending.remove(&id);
            }
        }
        let finish = self
            .tasks
            .iter()
            .map(|task| starts[&task.id] + task.duration_days as i32)
            .max()
            .unwrap_or(0);
        let mut latest: BTreeMap<_, _> = self
            .tasks
            .iter()
            .map(|task| (task.id, finish - task.duration_days as i32))
            .collect();
        for id in order.iter().rev() {
            let task = map[id];
            for dep in &task.predecessors {
                let bound = latest[id]
                    - offset(
                        dep.kind,
                        map[&dep.task_id].duration_days as i32,
                        task.duration_days as i32,
                        dep.lag_days,
                    );
                latest
                    .entry(dep.task_id)
                    .and_modify(|value| *value = (*value).min(bound));
            }
        }
        let mut warnings = Vec::new();
        let mut output = Vec::new();
        let last_event_day = self
            .tasks
            .iter()
            .map(|task| {
                starts[&task.id]
                    + if task.duration_days == 0 {
                        0
                    } else {
                        task.duration_days as i32 - 1
                    }
            })
            .max()
            .unwrap_or(0);
        let mut periods = vec![Decimal::ZERO; (last_event_day + 1) as usize];
        let mut total = Decimal::ZERO;
        let mut planned = Decimal::ZERO;
        let mut actual = Decimal::ZERO;
        for task in &self.tasks {
            let start = starts[&task.id];
            let end = start + task.duration_days as i32;
            let finish_date = days[if end > start { end - 1 } else { end } as usize];
            if let Some(deadline) = &task.finish_by {
                if finish_date > date(deadline)? {
                    warnings.push(format!("{} supera su fecha límite", task.name));
                }
            }
            output.push(ScheduledTask {
                id: task.id,
                start: days[start as usize].to_string(),
                finish: finish_date.to_string(),
                start_day: start,
                finish_day: end,
                float_days: latest[&task.id] - start,
                critical: latest[&task.id] == start,
            });
            total = total
                .checked_add(task.budget)
                .ok_or("Desborde del presupuesto del plan")?;
            actual = actual
                .checked_add(
                    task.budget
                        .checked_mul(task.actual_progress / Decimal::from(100))
                        .ok_or("Desborde del avance real")?,
                )
                .ok_or("Desborde del avance real")?;
            if task.duration_days == 0 {
                let day = (start as usize).min(periods.len() - 1);
                periods[day] += task.budget;
                if days[start as usize] <= today {
                    planned += task.budget;
                }
            } else {
                let mut distributed = Decimal::ZERO;
                for day in start..end {
                    let amount = if day == end - 1 {
                        task.budget - distributed
                    } else {
                        (task.budget / Decimal::from(task.duration_days)).round_dp_with_strategy(
                            task.budget.scale().max(2),
                            rust_decimal::RoundingStrategy::ToZero,
                        )
                    };
                    distributed += amount;
                    periods[day as usize] += amount;
                    if days[day as usize] <= today {
                        planned += amount;
                    }
                }
            }
        }
        let mut cumulative = Decimal::ZERO;
        let curve = periods
            .iter()
            .enumerate()
            .map(|(index, amount)| {
                cumulative += amount;
                CurvePoint {
                    date: days[index].to_string(),
                    period_cost: *amount,
                    cumulative_cost: cumulative,
                }
            })
            .collect();
        Ok(Schedule {
            tasks: output,
            duration_days: finish,
            finish: days[last_event_day as usize].to_string(),
            curve,
            budget: total,
            planned_progress: if total.is_zero() {
                Decimal::ZERO
            } else {
                planned / total * Decimal::from(100)
            },
            actual_progress: if total.is_zero() {
                Decimal::ZERO
            } else {
                actual / total * Decimal::from(100)
            },
            warnings,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn task(name: &str, duration: u32) -> Task {
        Task {
            id: Uuid::new_v4(),
            parent_id: None,
            estimate_line_id: None,
            name: name.into(),
            duration_days: duration,
            predecessors: vec![],
            not_before: None,
            finish_by: None,
            assignments: vec![],
            budget: Decimal::from(100),
            actual_progress: Decimal::ZERO,
        }
    }
    fn plan(tasks: Vec<Task>) -> Plan {
        Plan {
            finance: Default::default(),
            segments: BTreeMap::new(),
            presentation: BTreeMap::new(),
            calendar: Calendar {
                exceptions: BTreeMap::new(),
                start_date: "2026-11-06".into(),
                nonworking_weekdays: vec![5, 6],
                holidays: vec!["2026-11-09".into()],
            },
            tasks,
        }
    }
    #[test]
    fn pert_positions_do_not_change_schedule_and_estimates_are_validated() {
        let mut a = task("PERT", 3);
        a.duration_days = 3;
        let id = a.id;
        let mut p = plan(vec![a]);
        let snapshot = |p: &Plan| {
            let s = p.schedule("2026-11-06").unwrap();
            (
                s.duration_days,
                s.finish,
                s.tasks
                    .into_iter()
                    .map(|t| (t.id, t.start, t.finish, t.float_days, t.critical))
                    .collect::<Vec<_>>(),
            )
        };
        let before = snapshot(&p);
        p.presentation.insert(
            id,
            PertPresentation {
                x: 30.0,
                y: 80.0,
                estimates: Some([1, 2, 6]),
            },
        );
        assert_eq!(snapshot(&p), before);
        p.presentation.get_mut(&id).unwrap().x = 900.0;
        assert_eq!(snapshot(&p), before);
        p.presentation.get_mut(&id).unwrap().estimates = Some([4, 2, 6]);
        assert!(p.schedule("2026-11-06").is_err());
        p.presentation.get_mut(&id).unwrap().estimates = None;
        p.presentation.get_mut(&id).unwrap().x = f64::NAN;
        assert!(p.schedule("2026-11-06").is_err());
    }
    #[test]
    fn parallel_branches_take_the_longest_path_instead_of_summing_all_red_tasks() {
        let a = task("Limpieza", 1);
        let mut b = task("Nivelación", 1);
        let mut c = task("Perforación", 1);
        let mut d = task("Cercado", 1);
        let mut e = task("Replanteo", 1);
        let mut f = task("Obrador", 2);
        let mut g = task("Excavación", 4);
        let dep = |id| Dependency {
            task_id: id,
            kind: DependencyKind::FS,
            lag_days: 0,
        };
        b.predecessors.push(dep(a.id));
        c.predecessors.push(dep(a.id));
        d.predecessors = vec![dep(b.id), dep(c.id)];
        e.predecessors.push(dep(d.id));
        f.predecessors.push(dep(d.id));
        g.predecessors.push(dep(e.id));
        let gid = g.id;
        let fid = f.id;
        let mut p = plan(vec![a, b, c, d, e, f, g]);
        p.calendar.start_date = "2026-11-09".into();
        p.calendar.holidays.clear();
        let s = p.schedule("2026-11-09").unwrap();
        assert_eq!(s.duration_days, 8);
        assert_eq!(s.finish, "2026-11-18");
        p.tasks
            .iter_mut()
            .find(|t| t.id == gid)
            .unwrap()
            .predecessors
            .push(dep(fid));
        assert_eq!(p.schedule("2026-11-09").unwrap().duration_days, 9);
        p.tasks.iter_mut().find(|t| t.id == fid).unwrap().not_before = Some("2026-11-13".into());
        assert_eq!(p.schedule("2026-11-09").unwrap().duration_days, 10);
    }
    #[test]
    fn described_working_dates_override_weekends_and_legacy_holidays() {
        let mut p = plan(vec![task("Calendario especial", 6)]);
        p.calendar.start_date = "2026-11-09".into();
        p.calendar.holidays = vec!["2026-11-10".into()];
        p.calendar.exceptions = BTreeMap::from([
            (
                "2026-11-10".into(),
                CalendarException {
                    description: "Día laborable".into(),
                    working: true,
                },
            ),
            (
                "2026-11-13".into(),
                CalendarException {
                    description: "Feriado de obra".into(),
                    working: false,
                },
            ),
            (
                "2026-11-14".into(),
                CalendarException {
                    description: "Sábado habilitado".into(),
                    working: true,
                },
            ),
        ]);
        let s = p.schedule("2026-11-09").unwrap();
        assert_eq!(s.finish, "2026-11-16");
        assert_eq!(s.duration_days, 6);
        assert!(s.curve.iter().any(|r| r.date == "2026-11-14"));
        assert!(!s.curve.iter().any(|r| r.date == "2026-11-13"));
        p.calendar.exceptions.insert(
            "2026-02-30".into(),
            CalendarException {
                description: "Inválido".into(),
                working: false,
            },
        );
        assert!(p.schedule("2026-11-09").is_err());
    }
    #[test]
    fn cpm_skips_weekends_holidays_and_computes_float() {
        let a = task("A", 2);
        let mut b = task("B", 3);
        let c = task("C", 1);
        b.predecessors.push(Dependency {
            task_id: a.id,
            kind: DependencyKind::FS,
            lag_days: 0,
        });
        let schedule = plan(vec![a.clone(), b.clone(), c.clone()])
            .schedule("2026-11-06")
            .unwrap();
        assert_eq!(schedule.duration_days, 5);
        assert_eq!(schedule.tasks[0].finish, "2026-11-10");
        assert_eq!(schedule.tasks[1].start, "2026-11-11");
        assert!(schedule.tasks[0].critical);
        assert_eq!(schedule.tasks[2].float_days, 4);
        assert_eq!(
            schedule.curve.last().unwrap().cumulative_cost,
            Decimal::from(300)
        );
    }
    #[test]
    fn rejects_cycles_and_unknown_tasks() {
        let mut a = task("A", 1);
        a.predecessors.push(Dependency {
            task_id: a.id,
            kind: DependencyKind::FS,
            lag_days: 0,
        });
        assert!(plan(vec![a]).schedule("2026-11-06").is_err());
    }
    #[test]
    fn valued_progress_and_constraint_are_explicit() {
        let mut a = task("A", 2);
        a.actual_progress = Decimal::from(25);
        a.not_before = Some("2026-11-10".into());
        let schedule = plan(vec![a]).schedule("2026-11-10").unwrap();
        assert_eq!(schedule.planned_progress, Decimal::from(50));
        assert_eq!(schedule.actual_progress, Decimal::from(25));
    }
    #[test]
    fn supports_ss_ff_sf_dependencies_and_milestones() {
        for kind in [DependencyKind::SS, DependencyKind::FF, DependencyKind::SF] {
            let a = task("A", 3);
            let mut b = task("B", 1);
            b.predecessors.push(Dependency {
                task_id: a.id,
                kind,
                lag_days: 1,
            });
            assert!(plan(vec![a, b, task("Hito", 0)])
                .schedule("2026-11-06")
                .is_ok());
        }
    }
    #[test]
    fn tiny_budgets_have_nonnegative_cashflow_and_exact_total() {
        let mut item = task("Tarea de bajo costo", 4);
        item.budget = Decimal::new(2, 2);
        let result = plan(vec![item]).schedule("2026-11-05").unwrap();
        assert!(result
            .curve
            .iter()
            .all(|point| point.period_cost >= Decimal::ZERO));
        assert_eq!(
            result.curve.last().unwrap().cumulative_cost,
            Decimal::new(2, 2)
        );
    }
    #[test]
    fn milestone_cashflow_uses_its_actual_scheduled_day() {
        let first = task("Trabajo", 2);
        let mut milestone = task("Certificación prevista", 0);
        milestone.predecessors.push(Dependency {
            task_id: first.id,
            kind: DependencyKind::FS,
            lag_days: 0,
        });
        let result = plan(vec![first, milestone]).schedule("2026-11-10").unwrap();
        assert_eq!(result.tasks[1].finish, "2026-11-11");
        assert_eq!(result.curve.last().unwrap().date, result.tasks[1].finish);
        assert_eq!(result.finish, result.tasks[1].finish);
        assert_eq!(result.planned_progress, Decimal::from(50));
    }
}
