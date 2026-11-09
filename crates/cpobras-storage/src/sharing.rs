//! A project-scoped, read-only document; never transmit a full database to an observer.
use crate::{LocalStore, Result, StorageError};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use uuid::Uuid;
impl LocalStore {
    pub fn shared_project_document(&self, project_id: Uuid, as_of: &str) -> Result<Value> {
        let tx = self.conn.unchecked_transaction()?;
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM entity_archives WHERE kind='project' AND entity_id=?1)",
            [project_id.to_string()],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(StorageError::InvalidValue(
                "La obra fue eliminada de las listas".into(),
            ));
        }
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
            Ok(json!({"document":self.export_budget(estimate.id)?,"pricing":self.get_price_definition(estimate.id)?,"report":self.operations_report(project_id,Some(estimate.id),as_of)?,"metadata":self.estimate_metadata(estimate.id)?,"measured_line_ids":self.measured_lines(estimate.id)?,"resource_prices":self.estimate_resource_prices(estimate.id)?,"print_data":self.budget_print_data(estimate.id).ok(),"estimate":estimate,"adjustment_agreement":self.adjustment_agreement(estimate.id)?,"certification_overview":self.certification_overview(project_id,estimate.id,as_of)?,"certificate_sheets":self.operation_documents(Some(project_id))?.iter().filter(|o|o.estimate_id==Some(estimate.id)&&["certificate","subcertificate"].contains(&o.kind.as_str())).map(|o|self.issued_certificate_sheet(o.id)).collect::<Result<Vec<_>>>()?}))
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
            .map(|id| self.get_resource(id).map(|r|r.map(|r|json!({"id":r.id,"description":r.description,"unit":r.unit,"code":r.code,"kind":r.kind,"active":r.active}))))
            .collect::<Result<Vec<_>>>()?;
        let result = json!({"version":1,"as_of":as_of,"project":project,"organization":organization,"client":client,"suppliers":suppliers,"budgets":budgets,"planning":plan,"schedule":schedule,"baselines":self.plan_baselines(project_id)?,"plan_revisions":self.plan_revisions(project_id)?,"records":records,"operations":operations,"site_book":self.shared_site_entries(project_id)?,"quotation_requests":self.quotation_requests(project_id)?,"quotation_responses":self.quotation_requests(project_id)?.iter().map(|r|self.quote_responses(r.id)).collect::<Result<Vec<_>>>()?.into_iter().flatten().collect::<Vec<_>>(),"material_orders":self.supplier_orders(project_id,"material")?,"work_orders":self.supplier_orders(project_id,"work")?,"parties":parties,"warehouses":warehouses,"stock":stock,"resources":resources});
        tx.commit()?;
        Ok(result)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
pub struct SharingPermissions {
    pub budget: bool,
    pub price: bool,
    pub resources: bool,
    pub operations: bool,
    pub accounting: bool,
    pub planning: bool,
    pub project_data: bool,
    pub materials: Option<bool>,
    pub subcontracts: Option<bool>,
    pub site_book: Option<bool>,
    pub certificates: Option<bool>,
}
impl Default for SharingPermissions {
    fn default() -> Self {
        Self {
            budget: true,
            price: true,
            resources: true,
            operations: true,
            accounting: true,
            planning: true,
            project_data: true,
            materials: None,
            subcontracts: None,
            site_book: None,
            certificates: None,
        }
    }
}
impl SharingPermissions {
    pub fn validate(&self) -> Result<()> {
        if [
            self.budget,
            self.price,
            self.resources,
            self.operations,
            self.accounting,
            self.planning,
            self.project_data,
            self.materials.unwrap_or(false),
            self.subcontracts.unwrap_or(false),
            self.site_book.unwrap_or(false),
            self.certificates.unwrap_or(false),
        ]
        .into_iter()
        .any(|v| v)
        {
            Ok(())
        } else {
            Err(StorageError::InvalidValue(
                "Permití al menos un apartado".into(),
            ))
        }
    }
}
/// Redact before serialization/transmission, including secondary copies of restricted data.
pub fn restrict_shared_document(mut data: Value, p: &SharingPermissions) -> Value {
    let mut resolved = p.clone();
    resolved.materials = Some(p.materials.unwrap_or(p.operations));
    resolved.subcontracts = Some(p.subcontracts.unwrap_or(p.operations));
    resolved.site_book = Some(p.site_book.unwrap_or(p.operations));
    resolved.certificates = Some(p.certificates.unwrap_or(p.operations && p.accounting));
    resolved.operations = resolved.materials == Some(true)
        || resolved.subcontracts == Some(true)
        || resolved.site_book == Some(true)
        || resolved.certificates == Some(true);
    let p = &resolved;
    let original = data.clone();
    data["permissions"] = json!(p);
    if !p.planning {
        data["planning"] = Value::Null;
        data["schedule"] = Value::Null;
        data["baselines"] = json!([]);
        data["plan_revisions"] = json!([]);
    }
    if !p.project_data {
        if let Some(requests) = data["quotation_requests"].as_array_mut() {
            for r in requests {
                r["profile"] = json!({});
            }
        }
        if let Some(ops) = data["operations"].as_array_mut() {
            for op in ops {
                if let Some(r) = op
                    .get_mut("quotation_request")
                    .and_then(Value::as_object_mut)
                {
                    r.insert("profile".into(), json!({}));
                }
            }
        }
        if let Some(parties) = data["parties"].as_array_mut() {
            for party in parties {
                let old = party.clone();
                *party = json!({"id":old["id"],"kind":old["kind"],"name":old["name"],"code":old["code"],"attributes":{}});
            }
        }
        let client = data["client"].clone();
        data["client"] = json!({"id":client["id"],"name":client["name"]});
        data["suppliers"] = json!([]);
        data["records"] = json!([]);
    }
    if !p.resources {
        data["resources"] = json!([]);
        data["stock"] = json!([]);
        if let Some(tasks) = data
            .get_mut("planning")
            .and_then(|v| v.get_mut("plan"))
            .and_then(|v| v.get_mut("tasks"))
            .and_then(Value::as_array_mut)
        {
            for task in tasks {
                task["assignments"] = json!([]);
            }
        }
        for collection in ["baselines", "plan_revisions"] {
            if let Some(plans) = data[collection].as_array_mut() {
                for plan in plans {
                    if let Some(tasks) = plan["plan"]["tasks"].as_array_mut() {
                        for task in tasks {
                            task["assignments"] = json!([]);
                        }
                    }
                }
            }
        }
    }
    if !p.operations {
        data["site_book"] = json!([]);
        data["warehouses"] = json!([]);
        data["stock"] = json!([]);
    }
    if let Some(operations) = data["operations"].as_array_mut() {
        let finance = [
            "payable",
            "receivable",
            "payment",
            "collection",
            "advance_paid",
            "advance_received",
            "retention_payable",
            "retention_receivable",
            "forecast",
        ];
        operations.retain(|o| {
            if finance.contains(&o["kind"].as_str().unwrap_or("")) {
                p.accounting
            } else {
                p.operations
            }
        });
        if !p.resources {
            for o in operations {
                o["lines"] = json!([]);
            }
        }
    }
    if !p.accounting {
        if let Some(plan) = data.get_mut("planning").and_then(|p| p.get_mut("plan")) {
            plan["finance"] = json!({"cut_dates":plan["finance"]["cut_dates"].as_array().cloned().unwrap_or_default()});
        }
        for field in ["baselines", "plan_revisions"] {
            if let Some(rows) = data.get_mut(field).and_then(Value::as_array_mut) {
                for row in rows {
                    if let Some(plan) = row.get_mut("plan") {
                        plan["finance"] = json!({"cut_dates":plan["finance"]["cut_dates"].as_array().cloned().unwrap_or_default()});
                    }
                }
            }
        }
    }
    if !p.accounting || !p.price {
        if let Some(rows) = data.get_mut("operations").and_then(Value::as_array_mut) {
            for o in rows {
                o["index_snapshot"] = Value::Null;
                o["extras"] = json!([]);
                o["reconcile_ids"] = json!([]);
                o["reconciliations"] = json!([]);
            }
        }
    }
    if !p.budget {
        fn scrub_segment_bases(plan: &mut Value) {
            if let Some(parts) = plan.get_mut("segments").and_then(Value::as_object_mut) {
                for part in parts.values_mut() {
                    part["base_budget"] = json!("0");
                }
            }
        }
        if let Some(plan) = data.get_mut("planning").and_then(|p| p.get_mut("plan")) {
            scrub_segment_bases(plan);
        }
        for field in ["baselines", "plan_revisions"] {
            if let Some(rows) = data.get_mut(field).and_then(Value::as_array_mut) {
                for row in rows {
                    if let Some(plan) = row.get_mut("plan") {
                        scrub_segment_bases(plan);
                    }
                }
            }
        }
    }
    if !p.accounting {
        for field in ["records", "parties"] {
            if let Some(rows) = data.get_mut(field).and_then(Value::as_array_mut) {
                for row in rows {
                    if row["kind"] == "crew" {
                        if let Some(attrs) =
                            row.get_mut("attributes").and_then(Value::as_object_mut)
                        {
                            for key in [
                                "daily_rate",
                                "pay_currency",
                                "pay_frequency",
                                "advance_recovery_percent",
                            ] {
                                attrs.remove(key);
                            }
                        }
                    }
                }
            }
        }
    }
    if !(p.accounting && p.operations && p.budget && p.resources) {
        for key in [
            "quotation_requests",
            "quotation_responses",
            "material_orders",
            "work_orders",
        ] {
            data[key] = json!([]);
        }
    }
    if !(p.accounting && p.price && p.budget && p.resources) {
        if let Some(ops) = data["operations"].as_array_mut() {
            for op in ops {
                op["contract_terms"] = Value::Null;
                op["progress_sources"] = json!([]);
                op["quotation_request"] = Value::Null;
                op["advance_percent"] = Value::Null;
                op["work_units"] = json!("0");
            }
        }
    }
    if !p.operations && !p.accounting {
        data["parties"] = json!([]);
    }
    if let Some(budgets) = data["budgets"].as_array_mut() {
        for budget in budgets {
            if !p.accounting {
                budget["document"]["certificate_terms"] = Value::Null;
                if let Some(agreement) = budget["adjustment_agreement"].as_object_mut() {
                    agreement.remove("terms");
                }
            }
            let pricing = budget["pricing"].clone();
            budget["totals"] = json!({"direct":pricing["direct"],"total":pricing["calculation"]["breakdown"]["total"]});
            if !p.project_data {
                budget["print_data"] = Value::Null;
                budget["certificate_sheets"] = json!([]);
            }
            if !p.price {
                budget["adjustment_agreement"] = Value::Null;
                budget["document"]["adjustment_agreement"] = Value::Null;
                budget["document"]["certificate_terms"] = Value::Null;
                budget["pricing"] = json!({"revision":pricing["revision"],"custom":false,"definition":{"rows":[]},"direct":pricing["direct"],"calculation":null,"calculation_error":null});
                budget["document"]["price_definition"] = Value::Null;
                budget["document"]["rates"] = json!({});
                budget["print_data"] = Value::Null;
            }
            if !p.resources {
                budget["document"]["line_analyses"] = json!([]);
                budget["resource_prices"] = json!({});
                budget["print_data"] = Value::Null;
            }
            if !p.budget {
                budget["metadata"] = Value::Null;
                budget["measured_line_ids"] = json!([]);
                for field in [
                    "measured_line_ids",
                    "lines",
                    "sections",
                    "assignments",
                    "takeoffs",
                    "formulas",
                    "line_analyses",
                ] {
                    budget["document"][field] = json!([]);
                }
                budget["resource_prices"] = json!({});
                budget["print_data"] = Value::Null;
                if !p.price {
                    budget["totals"] = json!({});
                    budget["pricing"]["direct"] = Value::Null;
                }
            }
            if !(p.accounting && p.price && p.budget && p.resources && p.planning && p.operations) {
                budget["certification_overview"] = json!([]);
                budget["certificate_sheets"] = json!([]);
            }
            if let Some(report) = budget["report"].as_object_mut() {
                if !p.accounting || !p.price {
                    report.insert("recurring_costs".into(), json!([]));
                }
                if !(p.accounting
                    && p.budget
                    && p.price
                    && p.resources
                    && p.planning
                    && p.operations)
                {
                    report.insert("financial_projection".into(), Value::Null);
                }

                if !p.accounting {
                    report.insert("certified_percent".into(), json!("0"));
                    report.insert("approved_pending_percent".into(), json!("0"));
                    for field in [
                        "summaries",
                        "cash_flow",
                        "costs",
                        "section_results",
                        "alerts",
                    ] {
                        report.insert(field.into(), json!([]));
                    }
                }
                if !p.operations {
                    for field in ["production", "quotes", "needs", "alerts"] {
                        report.insert(field.into(), json!([]));
                    }
                }
                if !p.resources {
                    for field in ["needs", "quotes", "costs"] {
                        report.insert(field.into(), json!([]));
                    }
                }
            }
        }
    }
    let materials = p.materials == Some(true);
    let contracts = p.subcontracts == Some(true);
    let book = p.site_book == Some(true);
    let certificates = p.certificates == Some(true);
    data["material_orders"] = if materials {
        original["material_orders"].clone()
    } else {
        json!([])
    };
    data["work_orders"] = if contracts {
        original["work_orders"].clone()
    } else {
        json!([])
    };
    for key in ["quotation_requests", "quotation_responses"] {
        let requests = original["quotation_requests"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        data[key] = json!(original[key]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|r| {
                let kind = if key == "quotation_requests" {
                    r["kind"].as_str()
                } else {
                    requests
                        .iter()
                        .find(|q| q["id"] == r["request_id"])
                        .and_then(|q| q["kind"].as_str())
                };
                match kind {
                    Some("material") => materials,
                    Some("work") => contracts,
                    _ => false,
                }
            })
            .map(|mut r| {
                if !p.project_data {
                    r["profile"] = json!({});
                }
                r
            })
            .collect::<Vec<_>>());
    }
    if !materials {
        data["stock"] = json!([]);
        data["warehouses"] = json!([]);
    }
    data["site_book"] = if book {
        original["site_book"].clone()
    } else {
        json!([])
    };
    if let Some(rows) = data["operations"].as_array_mut() {
        rows.retain(|o| match o["kind"].as_str().unwrap_or("") {
            "certificate" => certificates,
            "subcontract" | "subcertificate" | "service_receipt" => contracts,
            "request" | "rfq" | "quote" | "purchase_order" | "receipt" | "stock_opening"
            | "consumption" | "return" | "transfer" => materials,
            "daily" => book,
            _ => p.accounting,
        });
    }
    if let Some(budgets) = data["budgets"].as_array_mut() {
        for (i, budget) in budgets.iter_mut().enumerate() {
            let old = &original["budgets"][i];
            budget["certificate_sheets"] = json!(old["certificate_sheets"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|s| if s["operation"]["kind"] == "certificate" {
                    certificates
                } else {
                    contracts
                })
                .map(|mut s| {
                    if !p.project_data {
                        s["profile"] = json!({});
                    }
                    s
                })
                .collect::<Vec<_>>());
            budget["certification_overview"] = if certificates {
                old["certification_overview"].clone()
            } else {
                json!([])
            };
            if !materials {
                budget["report"]["needs"] = json!([]);
                budget["report"]["quotes"] = json!([]);
            }
        }
    }
    if !p.budget {
        fn scrub(v: &mut Value) {
            match v {
                Value::Object(m) => {
                    for (k, v) in m {
                        if ["budget", "base_budget", "planned_cost", "actual_cost"]
                            .contains(&k.as_str())
                        {
                            *v = json!("0");
                        } else if k == "curve" {
                            *v = json!([]);
                        } else {
                            scrub(v)
                        }
                    }
                }
                Value::Array(a) => {
                    for v in a {
                        scrub(v)
                    }
                }
                _ => {}
            }
        }
        for key in ["planning", "schedule", "baselines", "plan_revisions"] {
            scrub(&mut data[key]);
        }
    }
    data
}
