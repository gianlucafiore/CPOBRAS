use crate::{LocalStore, Result, StorageError};
use cpobras_core::costing::{CostLibrary, CostSource, FxQuote, NestedAnalysis};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceList {
    pub id: Uuid,
    pub name: String,
    pub supplier_id: Option<Uuid>,
    pub currency: String,
    pub zone: String,
    pub valid_from: String,
    pub valid_until: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScopedPrice {
    pub id: Uuid,
    pub list_id: Uuid,
    pub resource_id: Uuid,
    pub effective_date: String,
    pub amount: Decimal,
    pub source: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredFxQuote {
    pub id: Uuid,
    pub quote: FxQuote,
}
fn invalid(message: &str) -> StorageError {
    StorageError::InvalidValue(message.into())
}
fn valid_date(value: &str) -> Result<()> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| invalid("Fecha inválida"))?;
    Ok(())
}
impl LocalStore {
    pub fn price_lists(&self) -> Result<Vec<PriceList>> {
        let rows:Vec<(String,String,Option<String>,String,String,String,Option<String>)>=self.conn.prepare("SELECT id,name,supplier_id,currency,zone,valid_from,valid_until FROM price_lists ORDER BY name,id")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?)))?.collect::<std::result::Result<_,_>>()?;
        rows.into_iter()
            .map(
                |(id, name, supplier, currency, zone, valid_from, valid_until)| {
                    Ok(PriceList {
                        id: Uuid::parse_str(&id)?,
                        name,
                        supplier_id: supplier.map(|id| Uuid::parse_str(&id)).transpose()?,
                        currency,
                        zone,
                        valid_from,
                        valid_until,
                    })
                },
            )
            .collect()
    }
    pub fn create_price_list(&self, list: &PriceList) -> Result<()> {
        valid_date(&list.valid_from)?;
        if let Some(end) = &list.valid_until {
            valid_date(end)?;
            if end < &list.valid_from {
                return Err(invalid("Vigencia invertida"));
            }
        }
        if list.name.trim().is_empty()
            || list.name.len() > 500
            || list.zone.len() > 500
            || !["ARS", "USD"].contains(&list.currency.as_str())
        {
            return Err(invalid("Lista de precios inválida"));
        }
        if let Some(id) = list.supplier_id {
            if self
                .management_record(id)?
                .filter(|record| record.kind == "supplier" || record.kind == "subcontractor")
                .is_none()
            {
                return Err(invalid("Proveedor inexistente"));
            }
        }
        self.conn.execute("INSERT INTO price_lists(id,name,supplier_id,currency,zone,valid_from,valid_until) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![list.id.to_string(),list.name,list.supplier_id.map(|id|id.to_string()),list.currency,list.zone,list.valid_from,list.valid_until])?;
        Ok(())
    }
    pub fn register_scoped_price(&self, price: &ScopedPrice) -> Result<()> {
        valid_date(&price.effective_date)?;
        if price.amount < Decimal::ZERO || price.source.trim().is_empty() {
            return Err(invalid("Precio o fuente inválidos"));
        }
        let list = self
            .price_lists()?
            .into_iter()
            .find(|list| list.id == price.list_id)
            .ok_or_else(|| invalid("Lista inexistente"))?;
        if price.effective_date < list.valid_from
            || list
                .valid_until
                .is_some_and(|end| price.effective_date > end)
        {
            return Err(invalid("El precio queda fuera de vigencia de la lista"));
        }
        self.conn.execute("INSERT INTO scoped_prices(id,list_id,resource_id,effective_date,amount,source) VALUES (?1,?2,?3,?4,?5,?6)",params![price.id.to_string(),price.list_id.to_string(),price.resource_id.to_string(),price.effective_date,price.amount.to_string(),price.source])?;
        Ok(())
    }
    pub fn scoped_price_history(
        &self,
        list_id: Uuid,
        resource_id: Uuid,
    ) -> Result<Vec<ScopedPrice>> {
        let rows:Vec<(String,String,String,String)>=self.conn.prepare("SELECT id,effective_date,amount,source FROM scoped_prices WHERE list_id=?1 AND resource_id=?2 ORDER BY effective_date DESC,sequence DESC")?.query_map(params![list_id.to_string(),resource_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?.collect::<std::result::Result<_,_>>()?;
        rows.into_iter()
            .map(|(id, effective_date, amount, source)| {
                Ok(ScopedPrice {
                    id: Uuid::parse_str(&id)?,
                    list_id,
                    resource_id,
                    effective_date,
                    amount: amount
                        .parse()
                        .map_err(|_| invalid("Precio almacenado inválido"))?,
                    source,
                })
            })
            .collect()
    }
    pub fn nested_analyses(&self) -> Result<Vec<NestedAnalysis>> {
        let rows: Vec<String> = self
            .conn
            .prepare("SELECT analysis_json FROM nested_analyses WHERE NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='nested_analysis' AND a.entity_id=nested_analyses.id) ORDER BY code,id")?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        rows.into_iter()
            .map(|s| Ok(serde_json::from_str(&s)?))
            .collect()
    }
    pub fn save_nested_analysis(&mut self, analysis: &NestedAnalysis) -> Result<()> {
        let mut analyses = self.nested_analyses()?;
        analyses.retain(|old| old.id != analysis.id);
        analyses.push(analysis.clone());
        let mut prices = BTreeMap::new();
        for item in &analyses {
            for component in &item.components {
                if let CostSource::Resource { id } = component.source {
                    if self.get_resource(id)?.is_none() {
                        return Err(invalid("Insumo inexistente"));
                    }
                    prices.insert(id, Decimal::ZERO);
                }
            }
        }
        let library = CostLibrary { analyses, prices };
        // Validate every node: editing a child may otherwise invalidate an existing parent.
        for item in &library.analyses {
            library
                .calculate(item.id)
                .map_err(StorageError::InvalidValue)?;
        }
        self.conn.execute("INSERT INTO nested_analyses(id,code,analysis_json) VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET code=excluded.code,analysis_json=excluded.analysis_json",params![analysis.id.to_string(),analysis.code,serde_json::to_string(analysis)?])?;
        Ok(())
    }
    pub fn cost_library(&self, list_id: Uuid, as_of: &str) -> Result<CostLibrary> {
        valid_date(as_of)?;
        let list = self
            .price_lists()?
            .into_iter()
            .find(|list| list.id == list_id)
            .ok_or_else(|| invalid("Lista inexistente"))?;
        if as_of < list.valid_from.as_str()
            || list
                .valid_until
                .as_ref()
                .is_some_and(|end| as_of > end.as_str())
        {
            return Err(invalid("Lista fuera de vigencia"));
        }
        let resources = self.list_resources()?;
        let mut prices = BTreeMap::new();
        for resource in resources {
            let amount:Option<String>=self.conn.query_row("SELECT amount FROM scoped_prices WHERE list_id=?1 AND resource_id=?2 AND effective_date<=?3 ORDER BY effective_date DESC,sequence DESC LIMIT 1",params![list_id.to_string(),resource.id.to_string(),as_of],|r|r.get(0)).optional()?;
            if let Some(value) = amount {
                prices.insert(
                    resource.id,
                    value
                        .parse()
                        .map_err(|_| invalid("Precio almacenado inválido"))?,
                );
            }
        }
        Ok(CostLibrary {
            analyses: self.nested_analyses()?,
            prices,
        })
    }
    pub fn save_fx_quote(&self, quote: &FxQuote) -> Result<Uuid> {
        quote
            .convert(Decimal::ONE, &quote.from, &quote.to)
            .map_err(StorageError::InvalidValue)?;
        let id = Uuid::new_v4();
        self.conn.execute(
            "INSERT INTO fx_quotes(id,quote_json) VALUES (?1,?2)",
            params![id.to_string(), serde_json::to_string(quote)?],
        )?;
        Ok(id)
    }
    pub fn fx_quotes(&self) -> Result<Vec<StoredFxQuote>> {
        let rows: Vec<(String, String)> = self
            .conn
            .prepare("SELECT id,quote_json FROM fx_quotes ORDER BY created_at,id")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        rows.into_iter()
            .map(|(id, json)| {
                Ok(StoredFxQuote {
                    id: Uuid::parse_str(&id)?,
                    quote: serde_json::from_str(&json)?,
                })
            })
            .collect()
    }
}
