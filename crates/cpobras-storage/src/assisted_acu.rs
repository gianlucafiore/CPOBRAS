//! Reviewed recipes reuse catalog identities and target-budget prices, never model prices.
use crate::{
    assisted_budget::{ExpectedLine, ReviewedBatch},
    takeoffs::TakeoffRow,
    LocalStore, Result, StorageError,
};
use cpobras_core::{ResourceKind, ResourcePriceSnapshot, UnitCostAnalysis};
use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use uuid::Uuid;
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AcuResource {
    pub id: Uuid,
    pub code: String,
    pub description: String,
    pub unit: String,
    pub kind: String,
    pub price: Option<D>,
    pub price_source: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Consumption {
    pub resource_id: Uuid,
    pub quantity: D,
    pub expected_resource: AcuResource,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dimensions {
    pub note: String,
    pub factor: D,
    pub length: D,
    pub width: D,
    pub height: D,
    pub sign: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcuChange {
    pub line_id: Uuid,
    pub expected: Option<ExpectedLine>,
    pub expected_recipe: Option<String>,
    pub expected_section: Option<Uuid>,
    pub as_of: String,
    pub components: Vec<Consumption>,
    pub section_id: Option<Uuid>,
    pub section_title: Option<String>,
    pub measurements: Option<Vec<Dimensions>>,
    pub expected_takeoffs: Vec<TakeoffRow>,
    pub expected_formula: Option<String>,
    pub notes: String,
}
#[derive(Serialize)]
pub struct RecipeComponent {
    pub description: String,
    pub resource_id: Uuid,
    pub quantity: D,
}
#[derive(Serialize)]
pub struct AcuLine {
    pub id: Uuid,
    pub description: String,
    pub unit: String,
    pub quantity: D,
    pub unit_cost: D,
    pub analysis_id: Option<Uuid>,
    pub expected_recipe: Option<String>,
    pub section_id: Option<Uuid>,
    pub section: String,
    pub components: Vec<RecipeComponent>,
    pub takeoffs: Vec<TakeoffRow>,
    pub formula: Option<String>,
}
#[derive(Serialize)]
pub struct AcuContext {
    pub currency: String,
    pub resources: Vec<AcuResource>,
    pub lines: Vec<AcuLine>,
    pub sections: Vec<crate::budget_sections::BudgetSection>,
}
#[derive(Serialize)]
pub struct ReferenceChoice {
    pub key: String,
    pub title: String,
}
#[derive(Serialize)]
pub struct RecipeExample {
    pub key: String,
    pub description: String,
    pub unit: String,
    pub section: String,
    pub components: Vec<RecipeComponent>,
}
fn valid_date(date: &str) -> Result<()> {
    if date.len() != 10 || chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
        return Err(invalid("Fecha de precios inválida"));
    }
    Ok(())
}
fn decimal(s: &str) -> Result<D> {
    D::from_str_exact(s).map_err(|_| invalid("Decimal guardado inválido"))
}
fn formula(conn: &Connection, line: Uuid) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT expression||char(0)||variables_json FROM line_formulas WHERE line_id=?1",
            [line.to_string()],
            |r| r.get(0),
        )
        .optional()?)
}
fn takeoffs(conn: &Connection, estimate: Uuid, line: Uuid) -> Result<Vec<TakeoffRow>> {
    let rows:Vec<(String,String,String,String,String,String,i64,i64)>=conn.prepare("SELECT id,note,factor,length,width,height,sign,position FROM takeoff_rows WHERE line_id=?1 AND estimate_id=?2 ORDER BY position,id")?.query_map(params![line.to_string(),estimate.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?)))?.collect::<std::result::Result<_,_>>()?;
    rows.into_iter()
        .map(|(id, note, f, l, w, h, sign, position)| {
            Ok(TakeoffRow {
                id: Uuid::parse_str(&id)?,
                line_id: line,
                estimate_id: estimate,
                note,
                factor: decimal(&f)?,
                length: decimal(&l)?,
                width: decimal(&w)?,
                height: decimal(&h)?,
                sign,
                position,
            })
        })
        .collect()
}
fn resource(
    conn: &Connection,
    estimate: Uuid,
    currency: &str,
    id: Uuid,
    date: &str,
) -> Result<AcuResource> {
    let (code, description, unit, kind): (String, String, String, String) = conn
        .query_row(
            "SELECT code,description,unit,kind FROM resources WHERE id=?1 AND active=1",
            [id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?
        .ok_or_else(|| invalid("Un insumo ya no existe o está inactivo"))?;
    let budget: Option<String> = conn
        .query_row(
            "SELECT amount FROM estimate_resource_prices WHERE estimate_id=?1 AND resource_id=?2",
            params![estimate.to_string(), id.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    let (price, source) = if let Some(p) = budget {
        (Some(decimal(&p)?), "presupuesto".into())
    } else {
        let catalog:Option<(String,String)>=conn.query_row("SELECT id,amount FROM resource_prices WHERE resource_id=?1 AND currency=?2 AND effective_date<=?3 ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1",params![id.to_string(),currency,date],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        match catalog {
            Some((id, p)) => (Some(decimal(&p)?), format!("catálogo:{id}")),
            None => (None, "sin precio en esta moneda y fecha".into()),
        }
    };
    Ok(AcuResource {
        id,
        code,
        description,
        unit,
        kind,
        price,
        price_source: source,
    })
}
fn reference_budget_allowed(conn: &Connection, id: Uuid) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM estimates e WHERE e.id=?1 AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE (a.kind='estimate' AND a.entity_id=e.id) OR (a.kind='project' AND a.entity_id=e.project_id)) AND NOT EXISTS(SELECT 1 FROM project_organizations po JOIN organizations o ON o.id=po.organization_id WHERE po.project_id=e.project_id AND o.ownership='external'))",[id.to_string()],|r|r.get(0))?)
}
impl LocalStore {
    pub fn assisted_acu_context(
        &self,
        project: Uuid,
        estimate: Option<Uuid>,
        date: &str,
    ) -> Result<AcuContext> {
        valid_date(date)?;
        let currency:String=self.conn.query_row("SELECT p.currency FROM projects p WHERE p.id=?1 AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='project' AND a.entity_id=p.id) AND NOT EXISTS(SELECT 1 FROM project_organizations po JOIN organizations o ON o.id=po.organization_id WHERE po.project_id=p.id AND o.ownership='external')",[project.to_string()],|r|r.get(0)).optional()?.ok_or_else(||invalid("Abrí un proyecto propio vigente"))?;
        let id = estimate.unwrap_or_else(Uuid::nil);
        if let Some(e) = estimate {
            if !reference_budget_allowed(&self.conn,e)? || !self.conn.query_row("SELECT EXISTS(SELECT 1 FROM estimates WHERE id=?1 AND project_id=?2 AND status='draft')",params![e.to_string(),project.to_string()],|r|r.get::<_,bool>(0))?{return Err(invalid("El presupuesto no pertenece al proyecto o no está en elaboración"));}
        }
        let resources = self
            .list_resources()?
            .into_iter()
            .filter(|r| r.active)
            .map(|r| resource(&self.conn, id, &currency, r.id, date))
            .collect::<Result<Vec<_>>>()?;
        let mut lines = Vec::new();
        let sections = if estimate.is_some() {
            self.list_budget_sections(id)?
        } else {
            Vec::new()
        };
        if estimate.is_some() {
            for l in self.estimate_items(id)? {
                let recipe: Option<String> = if let Some(a) = l.analysis_id {
                    self.conn
                        .query_row(
                            "SELECT snapshot_json FROM analyses WHERE id=?1",
                            [a.to_string()],
                            |r| r.get(0),
                        )
                        .optional()?
                } else {
                    None
                };
                let components = recipe
                    .as_deref()
                    .map(serde_json::from_str::<UnitCostAnalysis>)
                    .transpose()?
                    .map(|a| {
                        a.components
                            .into_iter()
                            .map(|c| RecipeComponent {
                                description: c.description,
                                resource_id: c.resource_id,
                                quantity: c.quantity_per_unit,
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let section_id: Option<String> = self
                    .conn
                    .query_row(
                        "SELECT section_id FROM estimate_line_sections WHERE line_id=?1",
                        [l.id.to_string()],
                        |r| r.get(0),
                    )
                    .optional()?;
                let section_id = section_id.map(|s| Uuid::parse_str(&s)).transpose()?;
                lines.push(AcuLine {
                    id: l.id,
                    description: l.description,
                    unit: l.unit,
                    quantity: l.quantity,
                    unit_cost: l.unit_cost_snapshot,
                    analysis_id: l.analysis_id,
                    expected_recipe: recipe,
                    section_id,
                    section: sections
                        .iter()
                        .find(|s| Some(s.id) == section_id)
                        .map(|s| s.title.clone())
                        .unwrap_or_default(),
                    components,
                    takeoffs: takeoffs(&self.conn, id, l.id)?,
                    formula: formula(&self.conn, l.id)?,
                });
            }
        }
        Ok(AcuContext {
            currency,
            resources,
            lines,
            sections,
        })
    }
    pub fn assisted_acu_references(&self) -> Result<Vec<ReferenceChoice>> {
        let mut refs = Vec::new();
        let budgets:Vec<(String,String)>=self.conn.prepare("SELECT e.id,p.name||' · '||e.title FROM estimates e JOIN projects p ON p.id=e.project_id WHERE EXISTS(SELECT 1 FROM estimate_lines l WHERE l.estimate_id=e.id AND l.analysis_id IS NOT NULL) ORDER BY p.name,e.title")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?)))?.collect::<std::result::Result<_,_>>()?;
        for (id, title) in budgets {
            if reference_budget_allowed(&self.conn, Uuid::parse_str(&id)?)? {
                refs.push(ReferenceChoice {
                    key: format!("budget:{id}"),
                    title,
                });
            }
        }
        for a in self.list_analyses()? {
            refs.push(ReferenceChoice {
                key: format!("analysis:{}", a.id),
                title: format!("Biblioteca ACU · {} · {}", a.code, a.description),
            });
        }
        Ok(refs)
    }
    pub fn assisted_acu_reference(&self, key: &str) -> Result<Vec<RecipeExample>> {
        let (kind, id) = key
            .split_once(':')
            .ok_or_else(|| invalid("Referencia inválida"))?;
        let id = Uuid::parse_str(id)?;
        let mut examples = Vec::new();
        if kind == "budget" {
            if !reference_budget_allowed(&self.conn, id)? {
                return Err(invalid("Referencia no disponible o de otra organización"));
            }
            let sections = self.list_budget_sections(id)?;
            let assignments = self.list_line_sections(id)?;
            for l in self.estimate_items(id)? {
                if let Some(a) = l.analysis_id {
                    if let Some(analysis) = self.get_analysis(a)? {
                        if !analysis.components.is_empty() {
                            let section_id = assignments
                                .iter()
                                .find(|(line, _)| *line == l.id)
                                .map(|(_, s)| *s);
                            examples.push(RecipeExample {
                                key: format!("{key}:{}", l.id),
                                description: l.description,
                                unit: l.unit,
                                section: sections
                                    .iter()
                                    .find(|s| Some(s.id) == section_id)
                                    .map(|s| s.title.clone())
                                    .unwrap_or_default(),
                                components: analysis
                                    .components
                                    .into_iter()
                                    .map(|c| RecipeComponent {
                                        description: c.description,
                                        resource_id: c.resource_id,
                                        quantity: c.quantity_per_unit,
                                    })
                                    .collect(),
                            });
                        }
                    }
                }
            }
        } else if kind == "analysis" {
            if !self.list_analyses()?.iter().any(|a| a.id == id) {
                return Err(invalid("ACU de biblioteca no disponible"));
            }
            let a = self
                .get_analysis(id)?
                .ok_or_else(|| invalid("ACU inexistente"))?;
            examples.push(RecipeExample {
                key: key.into(),
                description: a.description,
                unit: a.unit,
                section: String::new(),
                components: a
                    .components
                    .into_iter()
                    .map(|c| RecipeComponent {
                        description: c.description,
                        resource_id: c.resource_id,
                        quantity: c.quantity_per_unit,
                    })
                    .collect(),
            });
        } else {
            return Err(invalid("Tipo de referencia inválido"));
        }
        if examples.len() > 1000 {
            return Err(invalid("La referencia tiene más de 1000 recetas; usá una biblioteca o presupuesto más acotado"));
        }
        Ok(examples)
    }
}
pub(crate) fn validate_changes(conn: &Connection, batch: &ReviewedBatch) -> Result<()> {
    let mut seen = HashSet::new();
    let mut resolved = BTreeMap::new();
    let snapshots:Vec<String>=conn.prepare("SELECT a.snapshot_json FROM estimate_lines l JOIN analyses a ON a.id=l.analysis_id WHERE l.estimate_id=?1")?.query_map([batch.estimate_id.to_string()],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
    let mut previous_prices: BTreeMap<Uuid, Vec<D>> = BTreeMap::new();
    for json in snapshots {
        let a: UnitCostAnalysis = serde_json::from_str(&json)?;
        for c in a.components {
            previous_prices
                .entry(c.resource_id)
                .or_default()
                .push(c.unit_price);
        }
    }
    for change in &batch.acus {
        valid_date(&change.as_of)?;
        if !seen.insert(change.line_id)
            || change.components.is_empty()
            || change.components.len() > 100
            || change.notes.len() > 6000
            || batch.updates.iter().any(|u| u.line_id == change.line_id)
            || batch.deletes.iter().any(|d| d.line_id == change.line_id)
        {
            return Err(invalid(
                "ACU vacío, repetido o con operaciones incompatibles",
            ));
        }
        if let Some(expected) = &change.expected {
            let current:Option<(String,String,String,String,Option<String>,Option<String>,Option<String>)>=conn.query_row("SELECT l.description,l.unit,l.quantity,l.unit_cost_snapshot,l.analysis_id,a.snapshot_json,s.section_id FROM estimate_lines l LEFT JOIN analyses a ON a.id=l.analysis_id LEFT JOIN estimate_line_sections s ON s.line_id=l.id WHERE l.id=?1 AND l.estimate_id=?2",params![change.line_id.to_string(),batch.estimate_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?))).optional()?;
            let Some((description, unit, quantity, cost, analysis, recipe, section)) = current
            else {
                return Err(invalid("La partida del ACU ya no existe en el presupuesto"));
            };
            if description != expected.description
                || unit != expected.unit
                || decimal(&quantity)? != expected.quantity
                || decimal(&cost)? != expected.unit_cost
                || analysis != expected.analysis_id.map(|a| a.to_string())
                || recipe != change.expected_recipe
                || section != change.expected_section.map(|s| s.to_string())
            {
                return Err(invalid("La partida, su ACU o su rubro cambiaron desde la revisión; no se aplicó el lote"));
            }
            if change.measurements.is_some()
                && (takeoffs(conn, batch.estimate_id, change.line_id)? != change.expected_takeoffs
                    || formula(conn, change.line_id)? != change.expected_formula)
            {
                return Err(invalid("Las mediciones cambiaron desde la revisión"));
            }
        } else if !batch.creates.iter().any(|l| l.id == change.line_id) {
            return Err(invalid(
                "El ACU nuevo requiere una partida nueva del mismo lote",
            ));
        }
        let mut resources = HashSet::new();
        for c in &change.components {
            if !resources.insert(c.resource_id) || c.quantity <= D::ZERO {
                return Err(invalid(
                    "Un insumo está repetido o tiene consumo no positivo",
                ));
            }
            let current = resource(
                conn,
                batch.estimate_id,
                &batch.currency,
                c.resource_id,
                &change.as_of,
            )?;
            if current != c.expected_resource || current.price.is_none() {
                return Err(invalid("Cambió el insumo o su precio, o falta un precio en esta moneda. Actualizá la vista previa"));
            }
            // Do not silently reprice unrelated legacy compositions.
            let price = current.price.ok_or_else(|| invalid("Precio faltante"))?;
            if let Some(old) = resolved.insert(c.resource_id, price) {
                if old != price {
                    return Err(invalid(
                        "Un mismo insumo tiene precios distintos entre las recetas propuestas",
                    ));
                }
            }
            if previous_prices
                .get(&c.resource_id)
                .is_some_and(|prices| prices.iter().any(|p| *p != price))
            {
                return Err(invalid("Hay precios distintos del mismo insumo en el presupuesto. Unificalos antes de aplicar ACU asistidos"));
            }
        }
    }
    Ok(())
}
fn assign_section(
    conn: &Connection,
    estimate: Uuid,
    line: Uuid,
    id: Option<Uuid>,
    title: Option<&str>,
) -> Result<()> {
    if id.is_none() && title.is_none() {
        return Ok(());
    }
    let section = if let Some(id) = id {
        if !conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM budget_sections WHERE id=?1 AND estimate_id=?2)",
            params![id.to_string(), estimate.to_string()],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(invalid("Rubro ajeno al presupuesto"));
        }
        Some(id.to_string())
    } else if let Some(title) = title.map(str::trim).filter(|s| !s.is_empty()) {
        if title.len() > 300 {
            return Err(invalid("Nombre de rubro demasiado largo"));
        }
        let ids:Vec<String>=conn.prepare("SELECT id FROM budget_sections WHERE estimate_id=?1 AND trim(title)=?2 COLLATE NOCASE")?.query_map(params![estimate.to_string(),title],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
        if ids.len() > 1 {
            return Err(invalid("Hay rubros homónimos; elegí uno por su código"));
        }
        if let Some(id) = ids.first() {
            Some(id.clone())
        } else {
            let id = Uuid::new_v4().to_string();
            let code =
                crate::project_dashboard::next_code(conn, &format!("section:{estimate}"), "REG-")?;
            let position: i64 = conn.query_row(
                "SELECT COALESCE(MAX(position),-1)+1 FROM budget_sections WHERE estimate_id=?1",
                [estimate.to_string()],
                |r| r.get(0),
            )?;
            conn.execute("INSERT INTO budget_sections(id,estimate_id,code,title,position) VALUES(?1,?2,?3,?4,?5)",params![id,estimate.to_string(),code,title,position])?;
            Some(id)
        }
    } else {
        None
    };
    conn.execute(
        "DELETE FROM estimate_line_sections WHERE line_id=?1",
        [line.to_string()],
    )?;
    if let Some(section) = section {
        conn.execute(
            "INSERT INTO estimate_line_sections(line_id,section_id) VALUES(?1,?2)",
            params![line.to_string(), section],
        )?;
    }
    Ok(())
}
pub(crate) fn apply_changes(conn: &Connection, batch: &ReviewedBatch) -> Result<()> {
    for change in &batch.acus {
        let (description, unit, old_quantity): (String, String, String) = conn.query_row(
            "SELECT description,unit,quantity FROM estimate_lines WHERE id=?1 AND estimate_id=?2",
            params![change.line_id.to_string(), batch.estimate_id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let mut components = Vec::new();
        for c in &change.components {
            let r = &c.expected_resource;
            let price = r
                .price
                .ok_or_else(|| invalid("Precio de insumo faltante"))?;
            let kind = match r.kind.as_str() {
                "material" => ResourceKind::Material,
                "labor" => ResourceKind::Labor,
                "equipment" => ResourceKind::Equipment,
                "subcontract" => ResourceKind::Subcontract,
                _ => return Err(invalid("Tipo de insumo inválido")),
            };
            components.push(ResourcePriceSnapshot {
                resource_id: c.resource_id,
                description: r.description.clone(),
                kind,
                quantity_per_unit: c.quantity,
                unit_price: price,
            });
            conn.execute("INSERT OR IGNORE INTO estimate_resource_prices(estimate_id,resource_id,amount) VALUES(?1,?2,?3)",params![batch.estimate_id.to_string(),c.resource_id.to_string(),price.to_string()])?;
        }
        let id = Uuid::new_v4();
        let analysis = UnitCostAnalysis {
            id,
            code: format!("PART-{id}"),
            description,
            unit,
            components,
        };
        let cost = analysis
            .direct_unit_cost()
            .map_err(|e| invalid(&e.to_string()))?;
        let mut quantity = decimal(&old_quantity)?;
        if let Some(measurements) = &change.measurements {
            if measurements.is_empty() || measurements.len() > 100 {
                return Err(invalid("La medición debe tener entre 1 y 100 renglones"));
            }
            let previous: Option<(String, Option<String>)> = conn
                .query_row(
                    "SELECT source,previous_quantity FROM measured_lines WHERE line_id=?1",
                    [change.line_id.to_string()],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            let manual = match previous {
                Some((source, qty)) if source == "takeoff" => qty,
                _ => Some(old_quantity.clone()),
            };
            conn.execute(
                "DELETE FROM takeoff_rows WHERE line_id=?1 AND estimate_id=?2",
                params![change.line_id.to_string(), batch.estimate_id.to_string()],
            )?;
            // Preserve the saved formula definition, as the manual takeoff flow does.
            quantity = D::ZERO;
            for (position, m) in measurements.iter().enumerate() {
                if m.note.len() > 1000 {
                    return Err(invalid("Nota de medición demasiado larga"));
                }
                let row = TakeoffRow {
                    id: Uuid::new_v4(),
                    estimate_id: batch.estimate_id,
                    line_id: change.line_id,
                    note: m.note.clone(),
                    factor: m.factor,
                    length: m.length,
                    width: m.width,
                    height: m.height,
                    sign: m.sign,
                    position: position as i64,
                };
                quantity = quantity
                    .checked_add(row.measured_quantity()?)
                    .ok_or_else(|| invalid("Medición fuera de rango"))?;
                conn.execute("INSERT INTO takeoff_rows(id,estimate_id,line_id,note,factor,length,width,height,sign,position) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![row.id.to_string(),batch.estimate_id.to_string(),change.line_id.to_string(),row.note,row.factor.to_string(),row.length.to_string(),row.width.to_string(),row.height.to_string(),row.sign,row.position])?;
            }
            if quantity < D::ZERO {
                return Err(invalid("La medición neta no puede ser negativa"));
            }
            conn.execute("INSERT OR REPLACE INTO measured_lines(line_id,source,previous_quantity) VALUES(?1,'takeoff',?2)",params![change.line_id.to_string(),manual])?;
        }
        if quantity.checked_mul(cost).is_none() {
            return Err(invalid("Importe de partida fuera de rango"));
        }
        conn.execute(
            "INSERT INTO analyses(id,code,description,unit,snapshot_json) VALUES(?1,?2,?3,?4,?5)",
            params![
                id.to_string(),
                analysis.code,
                analysis.description,
                analysis.unit,
                serde_json::to_string(&analysis)?
            ],
        )?;
        conn.execute(
            "INSERT INTO line_analysis_snapshots(analysis_id) VALUES(?1)",
            [id.to_string()],
        )?;
        conn.execute("UPDATE estimate_lines SET analysis_id=?1,unit_cost_snapshot=?2,quantity=?3 WHERE id=?4 AND estimate_id=?5",params![id.to_string(),cost.to_string(),quantity.to_string(),change.line_id.to_string(),batch.estimate_id.to_string()])?;
        conn.execute(
            "DELETE FROM line_analysis_sources WHERE line_id=?1",
            [change.line_id.to_string()],
        )?;
        assign_section(
            conn,
            batch.estimate_id,
            change.line_id,
            change.section_id,
            change.section_title.as_deref(),
        )?;
    }
    Ok(())
}
