use crate::{LocalStore, Result, StorageError};
use cpobras_core::{
    price_determination::{PriceDefinition, PriceResult},
    PricingRates,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Serialize, Deserialize)]
pub struct SavedPriceDefinition {
    pub revision: u32,
    pub custom: bool,
    pub definition: PriceDefinition,
    pub direct: rust_decimal::Decimal,
    pub calculation: Option<PriceResult>,
    pub calculation_error: Option<String>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct PriceTemplate {
    pub id: Uuid,
    pub name: String,
    pub currency: String,
    pub scope: String,
    pub definition: PriceDefinition,
}
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
pub(crate) fn calculate_price(conn: &rusqlite::Connection, id: Uuid) -> Result<PriceResult> {
    let direct = crate::estimates::checked_budget_total(conn, id)?;
    let custom: Option<String> = conn
        .query_row(
            "SELECT definition_json FROM estimate_price_definitions WHERE estimate_id=?1",
            [id.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    let definition = if let Some(json) = custom {
        serde_json::from_str::<PriceDefinition>(&json)?
    } else {
        let row:Option<(String,String,String,String,String)>=conn.query_row("SELECT general_expenses_percent,financial_expenses_percent,profit_percent,discount_percent,tax_percent FROM estimate_pricing WHERE estimate_id=?1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional()?;
        let rates = if let Some((g, f, p, d, t)) = row {
            let parse = |s: String| {
                s.parse()
                    .map_err(|_| invalid("Porcentaje guardado inválido"))
            };
            PricingRates {
                general_expenses_percent: parse(g)?,
                financial_expenses_percent: parse(f)?,
                profit_percent: parse(p)?,
                discount_percent: parse(d)?,
                tax_percent: parse(t)?,
            }
        } else {
            PricingRates::default()
        };
        PriceDefinition::from_rates(rates)
    };
    definition
        .calculate(direct)
        .map_err(StorageError::InvalidValue)
}
impl LocalStore {
    pub fn stored_price_definition(&self, id: Uuid) -> Result<Option<PriceDefinition>> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT definition_json FROM estimate_price_definitions WHERE estimate_id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        json.map(|json| serde_json::from_str(&json).map_err(Into::into))
            .transpose()
    }
    pub fn get_price_definition(&self, id: Uuid) -> Result<SavedPriceDefinition> {
        if self.get_estimate(id)?.is_none() {
            return Err(invalid("Presupuesto inexistente"));
        }
        let row:Option<(u32,String)>=self.conn.query_row("SELECT revision,definition_json FROM estimate_price_definitions WHERE estimate_id=?1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        let (revision, custom, definition) = if let Some((revision, json)) = row {
            (
                revision,
                true,
                serde_json::from_str::<PriceDefinition>(&json)?,
            )
        } else {
            (
                0,
                false,
                PriceDefinition::from_rates(self.get_estimate_pricing(id)?),
            )
        };
        let direct = self.estimate_total(id)?;
        let (calculation, calculation_error) = match definition.calculate(direct) {
            Ok(value) => (Some(value), None),
            Err(error) => (None, Some(error)),
        };
        Ok(SavedPriceDefinition {
            revision,
            custom,
            definition,
            direct,
            calculation,
            calculation_error,
        })
    }
    pub fn save_price_definition(
        &mut self,
        id: Uuid,
        revision: u32,
        definition: &PriceDefinition,
    ) -> Result<SavedPriceDefinition> {
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
            return Err(invalid(
                "La determinación de precio solo se edita en borrador",
            ));
        }
        let current:u32=tx.query_row("SELECT COALESCE((SELECT revision FROM estimate_price_definitions WHERE estimate_id=?1),0)",[id.to_string()],|r|r.get(0))?;
        if current != revision {
            return Err(invalid(
                "La determinación de precio cambió. Recargá antes de guardar",
            ));
        }
        let calculation = definition
            .calculate(crate::estimates::checked_budget_total(&tx, id)?)
            .map_err(StorageError::InvalidValue)?;
        let next = revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute("INSERT INTO estimate_price_definitions(estimate_id,revision,definition_json) VALUES (?1,?2,?3) ON CONFLICT(estimate_id) DO UPDATE SET revision=excluded.revision,definition_json=excluded.definition_json",params![id.to_string(),next,serde_json::to_string(definition)?])?;
        tx.commit()?;
        Ok(SavedPriceDefinition {
            revision: next,
            custom: true,
            definition: definition.clone(),
            direct: calculation.breakdown.direct,
            calculation: Some(calculation),
            calculation_error: None,
        })
    }
    pub fn price_templates(&self) -> Result<Vec<PriceTemplate>> {
        let rows:Vec<(String,String,String,String,String)>=self.conn.prepare("SELECT id,name,currency,scope,definition_json FROM price_definition_templates ORDER BY name,id")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)))?.collect::<std::result::Result<_,_>>()?;
        rows.into_iter()
            .map(|(id, name, currency, scope, json)| {
                Ok(PriceTemplate {
                    id: Uuid::parse_str(&id)?,
                    name,
                    currency,
                    scope,
                    definition: serde_json::from_str(&json)?,
                })
            })
            .collect()
    }
    pub fn save_price_template(
        &self,
        name: &str,
        currency: &str,
        scope: &str,
        definition: &PriceDefinition,
    ) -> Result<PriceTemplate> {
        if name.trim().is_empty()
            || name.len() > 300
            || !["ARS", "USD"].contains(&currency)
            || !["definition", "detail"].contains(&scope)
            || scope == "detail" && definition.rows.len() != 1
        {
            return Err(invalid("Datos de plantilla inválidos"));
        }
        definition
            .validate_template()
            .map_err(StorageError::InvalidValue)?;
        let saved = PriceTemplate {
            id: Uuid::new_v4(),
            name: name.trim().into(),
            currency: currency.into(),
            scope: scope.into(),
            definition: definition.clone(),
        };
        self.conn.execute("INSERT INTO price_definition_templates(id,name,currency,scope,definition_json) VALUES (?1,?2,?3,?4,?5)",params![saved.id.to_string(),saved.name,saved.currency,saved.scope,serde_json::to_string(definition)?])?;
        Ok(saved)
    }
}
