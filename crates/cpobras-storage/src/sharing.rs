//! A project-scoped, read-only document; never transmit a full database to an observer.
use crate::{LocalStore, Result, StorageError};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use uuid::Uuid;
impl LocalStore {
    pub fn shared_project_document(&self, project_id: Uuid, as_of: &str) -> Result<Value> {
        let tx = self.conn.unchecked_transaction()?;
        let project = self
            .get_project(project_id)?
            .ok_or_else(|| StorageError::InvalidValue("La obra no existe".into()))?;
        let organization = self.project_organization(project_id)?;
        if organization.ownership != "own" {
            return Err(StorageError::InvalidValue(
                "Solo se pueden compartir obras propias".into(),
            ));
        }
        let client = self.person(project.client_id)?;
        let suppliers = self
            .project_suppliers(project_id)?
            .into_iter()
            .map(|id| self.person(id))
            .collect::<Result<Vec<_>>>()?;
        let budgets=self.list_project_estimates(project_id)?.into_iter().map(|estimate|{
            Ok(json!({"document":self.export_budget(estimate.id)?,"pricing":self.get_price_definition(estimate.id)?,"estimate":estimate}))
        }).collect::<Result<Vec<Value>>>()?;
        let plan = self.project_plan(project_id)?;
        let schedule = plan.as_ref().map(|p| p.plan.schedule(as_of));
        let operations = self.operation_documents(Some(project_id))?;
        let parties = operations
            .iter()
            .filter_map(|o| o.partner_id)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .map(|id| self.management_record(id))
            .collect::<Result<Vec<_>>>()?;
        let records = crate::management::KINDS
            .iter()
            .map(|kind| self.management_records(kind, Some(project_id)))
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        let warehouses = self
            .operation_warehouses()?
            .into_iter()
            .filter(|w| w.project_id == project_id)
            .collect::<Vec<_>>();
        let stock = self
            .operation_stock(as_of)?
            .into_iter()
            .filter(|s| warehouses.iter().any(|w| w.id == s.warehouse_id))
            .collect::<Vec<_>>();
        let mut resource_ids = operations
            .iter()
            .flat_map(|o| o.lines.iter().filter_map(|l| l.resource_id))
            .chain(stock.iter().map(|s| s.resource_id))
            .collect::<BTreeSet<_>>();
        for budget in &budgets {
            if let Some(analyses) = budget["document"]["line_analyses"].as_array() {
                for analysis in analyses {
                    if let Some(components) = analysis["components"].as_array() {
                        for c in components {
                            if let Some(id) = c["resource_id"]
                                .as_str()
                                .and_then(|s| Uuid::parse_str(s).ok())
                            {
                                resource_ids.insert(id);
                            }
                        }
                    }
                }
            }
        }
        let resources = resource_ids
            .into_iter()
            .map(|id| self.get_resource(id).map(|r|r.map(|r|json!({"id":r.id,"description":r.description,"unit":r.unit,"code":r.code}))))
            .collect::<Result<Vec<_>>>()?;
        let result = json!({"version":1,"project":project,"organization":organization,"client":client,"suppliers":suppliers,"budgets":budgets,"planning":plan,"schedule":schedule,"baselines":self.plan_baselines(project_id)?,"records":records,"operations":operations,"parties":parties,"warehouses":warehouses,"stock":stock,"resources":resources});
        tx.commit()?;
        Ok(result)
    }
}
