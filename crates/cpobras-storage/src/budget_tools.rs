use crate::{
    budget_sections::BudgetSection,
    estimates::{Estimate, EstimateItem},
    takeoffs::TakeoffRow,
};
use crate::{LocalStore, Result, StorageError};
use cpobras_core::{costing::evaluate_formula, Currency, PricingRates};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetDocument {
    #[serde(default)]
    pub certificate_terms: Option<crate::construction_workflow::CertificateTerms>,
    #[serde(default)]
    pub adjustment_agreement: Option<cpobras_core::adjustments::AdjustmentAgreement>,
    #[serde(default)]
    pub measured_line_ids: Vec<Uuid>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub takeoff_previous_quantities: BTreeMap<Uuid, Decimal>,
    #[serde(default)]
    pub price_definition: Option<cpobras_core::price_determination::PriceDefinition>,
    #[serde(default)]
    pub line_analyses: Vec<cpobras_core::UnitCostAnalysis>,
    #[serde(default)]
    pub formulas: Vec<LineFormula>,
    pub format_version: u32,
    pub currency: Currency,
    pub title: String,
    pub sections: Vec<BudgetSection>,
    pub lines: Vec<EstimateItem>,
    pub assignments: Vec<(Uuid, Uuid)>,
    pub rates: PricingRates,
    pub takeoffs: Vec<TakeoffRow>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineFormula {
    pub line_id: Uuid,
    pub expression: String,
    pub variables: BTreeMap<String, Decimal>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct BudgetTemplate {
    pub id: Uuid,
    pub name: String,
    pub document: BudgetDocument,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct LineEdit {
    pub id: Uuid,
    pub description: String,
    pub unit: String,
    pub quantity: Decimal,
    pub unit_cost: Decimal,
}
fn invalid(message: &str) -> StorageError {
    StorageError::InvalidValue(message.into())
}
fn currency(value: Currency) -> &'static str {
    match value {
        Currency::Ars => "ARS",
        Currency::Usd => "USD",
    }
}
impl LocalStore {
    pub fn export_budget(&self, id: Uuid) -> Result<BudgetDocument> {
        let estimate = self
            .get_estimate(id)?
            .ok_or_else(|| invalid("Presupuesto inexistente"))?;
        let lines = self.estimate_items(id)?;
        let mut takeoffs = Vec::new();
        let mut takeoff_previous_quantities = BTreeMap::new();
        for line in &lines {
            takeoffs.extend(self.list_takeoff_rows(id, line.id)?);
            let previous: Option<String> = self.conn.query_row("SELECT previous_quantity FROM measured_lines WHERE line_id=?1 AND source='takeoff' AND previous_quantity IS NOT NULL",[line.id.to_string()],|r|r.get(0)).optional()?;
            if let Some(previous) = previous {
                takeoff_previous_quantities.insert(
                    line.id,
                    Decimal::from_str_exact(&previous)
                        .map_err(|_| invalid("Cantidad manual previa inválida"))?,
                );
            }
        }
        let mut formulas = Vec::new();
        for line in &lines {
            let row: Option<(String, String)> = self
                .conn
                .query_row(
                    "SELECT expression,variables_json FROM line_formulas WHERE line_id=?1",
                    [line.id.to_string()],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            if let Some((expression, json)) = row {
                formulas.push(LineFormula {
                    line_id: line.id,
                    expression,
                    variables: serde_json::from_str(&json)?,
                });
            }
        }
        let mut line_analyses = Vec::new();
        let mut included = BTreeSet::new();
        for line in &lines {
            if let Some(id) = line.analysis_id {
                if self.is_line_analysis(id)? && included.insert(id) {
                    if let Some(analysis) = self.get_analysis(id)? {
                        line_analyses.push(analysis);
                    }
                }
            }
        }
        Ok(BudgetDocument {
            certificate_terms: Some(crate::construction_workflow::terms(&self.conn, id)?),
            adjustment_agreement: self.adjustment_agreement(id)?.definition,
            measured_line_ids: self.measured_lines(id)?,
            takeoff_previous_quantities,
            price_definition: self.stored_price_definition(id)?,
            line_analyses,
            formulas,
            format_version: 5,
            currency: estimate.currency,
            title: estimate.title,
            sections: self.list_budget_sections(id)?,
            lines,
            assignments: self.list_line_sections(id)?,
            rates: self.get_estimate_pricing(id)?,
            takeoffs,
        })
    }
    pub fn save_budget_template(&self, id: Uuid, name: &str) -> Result<BudgetTemplate> {
        if name.trim().is_empty() || name.len() > 500 {
            return Err(invalid("Nombre de plantilla inválido"));
        }
        let template = BudgetTemplate {
            id: Uuid::new_v4(),
            name: name.trim().into(),
            document: self.export_budget(id)?,
        };
        self.conn.execute(
            "INSERT INTO budget_templates(id,name,document_json) VALUES (?1,?2,?3)",
            params![
                template.id.to_string(),
                template.name,
                serde_json::to_string(&template.document)?
            ],
        )?;
        Ok(template)
    }
    pub fn budget_templates(&self) -> Result<Vec<BudgetTemplate>> {
        let rows: Vec<(String, String, String)> = self
            .conn
            .prepare("SELECT id,name,document_json FROM budget_templates ORDER BY name,id")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<std::result::Result<_, _>>()?;
        rows.into_iter()
            .map(|(id, name, json)| {
                Ok(BudgetTemplate {
                    id: Uuid::parse_str(&id)?,
                    name,
                    document: serde_json::from_str(&json)?,
                })
            })
            .collect()
    }
    pub fn import_budget(
        &mut self,
        project_id: Uuid,
        document: &BudgetDocument,
    ) -> Result<Estimate> {
        if ![1, 2, 3, 4, 5].contains(&document.format_version)
            || document.title.trim().is_empty()
            || document.lines.len() > 10_000
            || document.sections.len() > 5000
            || document.takeoffs.len() > 100_000
        {
            return Err(invalid("Formato o tamaño de presupuesto inválido"));
        }
        let project = self
            .get_project(project_id)?
            .ok_or_else(|| invalid("Obra inexistente"))?;
        if project.currency != document.currency {
            return Err(invalid("La moneda del archivo no coincide con la obra"));
        }
        cpobras_core::price_estimate(Decimal::ZERO, document.rates)
            .map_err(|e| invalid(&e.to_string()))?;
        let sections: BTreeMap<_, _> = document
            .sections
            .iter()
            .map(|s| (s.id, Uuid::new_v4()))
            .collect();
        let lines: BTreeMap<_, _> = document
            .lines
            .iter()
            .map(|l| (l.id, Uuid::new_v4()))
            .collect();
        if sections.len() != document.sections.len() || lines.len() != document.lines.len() {
            return Err(invalid("Identificadores duplicados en el archivo"));
        }
        let estimate = Estimate {
            id: Uuid::new_v4(),
            project_id,
            title: document.title.trim().into(),
            currency: document.currency,
            issued: false,
        };
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT INTO estimates(id,project_id,title,currency) VALUES (?1,?2,?3,?4)",
            params![
                estimate.id.to_string(),
                project_id.to_string(),
                estimate.title,
                currency(estimate.currency)
            ],
        )?;
        let mut pending = document.sections.clone();
        let mut inserted = BTreeSet::new();
        while !pending.is_empty() {
            let before = pending.len();
            let mut waiting = Vec::new();
            for section in pending {
                if section.code.trim().is_empty()
                    || section.title.trim().is_empty()
                    || section.position < 0
                {
                    return Err(invalid("Rubro inválido"));
                }
                if section.parent_id.is_some_and(|id| !inserted.contains(&id)) {
                    waiting.push(section);
                    continue;
                }
                tx.execute("INSERT INTO budget_sections(id,estimate_id,parent_id,code,title,position) VALUES (?1,?2,?3,?4,?5,?6)",params![sections[&section.id].to_string(),estimate.id.to_string(),section.parent_id.map(|id|sections[&id].to_string()),section.code,section.title,section.position])?;
                inserted.insert(section.id);
            }
            if waiting.len() == before {
                return Err(invalid("Jerarquía de rubros circular o incompleta"));
            }
            pending = waiting;
        }
        let mut imported_analyses = BTreeMap::new();
        if document.line_analyses.len() > document.lines.len() {
            return Err(invalid("Demasiadas composiciones de partidas"));
        }
        for source in &document.line_analyses {
            if source.components.len() > 1000 || source.components.is_empty() {
                return Err(invalid("Composición de partida inválida"));
            }
            source
                .direct_unit_cost()
                .map_err(|e| invalid(&e.to_string()))?;
            let mut analysis = source.clone();
            analysis.id = Uuid::new_v4();
            tx.execute("INSERT INTO analyses(id,code,description,unit,snapshot_json) VALUES (?1,?2,?3,?4,?5)",params![analysis.id.to_string(),analysis.code,analysis.description,analysis.unit,serde_json::to_string(&analysis)?])?;
            tx.execute(
                "INSERT INTO line_analysis_snapshots(analysis_id) VALUES (?1)",
                [analysis.id.to_string()],
            )?;
            if imported_analyses.insert(source.id, analysis.id).is_some() {
                return Err(invalid("Composición duplicada"));
            }
        }
        for (position, line) in document.lines.iter().enumerate() {
            if line.description.trim().is_empty()
                || line.unit.trim().is_empty()
                || line.quantity < Decimal::ZERO
                || line.unit_cost_snapshot < Decimal::ZERO
                || line.quantity.checked_mul(line.unit_cost_snapshot).is_none()
            {
                return Err(invalid("Partida inválida"));
            }
            let analysis =
                if let Some(mapped) = line.analysis_id.and_then(|id| imported_analyses.get(&id)) {
                    let snapshot = document
                        .line_analyses
                        .iter()
                        .find(|analysis| Some(analysis.id) == line.analysis_id)
                        .ok_or_else(|| invalid("Falta composición de la partida"))?;
                    if snapshot.unit != line.unit
                        || snapshot
                            .direct_unit_cost()
                            .map_err(|e| invalid(&e.to_string()))?
                            != line.unit_cost_snapshot
                    {
                        return Err(invalid("El precio o unidad no coincide con su composición"));
                    }
                    Some(mapped.to_string())
                } else if let Some(id) = line.analysis_id {
                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM analyses WHERE id=?1)",
                        [id.to_string()],
                        |r| r.get(0),
                    )?;
                    if exists {
                        Some(id.to_string())
                    } else {
                        None
                    }
                } else {
                    None
                };
            tx.execute("INSERT INTO estimate_lines(id,estimate_id,position,analysis_id,description,unit,quantity,unit_cost_snapshot) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![lines[&line.id].to_string(),estimate.id.to_string(),position as i64,analysis,line.description,line.unit,line.quantity.to_string(),line.unit_cost_snapshot.to_string()])?;
        }
        for formula in &document.formulas {
            let new_line = lines
                .get(&formula.line_id)
                .ok_or_else(|| invalid("Fórmula de partida inexistente"))?;
            let quantity = evaluate_formula(&formula.expression, &formula.variables)
                .map_err(StorageError::InvalidValue)?;
            let source = document
                .lines
                .iter()
                .find(|line| line.id == formula.line_id)
                .ok_or_else(|| invalid("Partida inexistente"))?;
            if quantity != source.quantity {
                return Err(invalid(
                    "La fórmula no coincide con la cantidad de la partida",
                ));
            }
            tx.execute(
                "INSERT INTO line_formulas(line_id,expression,variables_json) VALUES (?1,?2,?3)",
                params![
                    new_line.to_string(),
                    formula.expression,
                    serde_json::to_string(&formula.variables)?
                ],
            )?;
        }
        for (line, section) in &document.assignments {
            let line = lines
                .get(line)
                .ok_or_else(|| invalid("Asignación a partida inexistente"))?;
            let section = sections
                .get(section)
                .ok_or_else(|| invalid("Asignación a rubro inexistente"))?;
            tx.execute(
                "INSERT INTO estimate_line_sections(line_id,section_id) VALUES (?1,?2)",
                params![line.to_string(), section.to_string()],
            )?;
        }
        let r = document.rates;
        tx.execute("INSERT INTO estimate_pricing(estimate_id,general_expenses_percent,profit_percent,discount_percent,tax_percent,financial_expenses_percent) VALUES (?1,?2,?3,?4,?5,?6)",params![estimate.id.to_string(),r.general_expenses_percent.to_string(),r.profit_percent.to_string(),r.discount_percent.to_string(),r.tax_percent.to_string(),r.financial_expenses_percent.to_string()])?;
        for row in &document.takeoffs {
            row.measured_quantity()
                .map_err(|e| invalid(&e.to_string()))?;
            let line = lines
                .get(&row.line_id)
                .ok_or_else(|| invalid("Medición de partida inexistente"))?;
            tx.execute("INSERT INTO takeoff_rows(id,estimate_id,line_id,note,factor,length,width,height,sign,position) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![Uuid::new_v4().to_string(),estimate.id.to_string(),line.to_string(),row.note,row.factor.to_string(),row.length.to_string(),row.width.to_string(),row.height.to_string(),row.sign,row.position])?;
        }
        for source in &document.measured_line_ids {
            let target = lines
                .get(source)
                .ok_or_else(|| invalid("Origen de metrado fuera del documento"))?;
            let previous = document.takeoff_previous_quantities.get(source).copied();
            if previous.is_some_and(|q| q < Decimal::ZERO) {
                return Err(invalid("Cantidad manual previa inválida"));
            }
            tx.execute(
                "INSERT INTO measured_lines(line_id,source,previous_quantity) VALUES(?1,?2,?3)",
                params![
                    target.to_string(),
                    if document.formulas.iter().any(|f| f.line_id == *source) {
                        "formula"
                    } else {
                        "takeoff"
                    },
                    previous.map(|q| q.to_string())
                ],
            )?;
        }
        crate::estimate_resource_prices::synchronize(&tx, estimate.id, &BTreeMap::new())?;
        if let Some(t) = &document.certificate_terms {
            t.validate()?;
        }
        if let Some(a) = &document.adjustment_agreement {
            a.validate().map_err(StorageError::InvalidValue)?;
            tx.execute("INSERT INTO estimate_adjustment_agreements(estimate_id,revision,definition_json) VALUES(?1,1,?2)",params![estimate.id.to_string(),serde_json::to_string(&Some(a))?])?;
        }
        if let Some(t) = &document.certificate_terms {
            tx.execute("INSERT INTO estimate_adjustment_agreements(estimate_id,revision,definition_json,terms_json) VALUES(?1,1,'null',?2) ON CONFLICT(estimate_id) DO UPDATE SET terms_json=excluded.terms_json",params![estimate.id.to_string(),serde_json::to_string(t)?])?;
        }
        if let Some(definition) = &document.price_definition {
            definition
                .calculate(crate::estimates::checked_budget_total(&tx, estimate.id)?)
                .map_err(StorageError::InvalidValue)?;
            tx.execute("INSERT INTO estimate_price_definitions(estimate_id,revision,definition_json) VALUES (?1,1,?2)",params![estimate.id.to_string(),serde_json::to_string(definition)?])?;
        }
        crate::estimates::checked_budget_total(&tx, estimate.id)?;
        tx.commit()?;
        Ok(estimate)
    }
    pub fn edit_budget_lines(
        &mut self,
        id: Uuid,
        changes: &[LineEdit],
        order: &[Uuid],
    ) -> Result<()> {
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
            return Err(invalid("Solo se editan presupuestos en borrador"));
        }
        for change in changes {
            if change.description.trim().is_empty()
                || change.unit.trim().is_empty()
                || change.quantity < Decimal::ZERO
                || change.unit_cost < Decimal::ZERO
                || change.quantity.checked_mul(change.unit_cost).is_none()
            {
                return Err(invalid("Partida inválida"));
            }
            let old: (String, String) = tx.query_row(
                "SELECT unit,unit_cost_snapshot FROM estimate_lines WHERE id=?1 AND estimate_id=?2",
                params![change.id.to_string(), id.to_string()],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            let manual_override = old.0 != change.unit
                || old
                    .1
                    .parse::<Decimal>()
                    .map_err(|_| invalid("Precio guardado inválido"))?
                    != change.unit_cost;
            let updated=tx.execute("UPDATE estimate_lines SET description=?1,unit=?2,quantity=?3,unit_cost_snapshot=?4,analysis_id=CASE WHEN ?7 THEN NULL ELSE analysis_id END WHERE id=?5 AND estimate_id=?6",params![change.description,change.unit,change.quantity.to_string(),change.unit_cost.to_string(),change.id.to_string(),id.to_string(),manual_override])?;
            if manual_override {
                tx.execute(
                    "DELETE FROM line_analysis_sources WHERE line_id=?1",
                    [change.id.to_string()],
                )?;
            }
            if updated != 1 {
                return Err(invalid("Partida ajena al presupuesto"));
            }
        }
        if !order.is_empty() {
            let existing: Vec<String> = tx
                .prepare("SELECT id FROM estimate_lines WHERE estimate_id=?1")?
                .query_map([id.to_string()], |r| r.get(0))?
                .collect::<std::result::Result<_, _>>()?;
            if existing.len() != order.len()
                || existing.iter().cloned().collect::<BTreeSet<_>>()
                    != order.iter().map(|id| id.to_string()).collect()
            {
                return Err(invalid(
                    "El orden debe incluir exactamente todas las partidas",
                ));
            }
            let maximum: i64 = tx.query_row(
                "SELECT COALESCE(MAX(position),0) FROM estimate_lines WHERE estimate_id=?1",
                [id.to_string()],
                |r| r.get(0),
            )?;
            let shift = maximum
                .checked_add(order.len() as i64 + 1)
                .ok_or_else(|| invalid("Orden fuera de rango"))?;
            maximum
                .checked_add(shift)
                .ok_or_else(|| invalid("Orden fuera de rango"))?;
            tx.execute(
                "UPDATE estimate_lines SET position=position+?1 WHERE estimate_id=?2",
                params![shift, id.to_string()],
            )?;
            for (position, line_id) in order.iter().enumerate() {
                tx.execute(
                    "UPDATE estimate_lines SET position=?1 WHERE id=?2 AND estimate_id=?3",
                    params![position as i64, line_id.to_string(), id.to_string()],
                )?;
            }
        }
        crate::estimates::checked_budget_total(&tx, id)?;
        tx.commit()?;
        Ok(())
    }
    pub fn set_line_formula(
        &mut self,
        estimate: Uuid,
        line: Uuid,
        expression: &str,
        variables: &BTreeMap<String, Decimal>,
    ) -> Result<Decimal> {
        let quantity =
            evaluate_formula(expression, variables).map_err(StorageError::InvalidValue)?;
        if quantity < Decimal::ZERO {
            return Err(invalid("La fórmula produce una cantidad negativa"));
        }
        let tx = self.conn.transaction()?;
        let updated = tx.execute(
            "UPDATE estimate_lines SET quantity=?1 WHERE id=?2 AND estimate_id=?3",
            params![quantity.to_string(), line.to_string(), estimate.to_string()],
        )?;
        if updated != 1 {
            return Err(invalid("Partida inexistente"));
        }
        tx.execute(
            "INSERT OR REPLACE INTO measured_lines(line_id,source) VALUES(?1,'formula')",
            [line.to_string()],
        )?;
        tx.execute("INSERT INTO line_formulas(line_id,expression,variables_json) VALUES (?1,?2,?3) ON CONFLICT(line_id) DO UPDATE SET expression=excluded.expression,variables_json=excluded.variables_json",params![line.to_string(),expression,serde_json::to_string(variables)?])?;
        crate::estimate_resource_prices::synchronize(&tx, estimate, &BTreeMap::new())?;
        crate::estimates::checked_budget_total(&tx, estimate)?;
        tx.commit()?;
        Ok(quantity)
    }
}

impl LocalStore {
    pub fn duplicate_budget_line(&mut self, estimate: Uuid, line_id: Uuid) -> Result<Uuid> {
        let line = self
            .estimate_items(estimate)?
            .into_iter()
            .find(|line| line.id == line_id)
            .ok_or_else(|| invalid("Partida inexistente"))?;
        let rows = self.list_takeoff_rows(estimate, line_id)?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let id = Uuid::new_v4();
        let position: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position),-1)+1 FROM estimate_lines WHERE estimate_id=?1",
            [estimate.to_string()],
            |r| r.get(0),
        )?;
        tx.execute("INSERT INTO estimate_lines(id,estimate_id,position,analysis_id,description,unit,quantity,unit_cost_snapshot) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![id.to_string(),estimate.to_string(),position,line.analysis_id.map(|id|id.to_string()),line.description,line.unit,line.quantity.to_string(),line.unit_cost_snapshot.to_string()])?;
        tx.execute("INSERT INTO estimate_line_sections(line_id,section_id) SELECT ?1,section_id FROM estimate_line_sections WHERE line_id=?2",params![id.to_string(),line_id.to_string()])?;
        tx.execute("INSERT INTO line_analysis_sources(line_id,analysis_id) SELECT ?1,analysis_id FROM line_analysis_sources WHERE line_id=?2",params![id.to_string(),line_id.to_string()])?;
        tx.execute("INSERT INTO line_formulas(line_id,expression,variables_json) SELECT ?1,expression,variables_json FROM line_formulas WHERE line_id=?2",params![id.to_string(),line_id.to_string()])?;
        tx.execute("INSERT INTO measured_lines(line_id,source,previous_quantity) SELECT ?1,source,previous_quantity FROM measured_lines WHERE line_id=?2",params![id.to_string(),line_id.to_string()])?;
        for row in rows {
            tx.execute("INSERT INTO takeoff_rows(id,estimate_id,line_id,note,factor,length,width,height,sign,position) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![Uuid::new_v4().to_string(),estimate.to_string(),id.to_string(),row.note,row.factor.to_string(),row.length.to_string(),row.width.to_string(),row.height.to_string(),row.sign,row.position])?;
        }
        crate::estimate_resource_prices::synchronize(&tx, estimate, &BTreeMap::new())?;
        crate::estimates::checked_budget_total(&tx, estimate)?;
        tx.commit()?;
        Ok(id)
    }
}
