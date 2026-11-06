//! Selective takeoff patterns: persistent snapshots and atomic appends to an existing draft.
use crate::{
    budget_tools::{BudgetDocument, BudgetTemplate},
    LocalStore, Result, StorageError,
};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PatternSource {
    pub estimate_id: Option<Uuid>,
    pub template_id: Option<Uuid>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PatternSelection {
    pub line_ids: Vec<Uuid>,
    pub section_ids: Vec<Uuid>,
}
#[derive(Debug, Serialize)]
pub struct PatternApplied {
    pub line_ids: Vec<Uuid>,
    pub section_ids: Vec<Uuid>,
    pub takeoff_count: usize,
}
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
fn selected_document(
    mut d: BudgetDocument,
    s: &PatternSelection,
    prices: bool,
) -> Result<BudgetDocument> {
    if s.line_ids.len() > 10000
        || s.section_ids.len() > 5000
        || s.line_ids.is_empty() && s.section_ids.is_empty()
    {
        return Err(invalid("Seleccioná al menos una partida o rubro"));
    }
    let sections: BTreeMap<_, _> = d.sections.iter().map(|r| (r.id, r.parent_id)).collect();
    let mut selected_sections: BTreeSet<_> = s.section_ids.iter().copied().collect();
    let mut selected_lines: BTreeSet<_> = s.line_ids.iter().copied().collect();
    if selected_sections
        .iter()
        .any(|id| !sections.contains_key(id))
        || selected_lines
            .iter()
            .any(|id| !d.lines.iter().any(|l| l.id == *id))
    {
        return Err(invalid(
            "La selección cambió o no pertenece al origen. Volvé a cargar el árbol",
        ));
    }
    // Expand selected rubros first; ancestor scaffolding added later must not select siblings.
    loop {
        let old = selected_sections.len();
        for r in &d.sections {
            if r.parent_id.is_some_and(|p| selected_sections.contains(&p)) {
                selected_sections.insert(r.id);
            }
        }
        if old == selected_sections.len() {
            break;
        }
    }
    for (line, section) in &d.assignments {
        if selected_sections.contains(section) {
            selected_lines.insert(*line);
        }
    }
    let mut ancestors = selected_sections.clone();
    for (line, section) in &d.assignments {
        if selected_lines.contains(line) {
            ancestors.insert(*section);
        }
    }
    let initial: Vec<_> = ancestors.iter().copied().collect();
    for id in initial {
        let mut seen = BTreeSet::new();
        let mut next = Some(id);
        while let Some(id) = next {
            if !seen.insert(id) {
                return Err(invalid("Jerarquía de origen circular"));
            }
            let parent = sections
                .get(&id)
                .ok_or_else(|| invalid("Jerarquía de origen incompleta"))?;
            ancestors.insert(id);
            next = *parent;
        }
    }
    d.sections.retain(|r| ancestors.contains(&r.id));
    d.lines.retain(|l| selected_lines.contains(&l.id));
    d.assignments.retain(|(l, _)| selected_lines.contains(l));
    d.takeoffs.retain(|r| selected_lines.contains(&r.line_id));
    d.formulas.retain(|r| selected_lines.contains(&r.line_id));
    let analyses: BTreeSet<_> = d.lines.iter().filter_map(|l| l.analysis_id).collect();
    d.line_analyses.retain(|a| analyses.contains(&a.id));
    if !prices {
        for line in &mut d.lines {
            line.unit_cost_snapshot = Decimal::ZERO;
            line.analysis_id = None;
        }
        d.line_analyses.clear();
    }
    if d.lines.len() > 10000 || d.sections.len() > 5000 || d.takeoffs.len() > 100000 {
        return Err(invalid("El patrón supera el tamaño admitido"));
    }
    d.price_definition = None;
    d.rates = Default::default();
    d.format_version = 1;
    Ok(d)
}
impl LocalStore {
    pub fn pattern_document(&self, source: &PatternSource) -> Result<BudgetDocument> {
        let mut d = match (source.estimate_id, source.template_id) {
            (Some(id), None) => self.export_budget(id)?,
            (None, Some(id)) => {
                let json: Option<String> = self
                    .conn
                    .query_row(
                        "SELECT document_json FROM budget_templates WHERE id=?1",
                        [id.to_string()],
                        |r| r.get(0),
                    )
                    .optional()?;
                serde_json::from_str(&json.ok_or_else(|| invalid("Patrón inexistente"))?)?
            }
            _ => return Err(invalid("Elegí un presupuesto o patrón de origen")),
        };
        // Freeze matching library compositions too. Outdated library recipes must not replace stored prices.
        let mut known: BTreeSet<_> = d.line_analyses.iter().map(|a| a.id).collect();
        for line in &mut d.lines {
            if let Some(id) = line.analysis_id {
                if !known.contains(&id) {
                    if let Some(a) = self.get_analysis(id)? {
                        if a.unit == line.unit
                            && a.direct_unit_cost().map_err(|e| invalid(&e.to_string()))?
                                == line.unit_cost_snapshot
                        {
                            known.insert(id);
                            d.line_analyses.push(a);
                        } else {
                            line.analysis_id = None;
                        }
                    } else {
                        line.analysis_id = None;
                    }
                }
            }
        }
        Ok(d)
    }
    pub fn save_budget_pattern(
        &self,
        source: &PatternSource,
        selection: &PatternSelection,
        name: &str,
        prices: bool,
    ) -> Result<BudgetTemplate> {
        if name.trim().is_empty() || name.len() > 500 {
            return Err(invalid(
                "Ingresá un nombre de hasta 500 caracteres para el patrón",
            ));
        }
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let document = selected_document(self.pattern_document(source)?, selection, prices)?;
        let saved = BudgetTemplate {
            id: Uuid::new_v4(),
            name: name.trim().into(),
            document,
        };
        tx.execute(
            "INSERT INTO budget_templates(id,name,document_json) VALUES (?1,?2,?3)",
            params![
                saved.id.to_string(),
                saved.name,
                serde_json::to_string(&saved.document)?
            ],
        )?;
        tx.commit()?;
        Ok(saved)
    }
    pub fn apply_budget_pattern(
        &mut self,
        destination: Uuid,
        source: &PatternSource,
        selection: &PatternSelection,
        prices: bool,
        parent: Option<Uuid>,
    ) -> Result<PatternApplied> {
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let target = self
            .get_estimate(destination)?
            .ok_or_else(|| invalid("Presupuesto de destino inexistente"))?;
        if target.issued {
            return Err(invalid(
                "Los patrones solo se incorporan a presupuestos en borrador",
            ));
        }
        if let Some(id) = parent {
            if !tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM budget_sections WHERE id=?1 AND estimate_id=?2)",
                params![id.to_string(), destination.to_string()],
                |r| r.get::<_, bool>(0),
            )? {
                return Err(invalid("El rubro de destino pertenece a otro presupuesto"));
            }
        }
        let d = selected_document(self.pattern_document(source)?, selection, prices)?;
        if prices && d.currency != target.currency {
            return Err(invalid("Las monedas no coinciden. Copiá sin precios o convertí el origen con una cotización explícita"));
        }
        let sections: BTreeMap<_, _> = d.sections.iter().map(|r| (r.id, Uuid::new_v4())).collect();
        let lines: BTreeMap<_, _> = d.lines.iter().map(|l| (l.id, Uuid::new_v4())).collect();
        let mut codes: BTreeSet<String> = tx
            .prepare("SELECT code FROM budget_sections WHERE estimate_id=?1")?
            .query_map([destination.to_string()], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        let section_start: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position),-1)+1 FROM budget_sections WHERE estimate_id=?1",
            [destination.to_string()],
            |r| r.get(0),
        )?;
        let line_start: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position),-1)+1 FROM estimate_lines WHERE estimate_id=?1",
            [destination.to_string()],
            |r| r.get(0),
        )?;
        let mut pending = d.sections.clone();
        let mut inserted = BTreeSet::new();
        let mut count = 0i64;
        while !pending.is_empty() {
            let old = pending.len();
            let mut waiting = vec![];
            for section in pending {
                if section.parent_id.is_some_and(|p| !inserted.contains(&p)) {
                    waiting.push(section);
                    continue;
                }
                let mut code = section.code.clone();
                let mut suffix = 2;
                while codes.contains(&code) {
                    code = format!("{}-{}", section.code, suffix);
                    suffix += 1;
                }
                codes.insert(code.clone());
                let parent_id = section.parent_id.map(|id| sections[&id]).or(parent);
                let position = section_start
                    .checked_add(count)
                    .ok_or_else(|| invalid("Orden de rubros fuera de rango"))?;
                tx.execute("INSERT INTO budget_sections(id,estimate_id,parent_id,code,title,position) VALUES (?1,?2,?3,?4,?5,?6)",params![sections[&section.id].to_string(),destination.to_string(),parent_id.map(|id|id.to_string()),code,section.title,position])?;
                inserted.insert(section.id);
                count += 1;
            }
            if old == waiting.len() {
                return Err(invalid("Jerarquía de rubros circular o incompleta"));
            }
            pending = waiting;
        }
        let mut analyses = BTreeMap::new();
        for source in &d.line_analyses {
            let mut a = source.clone();
            a.id = Uuid::new_v4();
            a.direct_unit_cost().map_err(|e| invalid(&e.to_string()))?;
            tx.execute("INSERT INTO analyses(id,code,description,unit,snapshot_json) VALUES (?1,?2,?3,?4,?5)",params![a.id.to_string(),a.code,a.description,a.unit,serde_json::to_string(&a)?])?;
            tx.execute(
                "INSERT INTO line_analysis_snapshots(analysis_id) VALUES (?1)",
                [a.id.to_string()],
            )?;
            analyses.insert(source.id, a.id);
        }
        for (i, l) in d.lines.iter().enumerate() {
            if l.description.trim().is_empty()
                || l.unit.trim().is_empty()
                || l.quantity < Decimal::ZERO
                || l.unit_cost_snapshot < Decimal::ZERO
            {
                return Err(invalid("Partida de origen inválida"));
            }
            let position = line_start
                .checked_add(i as i64)
                .ok_or_else(|| invalid("Orden de partidas fuera de rango"))?;
            let analysis = l.analysis_id.and_then(|id| analyses.get(&id));
            tx.execute("INSERT INTO estimate_lines(id,estimate_id,position,analysis_id,description,unit,quantity,unit_cost_snapshot) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![lines[&l.id].to_string(),destination.to_string(),position,analysis.map(|id|id.to_string()),l.description,l.unit,l.quantity.to_string(),l.unit_cost_snapshot.to_string()])?;
            let section = d
                .assignments
                .iter()
                .find(|(id, _)| *id == l.id)
                .and_then(|(_, id)| sections.get(id))
                .copied()
                .or(parent);
            if let Some(id) = section {
                tx.execute(
                    "INSERT INTO estimate_line_sections(line_id,section_id) VALUES (?1,?2)",
                    params![lines[&l.id].to_string(), id.to_string()],
                )?;
            }
        }
        for f in &d.formulas {
            let quantity = cpobras_core::costing::evaluate_formula(&f.expression, &f.variables)
                .map_err(StorageError::InvalidValue)?;
            if !d
                .lines
                .iter()
                .any(|l| l.id == f.line_id && l.quantity == quantity)
            {
                return Err(invalid("La fórmula de origen no coincide con la cantidad"));
            }
            tx.execute(
                "INSERT INTO line_formulas(line_id,expression,variables_json) VALUES (?1,?2,?3)",
                params![
                    lines[&f.line_id].to_string(),
                    f.expression,
                    serde_json::to_string(&f.variables)?
                ],
            )?;
        }
        for row in &d.takeoffs {
            row.measured_quantity()?;
            tx.execute("INSERT INTO takeoff_rows(id,estimate_id,line_id,note,factor,length,width,height,sign,position) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![Uuid::new_v4().to_string(),destination.to_string(),lines[&row.line_id].to_string(),row.note,row.factor.to_string(),row.length.to_string(),row.width.to_string(),row.height.to_string(),row.sign,row.position])?;
        }
        crate::estimate_resource_prices::synchronize(&tx, destination, &BTreeMap::new())?;
        crate::estimates::checked_budget_total(&tx, destination)?;
        let result = PatternApplied {
            line_ids: d.lines.iter().map(|l| lines[&l.id]).collect(),
            section_ids: d.sections.iter().map(|r| sections[&r.id]).collect(),
            takeoff_count: d.takeoffs.len(),
        };
        tx.commit()?;
        Ok(result)
    }
}
