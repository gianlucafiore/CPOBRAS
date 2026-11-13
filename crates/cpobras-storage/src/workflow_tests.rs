use super::*;
use crate::{
    budget_tools::LineEdit,
    estimates::{Estimate, EstimateItem},
};
use cpobras_core::{
    costing::{CostComponent, CostSource, NestedAnalysis},
    planning::{Calendar, Plan, Task},
    Client, Currency, PricingRates, Project,
};
use rust_decimal::Decimal;
use std::collections::BTreeMap;

fn fixture() -> (LocalStore, Project, Estimate, EstimateItem) {
    let mut store = LocalStore::in_memory().unwrap();
    let client = Client {
        id: Uuid::new_v4(),
        name: "Cliente".into(),
        cuit: None,
    };
    store.save_client(&client).unwrap();
    let project = Project {
        id: Uuid::new_v4(),
        name: "Obra".into(),
        client_id: client.id,
        currency: Currency::Ars,
    };
    store.save_project(&project).unwrap();
    let estimate = Estimate {
        id: Uuid::new_v4(),
        project_id: project.id,
        title: "Base".into(),
        currency: Currency::Ars,
        issued: false,
    };
    store.create_estimate(&estimate).unwrap();
    let line = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id: estimate.id,
        position: 0,
        analysis_id: None,
        description: "Partida".into(),
        unit: "m".into(),
        quantity: Decimal::from(2),
        unit_cost_snapshot: Decimal::from(100),
    };
    store.add_estimate_item(&line).unwrap();
    (store, project, estimate, line)
}
fn undo_people_migration_for_fixture(conn: &rusqlite::Connection) {
    let triggers:Vec<String>=conn.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'audit_persons_%' OR name LIKE 'audit_management_records_%')").unwrap().query_map([],|r|r.get(0)).unwrap().collect::<std::result::Result<_,_>>().unwrap();
    for name in triggers {
        conn.execute_batch(&format!("DROP TRIGGER {name}")).unwrap();
    }
    conn.execute_batch("UPDATE management_records SET name=(SELECT name FROM persons p WHERE p.id=management_records.person_id),code=(SELECT code FROM persons p WHERE p.id=management_records.person_id),attributes_json=json_set(attributes_json,'$.cuit',COALESCE((SELECT cuit FROM persons p WHERE p.id=management_records.person_id),''),'$.email',(SELECT email FROM persons p WHERE p.id=management_records.person_id),'$.phone',(SELECT phone FROM persons p WHERE p.id=management_records.person_id),'$.address',(SELECT address FROM persons p WHERE p.id=management_records.person_id)) WHERE kind IN ('supplier','client_profile') AND person_id IS NOT NULL;
    DROP TRIGGER IF EXISTS inactive_supplier_new_offer;DROP VIEW clients;DROP INDEX supplier_person_link;DROP TABLE project_suppliers;DROP TABLE person_legacy_links;DROP TABLE people_migration_state;ALTER TABLE management_records DROP COLUMN person_id;DELETE FROM persons WHERE role='supplier';DROP INDEX person_tax_identity;
    ALTER TABLE persons DROP COLUMN role;ALTER TABLE persons DROP COLUMN code;ALTER TABLE persons DROP COLUMN email;ALTER TABLE persons DROP COLUMN phone;ALTER TABLE persons DROP COLUMN address;ALTER TABLE persons DROP COLUMN tax_key;ALTER TABLE persons DROP COLUMN revision;ALTER TABLE persons RENAME TO clients;DELETE FROM schema_migrations WHERE version=21;").unwrap();
}

#[test]
fn failed_bulk_edit_and_import_are_atomic() {
    let (mut store, project, estimate, line) = fixture();
    let before = store.change_events(0).unwrap().len();
    let changes = vec![
        LineEdit {
            id: line.id,
            description: "Cambiar".into(),
            unit: "m".into(),
            quantity: Decimal::ONE,
            unit_cost: Decimal::ONE,
        },
        LineEdit {
            id: Uuid::new_v4(),
            description: "Ajena".into(),
            unit: "m".into(),
            quantity: Decimal::ONE,
            unit_cost: Decimal::ONE,
        },
    ];
    assert!(store.edit_budget_lines(estimate.id, &changes, &[]).is_err());
    assert_eq!(
        store.estimate_items(estimate.id).unwrap()[0].description,
        "Partida"
    );
    assert_eq!(before, store.change_events(0).unwrap().len());
    let mut document = store.export_budget(estimate.id).unwrap();
    document.lines[0].quantity = Decimal::from(-1);
    assert!(store.import_budget(project.id, &document).is_err());
    assert_eq!(store.list_project_estimates(project.id).unwrap().len(), 1);
}
#[test]
fn templates_and_duplicate_versions_preserve_financing_and_identity() {
    let (mut store, project, estimate, line) = fixture();
    let mut rates = PricingRates::default();
    rates.financial_expenses_percent = Decimal::from(10);
    store.save_estimate_pricing(estimate.id, rates).unwrap();
    let template = store.save_budget_template(estimate.id, "Tipo").unwrap();
    let imported = store.import_budget(project.id, &template.document).unwrap();
    assert_eq!(
        store
            .get_estimate_pricing(imported.id)
            .unwrap()
            .financial_expenses_percent,
        Decimal::from(10)
    );
    let duplicate = store.duplicate_estimate(estimate.id, "Revisión").unwrap();
    assert_eq!(
        store
            .get_estimate_pricing(duplicate.id)
            .unwrap()
            .financial_expenses_percent,
        Decimal::from(10)
    );
    let mut revised = store.estimate_items(duplicate.id).unwrap().remove(0);
    revised.description = "Nombre corregido".into();
    revised.unit_cost_snapshot = Decimal::from(120);
    store.update_estimate_item(&revised).unwrap();
    let delta = store.compare_estimates(estimate.id, duplicate.id).unwrap();
    assert_eq!(delta.lines.len(), 1);
    assert_eq!(delta.difference, Decimal::from(40));
    let copied = store.duplicate_budget_line(estimate.id, line.id).unwrap();
    assert_ne!(copied, line.id);
    assert_eq!(store.estimate_items(estimate.id).unwrap().len(), 2);
    store.verify_integrity().unwrap();
}
#[test]
fn formulas_use_decimal_and_issued_lines_reject_changes() {
    let (mut store, _, estimate, line) = fixture();
    assert_eq!(
        store
            .set_line_formula(
                estimate.id,
                line.id,
                "largo * ancho - hueco",
                &BTreeMap::from([
                    ("largo".into(), Decimal::from(3)),
                    ("ancho".into(), Decimal::from(2)),
                    ("hueco".into(), Decimal::new(5, 1))
                ])
            )
            .unwrap(),
        Decimal::new(55, 1)
    );
    store.issue_estimate(estimate.id).unwrap();
    assert!(store
        .set_line_formula(estimate.id, line.id, "1", &BTreeMap::new())
        .is_err());
    assert!(store.duplicate_budget_line(estimate.id, line.id).is_err());
}
#[test]
fn saved_plan_resolves_budget_links_and_keeps_immutable_baselines() {
    let (mut store, project, estimate, line) = fixture();
    let task = Task {
        id: Uuid::new_v4(),
        parent_id: None,
        estimate_line_id: Some(line.id),
        name: "Tarea".into(),
        duration_days: 2,
        predecessors: vec![],
        not_before: None,
        finish_by: None,
        assignments: vec![],
        budget: Decimal::ZERO,
        actual_progress: Decimal::from(25),
    };
    let plan = Plan {
        calendar_overrides: None,
        finance: Default::default(),
        segments: BTreeMap::new(),
        presentation: BTreeMap::new(),
        calendar: Calendar {
            exceptions: BTreeMap::new(),
            start_date: "2026-11-05".into(),
            nonworking_weekdays: vec![5, 6],
            holidays: vec![],
        },
        tasks: vec![task],
    };
    let saved = store
        .save_project_plan(project.id, 0, plan.clone(), "2026-11-05")
        .unwrap();
    assert_eq!(saved.plan.tasks[0].budget, Decimal::from(200));
    assert!(store
        .save_project_plan(project.id, 0, plan.clone(), "2026-11-05")
        .is_err());
    let baseline = store
        .create_plan_baseline(project.id, "Contractual", "2026-11-05")
        .unwrap();
    let mut revised = saved.plan;
    revised.tasks[0].duration_days = 5;
    store
        .save_project_plan(project.id, 1, revised, "2026-11-05")
        .unwrap();
    assert_eq!(
        store.plan_baselines(project.id).unwrap()[0]
            .schedule
            .duration_days,
        2
    );
    assert!(store
        .conn
        .execute(
            "UPDATE plan_baselines SET name='Alterar' WHERE id=?1",
            [baseline.id.to_string()]
        )
        .is_err());
    assert_eq!(
        store.estimate_total(estimate.id).unwrap(),
        Decimal::from(200)
    );
    store.delete_estimate_item(estimate.id, line.id).unwrap();
    let plan = store.project_plan(project.id).unwrap().unwrap();
    assert_eq!(plan.revision, 3);
    assert!(plan.plan.tasks[0].estimate_line_id.is_none());
    assert_eq!(plan.plan.tasks[0].budget, Decimal::from(200));
    assert_eq!(plan.plan.tasks[0].actual_progress, Decimal::ZERO);
    assert_eq!(
        store.plan_baselines(project.id).unwrap()[0].plan.tasks[0].estimate_line_id,
        Some(line.id)
    );
    store.verify_integrity().unwrap();
}
#[test]
fn scoped_prices_choose_latest_revision_and_reject_bad_validity() {
    use crate::advanced_costing::*;
    use crate::resource_catalog::{Resource, ResourcePrice};
    let (mut store, _, _, _) = fixture();
    let resource = Resource {
        id: Uuid::new_v4(),
        code: "M".into(),
        description: "Material".into(),
        unit: "kg".into(),
        kind: cpobras_core::ResourceKind::Material,
        active: true,
    };
    store.save_resource(&resource).unwrap();
    let list = PriceList {
        id: Uuid::new_v4(),
        name: "Proveedor ARS".into(),
        supplier_id: None,
        currency: "ARS".into(),
        zone: "Buenos Aires".into(),
        valid_from: "2026-11-01".into(),
        valid_until: Some("2026-11-30".into()),
    };
    store.create_price_list(&list).unwrap();
    for amount in [100, 120] {
        store
            .register_scoped_price(&ScopedPrice {
                id: Uuid::new_v4(),
                list_id: list.id,
                resource_id: resource.id,
                effective_date: "2026-11-05".into(),
                amount: Decimal::from(amount),
                source: "Cotización".into(),
            })
            .unwrap();
    }
    assert_eq!(
        store.cost_library(list.id, "2026-11-05").unwrap().prices[&resource.id],
        Decimal::from(120)
    );
    assert!(store.cost_library(list.id, "2026-12-01").is_err());
    assert_eq!(
        store
            .scoped_price_history(list.id, resource.id)
            .unwrap()
            .len(),
        2
    );
    let component = CostComponent {
        source: CostSource::Resource { id: resource.id },
        quantity_formula: "2".into(),
        variables: BTreeMap::new(),
        waste_percent: Decimal::from(10),
        production_coefficient: Decimal::ONE,
        yield_factor: Decimal::ONE,
    };
    let analysis = NestedAnalysis {
        id: Uuid::new_v4(),
        code: "C".into(),
        description: "Compuesto".into(),
        unit: "m".into(),
        components: vec![component],
    };
    store.save_nested_analysis(&analysis).unwrap();
    assert_eq!(
        store
            .cost_library(list.id, "2026-11-05")
            .unwrap()
            .calculate(analysis.id)
            .unwrap()
            .unit_cost,
        Decimal::from(264)
    );
    let _unused_type: Option<ResourcePrice> = None;
}
#[test]
fn upgrades_schema_six_without_losing_existing_clients() {
    let path = std::env::temp_dir().join(format!("cpobras-old-{}.sqlite", Uuid::new_v4()));
    let conn = Connection::open(&path).unwrap();
    for sql in [
        INITIAL_MIGRATION,
        RESOURCES_MIGRATION,
        ESTIMATES_MIGRATION,
        SECTIONS_MIGRATION,
        PRICING_MIGRATION,
        TAKEOFFS_MIGRATION,
    ] {
        conn.execute_batch(sql).unwrap();
    }
    for version in 1..=6 {
        conn.execute(
            "INSERT INTO schema_migrations(version) VALUES (?1)",
            [version],
        )
        .unwrap();
    }
    let id = Uuid::new_v4();
    conn.execute(
        "INSERT INTO clients(id,name) VALUES (?1,'Histórico')",
        [id.to_string()],
    )
    .unwrap();
    drop(conn);
    let mut restored = LocalStore::in_memory().unwrap();
    restored.restore_from(&path).unwrap();
    assert_eq!(restored.list_clients().unwrap()[0].id, id);
    let store = LocalStore::open_existing(&path).unwrap();
    assert_eq!(store.list_clients().unwrap()[0].id, id);
    store.verify_integrity().unwrap();
    drop(store);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn parametric_templates_round_trip_and_manual_edits_invalidate_the_formula() {
    let (mut store, project, estimate, line) = fixture();
    store
        .set_line_formula(estimate.id, line.id, "2*3", &BTreeMap::new())
        .unwrap();
    let document = store.export_budget(estimate.id).unwrap();
    assert_eq!(document.formulas.len(), 1);
    let imported = store.import_budget(project.id, &document).unwrap();
    assert_eq!(store.export_budget(imported.id).unwrap().formulas.len(), 1);
    let version = store
        .duplicate_estimate(estimate.id, "Versión paramétrica")
        .unwrap();
    assert_eq!(store.export_budget(version.id).unwrap().formulas.len(), 1);
    let change = LineEdit {
        id: line.id,
        description: line.description,
        unit: line.unit,
        quantity: Decimal::from(7),
        unit_cost: line.unit_cost_snapshot,
    };
    store
        .edit_budget_lines(estimate.id, &[change], &[])
        .unwrap();
    assert!(store
        .export_budget(estimate.id)
        .unwrap()
        .formulas
        .is_empty());
}

#[test]
fn project_economic_defaults_apply_only_to_new_estimates() {
    let (mut store, project, old, _) = fixture();
    let profile = crate::management::ManagementRecord {
        id: Uuid::new_v4(),
        kind: "project_profile".into(),
        name: "Ficha de obra".into(),
        code: "OB".into(),
        company_id: None,
        parent_id: None,
        project_id: Some(project.id),
        client_id: None,
        attributes: BTreeMap::from([
            ("financial_expenses_percent".into(), "5".into()),
            ("tax_percent".into(), "21".into()),
        ]),
        revision: 0,
    };
    store.save_management_record(&profile).unwrap();
    let estimate = Estimate {
        id: Uuid::new_v4(),
        project_id: project.id,
        title: "Nuevo".into(),
        currency: Currency::Ars,
        issued: false,
    };
    store.create_estimate(&estimate).unwrap();
    assert_eq!(
        store
            .get_estimate_pricing(estimate.id)
            .unwrap()
            .financial_expenses_percent,
        Decimal::from(5)
    );
    assert_eq!(
        store
            .get_estimate_pricing(old.id)
            .unwrap()
            .financial_expenses_percent,
        Decimal::ZERO
    );
}

#[test]
fn drag_move_preserves_identity_and_reassigns_sections_atomically() {
    use crate::budget_sections::BudgetSection;
    let (mut store, _, estimate, line) = fixture();
    let second = store.duplicate_budget_line(estimate.id, line.id).unwrap();
    let section = BudgetSection {
        id: Uuid::new_v4(),
        estimate_id: estimate.id,
        parent_id: None,
        code: "01".into(),
        title: "Preliminares".into(),
        position: 0,
    };
    store.save_budget_section(&section).unwrap();
    store
        .move_budget_line(estimate.id, second, Some(line.id), Some(section.id))
        .unwrap();
    assert_eq!(store.estimate_items(estimate.id).unwrap()[0].id, second);
    assert_eq!(
        store.list_line_sections(estimate.id).unwrap(),
        vec![(second, section.id)]
    );
    let before = store.export_budget(estimate.id).unwrap();
    assert!(store
        .move_budget_line(estimate.id, line.id, None, Some(Uuid::new_v4()))
        .is_err());
    assert_eq!(
        store.export_budget(estimate.id).unwrap().lines,
        before.lines
    );
    store
        .move_budget_line(estimate.id, second, None, None)
        .unwrap();
    assert!(store.list_line_sections(estimate.id).unwrap().is_empty());
    store.issue_estimate(estimate.id).unwrap();
    assert!(store
        .move_budget_line(estimate.id, second, Some(line.id), None)
        .is_err());
    store.verify_integrity().unwrap();
}

#[test]
fn direct_line_resources_are_private_snapshots_and_survive_versions_and_exchange() {
    use crate::line_workflows::LineResourceInput;
    use crate::resource_catalog::Resource;
    let (mut store, project, estimate, line) = fixture();
    let resource = Resource {
        id: Uuid::new_v4(),
        code: "MO".into(),
        description: "Operario".into(),
        unit: "h".into(),
        kind: cpobras_core::ResourceKind::Labor,
        active: true,
    };
    store.save_resource(&resource).unwrap();
    let inputs = vec![LineResourceInput {
        resource_id: resource.id,
        quantity: Decimal::new(25, 1),
        unit_price: Decimal::from(100),
    }];
    let id = store
        .save_line_resources(estimate.id, line.id, &inputs)
        .unwrap();
    assert!(store.is_line_analysis(id).unwrap());
    assert!(store.list_analyses().unwrap().is_empty());
    assert_eq!(
        store.estimate_total(estimate.id).unwrap(),
        Decimal::from(500)
    );
    let copy = store.duplicate_estimate(estimate.id, "Copia").unwrap();
    store
        .save_line_resources(
            estimate.id,
            line.id,
            &[LineResourceInput {
                resource_id: resource.id,
                quantity: Decimal::from(3),
                unit_price: Decimal::from(100),
            }],
        )
        .unwrap();
    assert_eq!(store.estimate_total(copy.id).unwrap(), Decimal::from(500));
    let document = store.export_budget(estimate.id).unwrap();
    assert_eq!(document.line_analyses.len(), 1);
    let imported = store.import_budget(project.id, &document).unwrap();
    let imported_line = store.estimate_items(imported.id).unwrap().remove(0);
    assert!(store
        .is_line_analysis(imported_line.analysis_id.unwrap())
        .unwrap());
    assert_eq!(
        store.estimate_total(imported.id).unwrap(),
        Decimal::from(600)
    );
    let mut manual = store.estimate_items(estimate.id).unwrap().remove(0);
    manual.unit_cost_snapshot = Decimal::from(50);
    store.update_estimate_item(&manual).unwrap();
    assert!(store.estimate_items(estimate.id).unwrap()[0]
        .analysis_id
        .is_none());
    store.issue_estimate(copy.id).unwrap();
    let copy_line = store.estimate_items(copy.id).unwrap()[0].id;
    assert!(store
        .save_line_resources(copy.id, copy_line, &inputs)
        .is_err());
    store.verify_integrity().unwrap();
}

fn operation(project: Uuid, kind: &str) -> crate::operations::Operation {
    crate::operations::Operation {
        project_id: project,
        kind: kind.into(),
        number: Uuid::new_v4().to_string(),
        date: "2026-11-05".into(),
        ..Default::default()
    }
}
fn supplier(store: &mut LocalStore) -> Uuid {
    let id = Uuid::new_v4();
    store
        .save_management_record(&crate::management::ManagementRecord {
            id,
            kind: "supplier".into(),
            name: "Proveedor".into(),
            code: "P".into(),
            company_id: None,
            parent_id: None,
            project_id: None,
            client_id: None,
            attributes: BTreeMap::new(),
            revision: 0,
        })
        .unwrap();
    id
}
fn stock_fixture() -> (
    LocalStore,
    Project,
    Estimate,
    EstimateItem,
    Uuid,
    Uuid,
    Uuid,
) {
    let (mut s, p, e, l) = fixture();
    let supplier = supplier(&mut s);
    let resource = Uuid::new_v4();
    s.save_resource(&crate::resource_catalog::Resource {
        id: resource,
        code: "MAT".into(),
        description: "Material".into(),
        unit: "kg".into(),
        kind: cpobras_core::ResourceKind::Material,
        active: true,
    })
    .unwrap();
    let wh = Uuid::new_v4();
    s.create_operation_warehouse(&crate::operations::Warehouse {
        id: wh,
        project_id: p.id,
        name: "Depósito".into(),
        location: "A".into(),
    })
    .unwrap();
    (s, p, e, l, supplier, resource, wh)
}
fn material_row(
    resource: Uuid,
    line: Uuid,
    quantity: i64,
    price: i64,
) -> crate::operations::OperationLine {
    crate::operations::OperationLine {
        resource_id: Some(resource),
        line_id: Some(line),
        description: "Material".into(),
        quantity: quantity.into(),
        unit_price: price.into(),
        ..Default::default()
    }
}
#[test]
fn procurement_receipts_stock_transfers_returns_and_costs_reconcile() {
    let (mut s, p, e, l, supplier, res, wh) = stock_fixture();
    let mut request = operation(p.id, "request");
    request.lines = vec![material_row(res, l.id, 10, 0)];
    let request = s.post_operation(&request).unwrap();
    let mut rfq = operation(p.id, "rfq");
    rfq.reference_id = Some(request.id);
    rfq.lines = request.lines.clone();
    let rfq = s.post_operation(&rfq).unwrap();
    let mut quote = operation(p.id, "quote");
    quote.partner_id = Some(supplier);
    quote.reference_id = Some(rfq.id);
    quote.lines = vec![material_row(res, l.id, 10, 3)];
    let quote = s.post_operation(&quote).unwrap();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.reference_id = Some(quote.id);
    order.lines = quote.lines.clone();
    let order = s.post_operation(&order).unwrap();
    let mut receipt = operation(p.id, "receipt");
    receipt.partner_id = Some(supplier);
    receipt.reference_id = Some(order.id);
    receipt.warehouse_id = Some(wh);
    receipt.lines = vec![material_row(res, l.id, 6, 999)];
    let receipt = s.post_operation(&receipt).unwrap();
    assert_eq!(receipt.amount, 18.into());
    let mut over = receipt.clone();
    over.id = Uuid::new_v4();
    over.number = "OVER".into();
    over.lines[0].quantity = 5.into();
    assert!(s.post_operation(&over).is_err());
    let mut use_ = operation(p.id, "consumption");
    use_.warehouse_id = Some(wh);
    use_.lines = vec![material_row(res, l.id, 4, 999)];
    let use_ = s.post_operation(&use_).unwrap();
    assert_eq!(use_.amount, 12.into());
    let mut ret = operation(p.id, "return");
    ret.reference_id = Some(use_.id);
    ret.warehouse_id = Some(wh);
    ret.lines = vec![material_row(res, l.id, 1, 999)];
    let ret = s.post_operation(&ret).unwrap();
    assert_eq!(ret.amount, 3.into());
    let mut badret = ret.clone();
    badret.id = Uuid::new_v4();
    badret.number = "OVERRETURN".into();
    badret.lines[0].quantity = 4.into();
    assert!(s.post_operation(&badret).is_err());
    let other = Project {
        id: Uuid::new_v4(),
        name: "Otra obra".into(),
        ..p.clone()
    };
    s.save_project(&other).unwrap();
    let dest = Uuid::new_v4();
    s.create_operation_warehouse(&crate::operations::Warehouse {
        id: dest,
        project_id: other.id,
        name: "Destino".into(),
        location: "B".into(),
    })
    .unwrap();
    let mut transfer = operation(p.id, "transfer");
    transfer.warehouse_id = Some(wh);
    transfer.destination_id = Some(dest);
    transfer.lines = vec![material_row(res, l.id, 2, 0)];
    s.post_operation(&transfer).unwrap();
    let stock = s.operation_stock("2026-11-05").unwrap();
    assert_eq!(
        stock
            .iter()
            .find(|b| b.warehouse_id == wh)
            .unwrap()
            .quantity,
        1.into()
    );
    assert_eq!(
        stock.iter().find(|b| b.warehouse_id == dest).unwrap().value,
        6.into()
    );
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(report.summaries[0].accrued, 9.into());
    assert_eq!(report.summaries[0].committed, 30.into());
    assert!(report.quotes[0].complete);
    assert!(s
        .conn
        .execute(
            "DELETE FROM operation_documents WHERE id=?1",
            [use_.id.to_string()]
        )
        .is_err());
    s.verify_integrity().unwrap();
}
#[test]
fn stock_limits_are_atomic_and_currency_is_not_mixed() {
    let (mut s, p, _, l, supplier, res, wh) = stock_fixture();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.lines = vec![material_row(res, l.id, 3, 1)];
    let order = s.post_operation(&order).unwrap();
    let mut receipt = operation(p.id, "receipt");
    receipt.partner_id = Some(supplier);
    receipt.reference_id = Some(order.id);
    receipt.warehouse_id = Some(wh);
    receipt.lines = order.lines.clone();
    s.post_operation(&receipt).unwrap();
    let mut usage = operation(p.id, "consumption");
    usage.warehouse_id = Some(wh);
    usage.lines = vec![material_row(res, l.id, 4, 1)];
    let before = s.change_events(0).unwrap().len();
    assert!(s.post_operation(&usage).is_err());
    assert_eq!(before, s.change_events(0).unwrap().len());
    usage.lines[0].quantity = 1.into();
    usage.currency = "USD".into();
    usage.lines[0].line_id = None;
    assert!(s.post_operation(&usage).is_err());
    usage.currency = "ARS".into();
    usage.date = "2026-11-04".into();
    assert!(s.post_operation(&usage).is_err());
    usage.date = "2026-11-05".into();
    usage.lines[0].quantity = 3.into();
    s.post_operation(&usage).unwrap();
    let b = s.operation_stock("2026-11-05").unwrap();
    assert_eq!(b[0].quantity, Decimal::ZERO);
    assert_eq!(b[0].value, Decimal::ZERO);
}
#[test]
fn daily_production_cost_and_budget_progress_are_persisted() {
    let (mut s, p, e, l) = fixture();
    let mut daily = operation(p.id, "daily");
    daily.crew = "Cuadrilla A / Pérez presente".into();
    daily.incidents = "Lluvia, sin accidentes".into();
    daily.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Trabajo".into(),
        quantity: 1.into(),
        hours: 4.into(),
        unit_price: 10.into(),
        ..Default::default()
    }];
    let saved = s.post_operation(&daily).unwrap();
    assert_eq!(saved.amount, 40.into());
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(report.production[0].percent, 50.into());
    assert_eq!(report.production[0].actual_hours_per_unit, Some(4.into()));
    assert_eq!(report.summaries[0].accrued, 40.into());
    assert_eq!(report.summaries[0].physical_percent, 50.into());
    let mut over = daily.clone();
    over.id = Uuid::new_v4();
    over.number = "EXCESS".into();
    over.lines[0].quantity = 2.into();
    assert!(s.post_operation(&over).is_err());
}
#[test]
fn certificates_accumulate_deductions_and_preserve_issued_snapshots() {
    let (mut s, p, e, l) = fixture();
    let mut cert = operation(p.id, "certificate");
    cert.estimate_id = Some(e.id);
    cert.period_start = "2026-11-01".into();
    cert.period_end = "2026-11-05".into();
    cert.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Trabajo".into(),
        quantity: 1.into(),
        unit_price: 999.into(),
        ..Default::default()
    }];
    let mut advance = operation(p.id, "advance_received");
    advance.amount = 10.into();
    s.post_operation(&advance).unwrap();
    cert.advance = 10.into();
    cert.discount = 5.into();
    cert.retention_percent = 5.into();
    assert!(s.post_operation(&cert).is_err());
    s.issue_estimate(e.id).unwrap();
    let saved = s.post_operation(&cert).unwrap();
    assert_eq!(saved.amount, 80.into());
    assert_eq!(saved.calculated["gross"], 100.into());
    assert_eq!(saved.calculated["retention"], 5.into());
    assert_eq!(saved.calculated["pending"], 100.into());
    let mut overlap = cert.clone();
    overlap.id = Uuid::new_v4();
    overlap.number = "OVERLAP".into();
    assert!(s.post_operation(&overlap).is_err());
    overlap.date = "2026-11-10".into();
    overlap.period_start = "2026-11-06".into();
    overlap.period_end = "2026-11-10".into();
    overlap.advance = 0.into();
    let second = s.post_operation(&overlap).unwrap();
    assert_eq!(second.calculated["previous"], 100.into());
    assert_eq!(second.calculated["accumulated"], 200.into());
    assert_eq!(second.calculated["pending"], 0.into());
    assert!(s.post_operation(&second).is_err());
}
#[test]
fn subcontract_service_acceptance_and_certification_do_not_duplicate_cost() {
    let (mut s, p, e, l) = fixture();
    s.issue_estimate(e.id).unwrap();
    let supplier = supplier(&mut s);
    let mut contract = operation(p.id, "subcontract");
    contract.partner_id = Some(supplier);
    contract.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Servicio".into(),
        quantity: 2.into(),
        unit_price: 50.into(),
        ..Default::default()
    }];
    contract.terms = "Plazo 15 días; anticipo 10%; reparo 5%".into();
    let contract = s.post_operation(&contract).unwrap();
    let mut receipt = operation(p.id, "service_receipt");
    receipt.reference_id = Some(contract.id);
    receipt.partner_id = Some(supplier);
    receipt.lines = contract.lines.clone();
    s.post_operation(&receipt).unwrap();
    let mut cert = operation(p.id, "subcertificate");
    cert.reference_id = Some(contract.id);
    cert.partner_id = Some(supplier);
    cert.estimate_id = Some(e.id);
    cert.period_start = "2026-11-01".into();
    cert.period_end = "2026-11-05".into();
    cert.lines = contract.lines.clone();
    let cert = s.post_operation(&cert).unwrap();
    assert_eq!(cert.amount, 100.into());
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(report.summaries[0].accrued, 100.into());
    assert_eq!(report.summaries[0].payable, 100.into());
}
#[test]
fn verified_period_indices_calculate_contractual_adjustments_exactly() {
    let (mut s, p, e, l) = fixture();
    s.issue_estimate(e.id).unwrap();
    let mut cert = operation(p.id, "certificate");
    cert.estimate_id = Some(e.id);
    cert.period_start = "2026-11-01".into();
    cert.period_end = "2026-11-05".into();
    cert.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Trabajo".into(),
        ..Default::default()
    }];
    let cert = s.post_operation(&cert).unwrap();
    let mut adjustment = operation(p.id, "adjustment");
    adjustment.reference_id = Some(cert.id);
    adjustment.base_period = "2026-10".into();
    adjustment.target_period = "2026-11".into();
    adjustment.adjustment_weights = vec![crate::operations::IndexWeight {
        series: "IPC".into(),
        weight: Decimal::ONE,
    }];
    assert!(s.post_operation(&adjustment).is_err());
    for (period, value) in [("2026-10", 100), ("2026-11", 125)] {
        let mut index = operation(p.id, "index");
        index.index_period = period.into();
        index.index_series = "IPC".into();
        index.index_source = "https://www.indec.gob.ar/publicacion".into();
        index.index_value = value.into();
        s.post_operation(&index).unwrap();
    }
    let saved = s.post_operation(&adjustment).unwrap();
    assert_eq!(saved.amount, 25.into());
    assert_eq!(saved.calculated["factor"], "1.25".parse().unwrap());
    let mut duplicate = adjustment.clone();
    duplicate.id = Uuid::new_v4();
    duplicate.number = "DUPLICATE".into();
    assert!(s.post_operation(&duplicate).is_err());
}
#[test]
fn invoices_partial_settlements_cashflow_and_forecasts_reconcile() {
    let (mut s, p, e, _) = fixture();
    let supplier = supplier(&mut s);
    let mut invoice = operation(p.id, "payable");
    invoice.partner_id = Some(supplier);
    invoice.amount = 100.into();
    invoice.due_date = "2026-11-06".into();
    let invoice = s.post_operation(&invoice).unwrap();
    let mut payment = operation(p.id, "payment");
    payment.partner_id = Some(supplier);
    payment.reference_id = Some(invoice.id);
    payment.amount = 40.into();
    s.post_operation(&payment).unwrap();
    let mut excess = payment.clone();
    excess.id = Uuid::new_v4();
    excess.number = "EXCESS".into();
    excess.amount = 61.into();
    assert!(s.post_operation(&excess).is_err());
    let mut income = operation(p.id, "receivable");
    income.amount = 200.into();
    income.due_date = "2026-11-05".into();
    let income = s.post_operation(&income).unwrap();
    let mut collection = operation(p.id, "collection");
    collection.reference_id = Some(income.id);
    collection.amount = 120.into();
    s.post_operation(&collection).unwrap();
    let mut forecast = operation(p.id, "forecast");
    forecast.amount = 50.into();
    forecast.due_date = "2026-12-01".into();
    s.post_operation(&forecast).unwrap();
    let report = s.operations_report(p.id, Some(e.id), "2026-11-07").unwrap();
    let f = &report.summaries[0];
    assert_eq!(f.payable, 60.into());
    assert_eq!(f.receivable, 80.into());
    assert_eq!(f.overdue_payable, 60.into());
    assert_eq!(f.cash, 80.into());
    assert_eq!(f.cost_to_finish, 50.into());
    assert_eq!(f.expected_result, 150.into());
    assert_eq!(report.cash_flow[0].planned_out, 100.into());
    assert_eq!(report.cash_flow[0].actual_out, 40.into());
    assert_eq!(s.operations_portfolio("2026-11-07").unwrap().len(), 1);
}
#[test]
fn operation_backups_restore_documents_and_stock() {
    let (mut s, p, _, l, supplier, res, wh) = stock_fixture();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.lines = vec![material_row(res, l.id, 2, 5)];
    let order = s.post_operation(&order).unwrap();
    let mut receipt = operation(p.id, "receipt");
    receipt.reference_id = Some(order.id);
    receipt.partner_id = Some(supplier);
    receipt.warehouse_id = Some(wh);
    receipt.lines = order.lines;
    s.post_operation(&receipt).unwrap();
    let path = std::env::temp_dir().join(format!("cpobras-operations-{}.sqlite", Uuid::new_v4()));
    s.backup_to(&path).unwrap();
    let mut restored = LocalStore::in_memory().unwrap();
    restored.restore_from(&path).unwrap();
    assert_eq!(restored.operation_documents(Some(p.id)).unwrap().len(), 2);
    assert_eq!(
        restored.operation_stock("2026-11-05").unwrap()[0].value,
        10.into()
    );
    restored.verify_integrity().unwrap();
    std::fs::remove_file(path).unwrap();
}

#[test]
fn stock_weighted_average_and_full_returns_preserve_the_exact_value() {
    let (mut s, p, e, l, supplier, res, wh) = stock_fixture();
    for (quantity, price) in [(1, 2), (2, 1)] {
        let mut order = operation(p.id, "purchase_order");
        order.partner_id = Some(supplier);
        order.lines = vec![material_row(res, l.id, quantity, price)];
        let order = s.post_operation(&order).unwrap();
        let mut receipt = operation(p.id, "receipt");
        receipt.partner_id = Some(supplier);
        receipt.reference_id = Some(order.id);
        receipt.warehouse_id = Some(wh);
        receipt.lines = order.lines;
        s.post_operation(&receipt).unwrap();
    }
    let mut usage = operation(p.id, "consumption");
    usage.warehouse_id = Some(wh);
    usage.lines = vec![material_row(res, l.id, 3, 0)];
    let usage = s.post_operation(&usage).unwrap();
    assert_eq!(usage.amount, 4.into());
    assert_eq!(s.operation_stock("2026-11-05").unwrap()[0].value, 0.into());
    for quantity in [1, 2] {
        let mut ret = operation(p.id, "return");
        ret.reference_id = Some(usage.id);
        ret.warehouse_id = Some(wh);
        ret.lines = vec![material_row(res, l.id, quantity, 0)];
        s.post_operation(&ret).unwrap();
    }
    let stock = s.operation_stock("2026-11-05").unwrap();
    assert_eq!(stock[0].quantity, 3.into());
    assert_eq!(stock[0].value, 4.into());
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(report.summaries[0].accrued, 0.into());
    assert_eq!(report.costs[0].actual, 0.into());
}
#[test]
fn advances_retention_releases_and_certificate_sales_prices_reconcile() {
    let (mut s, p, e, l) = fixture();
    s.save_estimate_pricing(
        e.id,
        PricingRates {
            profit_percent: 10.into(),
            ..Default::default()
        },
    )
    .unwrap();
    s.issue_estimate(e.id).unwrap();
    let mut advance = operation(p.id, "advance_received");
    advance.amount = 20.into();
    s.post_operation(&advance).unwrap();
    let mut cert = operation(p.id, "certificate");
    cert.estimate_id = Some(e.id);
    cert.period_start = "2026-11-01".into();
    cert.period_end = "2026-11-05".into();
    cert.advance = 20.into();
    cert.retention_percent = 10.into();
    cert.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Trabajo".into(),
        quantity: 1.into(),
        ..Default::default()
    }];
    let cert = s.post_operation(&cert).unwrap();
    assert_eq!(cert.calculated["gross"], 110.into());
    assert_eq!(cert.calculated["pending"], 110.into());
    assert_eq!(cert.amount, 79.into());
    let mut release = operation(p.id, "retention_receivable");
    release.reference_id = Some(cert.id);
    release.amount = 11.into();
    release.due_date = "2026-11-05".into();
    let release = s.post_operation(&release).unwrap();
    let mut bad = release.clone();
    bad.id = Uuid::new_v4();
    bad.number = "OVER".into();
    bad.amount = 1.into();
    assert!(s.post_operation(&bad).is_err());
    let mut collection = operation(p.id, "collection");
    collection.reference_id = Some(release.id);
    collection.amount = 11.into();
    s.post_operation(&collection).unwrap();
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(report.summaries[0].retained_receivable, 0.into());
    assert_eq!(report.summaries[0].advance_received_balance, 0.into());
    assert_eq!(report.summaries[0].collected, 31.into());
    assert_eq!(report.costs[0].certified_income, 110.into());
    assert_eq!(report.section_results[0].result, 110.into());
}
#[test]
fn attendance_and_equipment_hours_do_not_duplicate_daily_production() {
    let (mut s, p, e, l) = fixture();
    let mut daily = operation(p.id, "daily");
    let production = crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Producción".into(),
        quantity: 1.into(),
        ..Default::default()
    };
    let worker = crate::operations::OperationLine {
        line_id: Some(l.id),
        entry_type: "labor".into(),
        description: "Pérez".into(),
        hours: 8.into(),
        unit_price: 5.into(),
        ..Default::default()
    };
    let equipment = crate::operations::OperationLine {
        line_id: Some(l.id),
        entry_type: "equipment".into(),
        description: "Equipo".into(),
        hours: 4.into(),
        unit_price: 10.into(),
        ..Default::default()
    };
    daily.lines = vec![production, worker, equipment];
    s.post_operation(&daily).unwrap();
    let r = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(r.production[0].executed_quantity, 1.into());
    assert_eq!(r.production[0].hours, 8.into());
    assert_eq!(r.summaries[0].accrued, 80.into());
    daily.id = Uuid::new_v4();
    daily.number = "BAD ABSENCE".into();
    daily.lines[1].attendance = "absent".into();
    assert!(s.post_operation(&daily).is_err());
}
#[test]
fn simultaneous_stock_consumptions_cannot_spend_the_same_existence() {
    let (mut s, p, _, l, supplier, res, wh) = stock_fixture();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.lines = vec![material_row(res, l.id, 3, 1)];
    let order = s.post_operation(&order).unwrap();
    let mut receipt = operation(p.id, "receipt");
    receipt.partner_id = Some(supplier);
    receipt.reference_id = Some(order.id);
    receipt.warehouse_id = Some(wh);
    receipt.lines = order.lines;
    s.post_operation(&receipt).unwrap();
    let path = std::env::temp_dir().join(format!("cpobras-concurrent-{}.sqlite", Uuid::new_v4()));
    s.backup_to(&path).unwrap();
    let mut stores = vec![
        LocalStore::open(&path).unwrap(),
        LocalStore::open(&path).unwrap(),
    ];
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = stores
        .drain(..)
        .map(|mut store| {
            let barrier = barrier.clone();
            let mut use_ = operation(p.id, "consumption");
            use_.warehouse_id = Some(wh);
            use_.lines = vec![material_row(res, l.id, 2, 0)];
            std::thread::spawn(move || {
                barrier.wait();
                store.post_operation(&use_).is_ok()
            })
        })
        .collect();
    let successes = handles
        .into_iter()
        .map(|h| h.join().unwrap())
        .filter(|ok| *ok)
        .count();
    assert_eq!(successes, 1);
    let reloaded = LocalStore::open(&path).unwrap();
    assert_eq!(
        reloaded.operation_stock("2026-11-05").unwrap()[0].quantity,
        1.into()
    );
    drop(reloaded);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn deleting_a_draft_cascades_owned_data_preserves_catalog_and_other_versions() {
    use crate::line_workflows::LineResourceInput;
    use crate::takeoffs::TakeoffRow;
    let (mut store, _, estimate, line) = fixture();
    let resource = Uuid::new_v4();
    store
        .save_resource(&crate::resource_catalog::Resource {
            id: resource,
            code: "MAT-DELETE".into(),
            description: "Material compartido".into(),
            unit: "kg".into(),
            kind: cpobras_core::ResourceKind::Material,
            active: true,
        })
        .unwrap();
    let inputs = [LineResourceInput {
        resource_id: resource,
        quantity: 2.into(),
        unit_price: 3.into(),
    }];
    let analysis = store
        .save_line_resources(estimate.id, line.id, &inputs)
        .unwrap();
    let copy = store
        .duplicate_estimate(estimate.id, "Otra versión")
        .unwrap();
    let section = crate::budget_sections::BudgetSection {
        id: Uuid::new_v4(),
        estimate_id: estimate.id,
        parent_id: None,
        code: "01".into(),
        title: "Rubro".into(),
        position: 0,
    };
    store.save_budget_section(&section).unwrap();
    store
        .assign_line_section(estimate.id, line.id, section.id)
        .unwrap();
    store
        .save_takeoff_row(&TakeoffRow {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            line_id: line.id,
            note: "Medición".into(),
            factor: 1.into(),
            length: 2.into(),
            width: 1.into(),
            height: 1.into(),
            sign: 1,
            position: 0,
        })
        .unwrap();
    store
        .set_line_formula(
            estimate.id,
            line.id,
            "x",
            &BTreeMap::from([("x".into(), 2.into())]),
        )
        .unwrap();
    store.delete_estimate_item(estimate.id, line.id).unwrap();
    assert!(store.estimate_items(estimate.id).unwrap().is_empty());
    assert_eq!(store.estimate_total(estimate.id).unwrap(), 0.into());
    assert!(store.list_line_sections(estimate.id).unwrap().is_empty());
    assert!(store.get_resource(resource).unwrap().is_some());
    assert!(store.get_analysis(analysis).unwrap().is_some());
    assert_eq!(store.estimate_total(copy.id).unwrap(), 12.into());
    for table in ["takeoff_rows", "line_formulas", "line_origins"] {
        let count: i64 = store
            .conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE line_id=?1"),
                [line.id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
    let copied_line = store.estimate_items(copy.id).unwrap()[0].id;
    store.issue_estimate(copy.id).unwrap();
    assert!(store.delete_estimate_item(copy.id, copied_line).is_err());
    assert_eq!(store.estimate_total(copy.id).unwrap(), 12.into());
    assert!(store
        .conn
        .execute(
            "UPDATE deleted_estimate_lines SET line_json='{}' WHERE id=?1",
            [line.id.to_string()]
        )
        .is_err());
    store.verify_integrity().unwrap();
}
#[test]
fn deleting_a_line_keeps_documents_stock_and_receiving_pending_orders_working() {
    let (mut store, p, e, line, supplier, res, wh) = stock_fixture();
    let analysis = store
        .save_line_resources(
            e.id,
            line.id,
            &[crate::line_workflows::LineResourceInput {
                resource_id: res,
                quantity: 1.into(),
                unit_price: 2.into(),
            }],
        )
        .unwrap();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.estimate_id = Some(e.id);
    order.lines = vec![material_row(res, line.id, 4, 2)];
    let order = store.post_operation(&order).unwrap();
    let before = serde_json::to_string(&order).unwrap();
    let mut first = operation(p.id, "receipt");
    first.reference_id = Some(order.id);
    first.partner_id = Some(supplier);
    first.estimate_id = Some(e.id);
    first.warehouse_id = Some(wh);
    first.lines = vec![material_row(res, line.id, 2, 2)];
    store.post_operation(&first).unwrap();
    let mut usage = operation(p.id, "consumption");
    usage.warehouse_id = Some(wh);
    usage.lines = vec![material_row(res, line.id, 1, 0)];
    let usage = store.post_operation(&usage).unwrap();
    let mut progress = operation(p.id, "daily");
    progress.lines = vec![crate::operations::OperationLine {
        line_id: Some(line.id),
        description: "Producción registrada".into(),
        hours: 3.into(),
        unit_price: 1.into(),
        ..Default::default()
    }];
    store.post_operation(&progress).unwrap();
    store.delete_estimate_item(e.id, line.id).unwrap();
    assert!(store.get_analysis(analysis).unwrap().is_none());
    assert!(!store.is_line_analysis(analysis).unwrap());
    assert!(store.get_resource(res).unwrap().is_some());
    assert_eq!(
        serde_json::to_string(&store.operation_documents(Some(p.id)).unwrap()[0]).unwrap(),
        before
    );
    let link: (Option<String>, String) = store
        .conn
        .query_row(
            "SELECT line_id,archived_line_id FROM operation_links WHERE document_id=?1",
            [order.id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert!(link.0.is_none());
    assert_eq!(link.1, line.id.to_string());
    assert!(store
        .conn
        .execute(
            "UPDATE operation_links SET archived_line_id=NULL WHERE document_id=?1",
            [order.id.to_string()]
        )
        .is_err());
    let mut receipt = operation(p.id, "receipt");
    receipt.reference_id = Some(order.id);
    receipt.partner_id = Some(supplier);
    receipt.estimate_id = Some(e.id);
    receipt.warehouse_id = Some(wh);
    receipt.lines = vec![material_row(res, line.id, 2, 2)];
    store.post_operation(&receipt).unwrap();
    assert_eq!(
        store.operation_stock("2026-11-05").unwrap()[0].value,
        6.into()
    );
    assert_eq!(
        store
            .operations_report(p.id, Some(e.id), "2026-11-05")
            .unwrap()
            .summaries[0]
            .accrued,
        5.into()
    );
    let mut returned = operation(p.id, "return");
    returned.reference_id = Some(usage.id);
    returned.warehouse_id = Some(wh);
    returned.lines = vec![material_row(res, line.id, 1, 0)];
    store.post_operation(&returned).unwrap();
    let report = store
        .operations_report(p.id, Some(e.id), "2026-11-05")
        .unwrap();
    assert_eq!(report.summaries[0].accrued, 3.into());
    assert!(report.costs[0].line_description.contains("eliminada"));
    let mut daily = operation(p.id, "daily");
    daily.lines = vec![crate::operations::OperationLine {
        line_id: Some(line.id),
        description: "No se puede producir una partida eliminada".into(),
        ..Default::default()
    }];
    assert!(store.post_operation(&daily).is_err());
    let archived: Option<String> = store
        .conn
        .query_row(
            "SELECT analysis_json FROM deleted_estimate_lines WHERE id=?1",
            [line.id.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    let snapshot: cpobras_core::UnitCostAnalysis =
        serde_json::from_str(&archived.unwrap()).unwrap();
    assert_eq!(snapshot.direct_unit_cost().unwrap(), 2.into());
    store.verify_integrity().unwrap();
}
#[test]
fn failed_line_deletion_rolls_back_archive_and_composition() {
    let (mut store, _, e, l) = fixture();
    store.conn.execute_batch("CREATE TRIGGER fail_line_delete BEFORE DELETE ON estimate_lines BEGIN SELECT RAISE(ABORT,'simulate failure'); END;").unwrap();
    let before = store.change_events(0).unwrap().len();
    assert!(store.delete_estimate_item(e.id, l.id).is_err());
    assert_eq!(store.estimate_items(e.id).unwrap().len(), 1);
    assert_eq!(
        store
            .conn
            .query_row("SELECT COUNT(*) FROM deleted_estimate_lines", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(store.change_events(0).unwrap().len(), before);
    store.verify_integrity().unwrap();
}

#[test]
fn upgrades_populated_schema_fifteen_and_deletes_its_preexisting_linked_line() {
    let (mut store, p, e, line, supplier, res, _) = stock_fixture();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.lines = vec![material_row(res, line.id, 2, 3)];
    store.post_operation(&order).unwrap();
    let path = std::env::temp_dir().join(format!("cpobras-schema15-{}.sqlite", Uuid::new_v4()));
    store.backup_to(&path).unwrap();
    let old = Connection::open(&path).unwrap();
    // Build the previous persisted schema with populated source documents and live FK links.
    let triggers: Vec<String> = old
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='operation_links'",
        )
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap();
    for name in triggers {
        assert!(name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'));
        old.execute_batch(&format!("DROP TRIGGER {name}")).unwrap();
    }
    undo_people_migration_for_fixture(&old);
    old.execute_batch("DROP TRIGGER assisted_batches_no_update; DROP TRIGGER assisted_batches_no_delete; DROP TABLE assisted_budget_batches; DROP TRIGGER inactive_client_new_project; DROP TRIGGER inactive_client_change_project; DROP TRIGGER IF EXISTS inactive_supplier_new_offer; DROP TABLE advance_agreement_links; DROP TABLE entity_archives; DROP TABLE supplier_movements; DROP TABLE operation_files; ALTER TABLE operation_links DROP COLUMN archived_line_id; DROP TABLE deleted_estimate_lines; DROP TABLE line_analysis_sources; DROP TABLE estimate_resource_prices; DROP TABLE quotation_request_revisions;DROP TABLE quotation_response_files;DROP TABLE quotation_awards;DROP TABLE quotation_responses;DROP TABLE site_book_entries;DROP TABLE certificate_drafts;DROP TABLE certificate_sheets;DROP TABLE certified_sources;DROP TABLE quotation_requests;DROP TABLE estimate_adjustment_agreements;DROP TABLE index_points;DROP TABLE system_calendar;DROP TABLE estimate_price_definitions; DROP TABLE price_definition_templates;
             DROP TABLE print_profiles; DROP TRIGGER new_project_organization; DROP TRIGGER external_company_readonly_update; DROP TRIGGER external_company_readonly_delete; DROP TRIGGER clear_measured_quantity; DROP TABLE automatic_codes; DROP TABLE measured_lines; DROP TABLE project_attachments; DROP TABLE project_organizations; DROP TABLE organization_preferences; DROP TABLE organizations; DELETE FROM schema_migrations WHERE version>=16; CREATE TRIGGER operation_links_no_update BEFORE UPDATE ON operation_links BEGIN SELECT RAISE(ABORT,'operation links are immutable'); END;").unwrap();
    drop(old);
    let mut upgraded = LocalStore::open(&path).unwrap();
    assert_eq!(
        upgraded
            .conn
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        34
    );
    upgraded.delete_estimate_item(e.id, line.id).unwrap();
    assert!(upgraded.estimate_items(e.id).unwrap().is_empty());
    assert_eq!(upgraded.operation_documents(Some(p.id)).unwrap().len(), 1);
    assert!(upgraded.get_resource(res).unwrap().is_some());
    upgraded.verify_integrity().unwrap();
    drop(upgraded);
    std::fs::remove_file(path).unwrap();
}

fn pattern_fixture() -> (LocalStore, Project, Estimate, Vec<Uuid>, Vec<Uuid>) {
    let (mut s, p, e, l) = fixture();
    let second = EstimateItem {
        id: Uuid::new_v4(),
        position: 1,
        description: "Revoque".into(),
        quantity: 6.into(),
        ..l.clone()
    };
    let third = EstimateItem {
        id: Uuid::new_v4(),
        position: 2,
        description: "Pintura".into(),
        quantity: 4.into(),
        ..l.clone()
    };
    s.add_estimate_item(&second).unwrap();
    s.add_estimate_item(&third).unwrap();
    let root = crate::budget_sections::BudgetSection {
        id: Uuid::new_v4(),
        estimate_id: e.id,
        parent_id: None,
        code: "01".into(),
        title: "Estructura".into(),
        position: 0,
    };
    let child = crate::budget_sections::BudgetSection {
        id: Uuid::new_v4(),
        parent_id: Some(root.id),
        code: "01.01".into(),
        title: "Terminaciones".into(),
        position: 1,
        ..root.clone()
    };
    let other = crate::budget_sections::BudgetSection {
        id: Uuid::new_v4(),
        code: "02".into(),
        title: "Otros".into(),
        position: 2,
        ..root.clone()
    };
    let empty = crate::budget_sections::BudgetSection {
        id: Uuid::new_v4(),
        code: "03".into(),
        title: "Vacío".into(),
        position: 3,
        ..root.clone()
    };
    for section in [&root, &child, &other, &empty] {
        s.save_budget_section(section).unwrap();
    }
    for (line, section) in [(l.id, root.id), (second.id, child.id), (third.id, other.id)] {
        s.assign_line_section(e.id, line, section).unwrap();
    }
    s.set_line_formula(e.id, l.id, "x", &BTreeMap::from([("x".into(), 2.into())]))
        .unwrap();
    s.save_takeoff_row(&crate::takeoffs::TakeoffRow {
        id: Uuid::new_v4(),
        estimate_id: e.id,
        line_id: second.id,
        note: "Pared".into(),
        factor: 2.into(),
        length: 3.into(),
        width: 1.into(),
        height: 1.into(),
        sign: 1,
        position: 0,
    })
    .unwrap();
    (
        s,
        p,
        e,
        vec![l.id, second.id, third.id],
        vec![root.id, child.id, other.id, empty.id],
    )
}
fn pattern_destination(s: &mut LocalStore, p: &Project) -> Estimate {
    let dest = Project {
        id: Uuid::new_v4(),
        name: "Obra destino".into(),
        ..p.clone()
    };
    s.save_project(&dest).unwrap();
    let estimate = Estimate {
        id: Uuid::new_v4(),
        project_id: dest.id,
        title: "Destino".into(),
        currency: p.currency,
        issued: false,
    };
    s.create_estimate(&estimate).unwrap();
    estimate
}
#[test]
fn patterns_copy_selected_trees_once_with_takeoffs_formulas_and_fresh_identities() {
    use crate::budget_patterns::*;
    let (mut s, p, e, lines, sections) = pattern_fixture();
    let target = pattern_destination(&mut s, &p);
    let existing = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id: target.id,
        position: 0,
        analysis_id: None,
        description: "Existente".into(),
        unit: "un".into(),
        quantity: 1.into(),
        unit_cost_snapshot: 10.into(),
    };
    s.add_estimate_item(&existing).unwrap();
    let root = crate::budget_sections::BudgetSection {
        id: Uuid::new_v4(),
        estimate_id: target.id,
        parent_id: None,
        code: "01".into(),
        title: "Destino".into(),
        position: 0,
    };
    s.save_budget_section(&root).unwrap();
    s.save_estimate_pricing(
        target.id,
        PricingRates {
            profit_percent: 10.into(),
            ..Default::default()
        },
    )
    .unwrap();
    let result = s
        .apply_budget_pattern(
            target.id,
            &PatternSource {
                estimate_id: Some(e.id),
                template_id: None,
            },
            &PatternSelection {
                line_ids: vec![lines[1]],
                section_ids: vec![sections[0], sections[1]],
            },
            true,
            Some(root.id),
        )
        .unwrap();
    assert_eq!(result.line_ids.len(), 2);
    assert_eq!(result.section_ids.len(), 2);
    assert_eq!(result.takeoff_count, 1);
    assert!(result.line_ids.iter().all(|id| !lines.contains(id)));
    assert_eq!(s.estimate_total(target.id).unwrap(), 810.into());
    assert_eq!(s.estimate_items(e.id).unwrap().len(), 3);
    let copied = s.export_budget(target.id).unwrap();
    assert_eq!(copied.formulas.len(), 1);
    assert_eq!(copied.takeoffs[0].note, "Pared");
    assert_eq!(copied.rates.profit_percent, 10.into());
    let imported_root = copied
        .sections
        .iter()
        .find(|r| r.title == "Estructura")
        .unwrap();
    assert_eq!(imported_root.parent_id, Some(root.id));
    assert_eq!(imported_root.code, "01-2");
    let origin: String = s
        .conn
        .query_row(
            "SELECT origin_id FROM line_origins WHERE line_id=?1",
            [result.line_ids[0].to_string()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(origin, result.line_ids[0].to_string());
    s.verify_integrity().unwrap();
}
#[test]
fn patterns_select_single_lines_without_siblings_and_can_copy_empty_sections() {
    use crate::budget_patterns::*;
    let (mut s, p, e, lines, sections) = pattern_fixture();
    let target = pattern_destination(&mut s, &p);
    let source = PatternSource {
        estimate_id: Some(e.id),
        template_id: None,
    };
    let result = s
        .apply_budget_pattern(
            target.id,
            &source,
            &PatternSelection {
                line_ids: vec![lines[1]],
                section_ids: vec![],
            },
            false,
            None,
        )
        .unwrap();
    assert_eq!(result.line_ids.len(), 1);
    assert_eq!(result.section_ids.len(), 2);
    let copied = s.estimate_items(target.id).unwrap();
    assert_eq!(copied[0].description, "Revoque");
    assert_eq!(copied[0].quantity, 6.into());
    assert_eq!(copied[0].unit_cost_snapshot, 0.into());
    assert!(copied[0].analysis_id.is_none());
    assert_eq!(
        s.list_takeoff_rows(target.id, copied[0].id).unwrap().len(),
        1
    );
    let empty = s
        .apply_budget_pattern(
            target.id,
            &source,
            &PatternSelection {
                line_ids: vec![],
                section_ids: vec![sections[3]],
            },
            false,
            None,
        )
        .unwrap();
    assert!(empty.line_ids.is_empty());
    assert_eq!(empty.section_ids.len(), 1);
}
#[test]
fn saved_patterns_are_independent_and_can_cross_currencies_without_prices() {
    use crate::budget_patterns::*;
    let (mut s, p, e, lines, _) = pattern_fixture();
    let saved = s
        .save_budget_pattern(
            &PatternSource {
                estimate_id: Some(e.id),
                template_id: None,
            },
            &PatternSelection {
                line_ids: vec![lines[1]],
                section_ids: vec![],
            },
            "Muros",
            true,
        )
        .unwrap();
    let mut changed = s.estimate_items(e.id).unwrap()[1].clone();
    changed.description = "Otro nombre".into();
    changed.quantity = 20.into();
    s.update_estimate_item(&changed).unwrap();
    let usd = Project {
        currency: Currency::Usd,
        ..p.clone()
    };
    let target = pattern_destination(&mut s, &usd);
    let source = PatternSource {
        estimate_id: None,
        template_id: Some(saved.id),
    };
    let selection = PatternSelection {
        line_ids: vec![lines[1]],
        section_ids: vec![],
    };
    assert!(s
        .apply_budget_pattern(target.id, &source, &selection, true, None)
        .is_err());
    s.apply_budget_pattern(target.id, &source, &selection, false, None)
        .unwrap();
    let line = &s.estimate_items(target.id).unwrap()[0];
    assert_eq!(line.description, "Revoque");
    assert_eq!(line.quantity, 6.into());
    assert_eq!(line.unit_cost_snapshot, 0.into());
    assert_eq!(
        s.budget_templates().unwrap()[0].document.lines[0].quantity,
        6.into()
    );
}
#[test]
fn invalid_or_issued_pattern_application_is_atomic() {
    use crate::budget_patterns::*;
    let (mut s, p, e, lines, sections) = pattern_fixture();
    let target = pattern_destination(&mut s, &p);
    let source = PatternSource {
        estimate_id: Some(e.id),
        template_id: None,
    };
    let before = s.change_events(0).unwrap().len();
    assert!(s
        .apply_budget_pattern(
            target.id,
            &source,
            &PatternSelection {
                line_ids: vec![Uuid::new_v4()],
                section_ids: vec![]
            },
            false,
            None
        )
        .is_err());
    assert!(s
        .apply_budget_pattern(
            target.id,
            &source,
            &PatternSelection {
                line_ids: vec![lines[0]],
                section_ids: vec![]
            },
            false,
            Some(sections[0])
        )
        .is_err());
    assert_eq!(before, s.change_events(0).unwrap().len());
    s.conn
        .execute(
            "UPDATE line_formulas SET expression='x+1' WHERE line_id=?1",
            [lines[0].to_string()],
        )
        .unwrap();
    let before = s.change_events(0).unwrap().len();
    assert!(s
        .apply_budget_pattern(
            target.id,
            &source,
            &PatternSelection {
                line_ids: vec![],
                section_ids: vec![sections[0]]
            },
            true,
            None
        )
        .is_err());
    assert!(s.estimate_items(target.id).unwrap().is_empty());
    assert!(s.list_budget_sections(target.id).unwrap().is_empty());
    assert_eq!(before, s.change_events(0).unwrap().len());
    let item = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id: target.id,
        position: 0,
        analysis_id: None,
        description: "Emitido".into(),
        unit: "un".into(),
        quantity: 1.into(),
        unit_cost_snapshot: 1.into(),
    };
    s.add_estimate_item(&item).unwrap();
    s.issue_estimate(target.id).unwrap();
    assert!(s
        .apply_budget_pattern(
            target.id,
            &source,
            &PatternSelection {
                line_ids: vec![lines[1]],
                section_ids: vec![]
            },
            false,
            None
        )
        .is_err());
}
#[test]
fn resource_price_changes_propagate_within_one_budget_without_changing_yields_or_versions() {
    let (mut s, p, e, l, supplier, res, _) = stock_fixture();
    let _ = supplier;
    let second = EstimateItem {
        id: Uuid::new_v4(),
        position: 1,
        description: "Otra partida".into(),
        ..l.clone()
    };
    s.add_estimate_item(&second).unwrap();
    let input = |qty, price| crate::line_workflows::LineResourceInput {
        resource_id: res,
        quantity: Decimal::from(qty),
        unit_price: Decimal::from(price),
    };
    s.save_line_resources(e.id, l.id, &[input(2, 10)]).unwrap();
    s.save_line_resources(e.id, second.id, &[input(3, 10)])
        .unwrap();
    let copy = s.duplicate_estimate(e.id, "Otra versión").unwrap();
    s.issue_estimate(copy.id).unwrap();
    let other = pattern_destination(&mut s, &p);
    let other_line = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id: other.id,
        position: 0,
        ..l.clone()
    };
    s.add_estimate_item(&other_line).unwrap();
    s.save_line_resources(other.id, other_line.id, &[input(1, 7)])
        .unwrap();
    s.save_line_resources(e.id, l.id, &[input(2, 15)]).unwrap();
    let lines = s.estimate_items(e.id).unwrap();
    assert_eq!(lines[0].unit_cost_snapshot, 30.into());
    assert_eq!(lines[1].unit_cost_snapshot, 45.into());
    assert_eq!(
        s.get_analysis(lines[1].analysis_id.unwrap())
            .unwrap()
            .unwrap()
            .components[0]
            .quantity_per_unit,
        3.into()
    );
    assert_eq!(s.estimate_resource_prices(e.id).unwrap()[&res], 15.into());
    assert_eq!(
        s.estimate_items(copy.id).unwrap()[1].unit_cost_snapshot,
        30.into()
    );
    assert_eq!(
        s.estimate_items(other.id).unwrap()[0].unit_cost_snapshot,
        7.into()
    );
    s.verify_integrity().unwrap();
}
#[test]
fn pattern_prices_use_destination_resource_prices_and_without_prices_do_not_get_repriced() {
    use crate::budget_patterns::*;
    let (mut s, p, e, l, _, res, _) = stock_fixture();
    let input = |q, p| crate::line_workflows::LineResourceInput {
        resource_id: res,
        quantity: Decimal::from(q),
        unit_price: Decimal::from(p),
    };
    s.save_line_resources(e.id, l.id, &[input(2, 10)]).unwrap();
    let target = pattern_destination(&mut s, &p);
    let line = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id: target.id,
        position: 0,
        ..l.clone()
    };
    s.add_estimate_item(&line).unwrap();
    s.save_line_resources(target.id, line.id, &[input(1, 5)])
        .unwrap();
    let source = PatternSource {
        estimate_id: Some(e.id),
        template_id: None,
    };
    let selection = PatternSelection {
        line_ids: vec![l.id],
        section_ids: vec![],
    };
    let with = s
        .apply_budget_pattern(target.id, &source, &selection, true, None)
        .unwrap();
    let without = s
        .apply_budget_pattern(target.id, &source, &selection, false, None)
        .unwrap();
    let rows = s.estimate_items(target.id).unwrap();
    assert_eq!(
        rows.iter()
            .find(|l| l.id == with.line_ids[0])
            .unwrap()
            .unit_cost_snapshot,
        10.into()
    );
    s.save_line_resources(target.id, line.id, &[input(1, 8)])
        .unwrap();
    let rows = s.estimate_items(target.id).unwrap();
    assert_eq!(
        rows.iter()
            .find(|l| l.id == with.line_ids[0])
            .unwrap()
            .unit_cost_snapshot,
        16.into()
    );
    assert_eq!(
        rows.iter()
            .find(|l| l.id == without.line_ids[0])
            .unwrap()
            .unit_cost_snapshot,
        0.into()
    );
    assert!(rows
        .iter()
        .find(|l| l.id == without.line_ids[0])
        .unwrap()
        .analysis_id
        .is_none());
}
#[test]
fn resource_price_overflow_rolls_back_every_partida_and_price() {
    let (mut s, _, e, l, _, res, _) = stock_fixture();
    let second = EstimateItem {
        id: Uuid::new_v4(),
        position: 1,
        ..l.clone()
    };
    s.add_estimate_item(&second).unwrap();
    let input = |q, p| crate::line_workflows::LineResourceInput {
        resource_id: res,
        quantity: q,
        unit_price: p,
    };
    s.save_line_resources(e.id, l.id, &[input(1.into(), 1.into())])
        .unwrap();
    s.save_line_resources(
        e.id,
        second.id,
        &[input(Decimal::MAX / Decimal::from(10), 1.into())],
    )
    .unwrap();
    let before = s.estimate_items(e.id).unwrap();
    assert!(s
        .save_line_resources(e.id, l.id, &[input(1.into(), 100.into())])
        .is_err());
    assert_eq!(s.estimate_items(e.id).unwrap(), before);
    assert_eq!(s.estimate_resource_prices(e.id).unwrap()[&res], 1.into());
}

#[test]
fn library_acus_adopt_the_budget_price_without_mutating_the_library() {
    let (mut s, _, e, l, _, res, _) = stock_fixture();
    let make = |price, quantity| cpobras_core::UnitCostAnalysis {
        id: Uuid::new_v4(),
        code: Uuid::new_v4().to_string(),
        description: "ACU".into(),
        unit: l.unit.clone(),
        components: vec![cpobras_core::ResourcePriceSnapshot {
            resource_id: res,
            description: "Material".into(),
            kind: cpobras_core::ResourceKind::Material,
            quantity_per_unit: Decimal::from(quantity),
            unit_price: Decimal::from(price),
        }],
    };
    let first = make(10, 2);
    let second = make(20, 3);
    s.save_analysis(&first).unwrap();
    s.save_analysis(&second).unwrap();
    let a = EstimateItem {
        id: Uuid::new_v4(),
        position: 1,
        analysis_id: Some(first.id),
        unit_cost_snapshot: 20.into(),
        ..l.clone()
    };
    let b = EstimateItem {
        id: Uuid::new_v4(),
        position: 2,
        analysis_id: Some(second.id),
        unit_cost_snapshot: 60.into(),
        ..l.clone()
    };
    s.add_estimate_item(&a).unwrap();
    s.add_estimate_item(&b).unwrap();
    let rows = s.estimate_items(e.id).unwrap();
    assert_eq!(rows[2].unit_cost_snapshot, 30.into());
    assert_eq!(
        s.get_analysis(second.id).unwrap().unwrap().components[0].unit_price,
        20.into()
    );
    assert_ne!(rows[2].analysis_id, Some(second.id));
}
#[test]
fn schema_seventeen_reconciles_legacy_draft_prices_once_using_the_latest_composition() {
    let (mut s, _, e, l, _, res, _) = stock_fixture();
    s.save_line_resources(
        e.id,
        l.id,
        &[crate::line_workflows::LineResourceInput {
            resource_id: res,
            quantity: 2.into(),
            unit_price: 10.into(),
        }],
    )
    .unwrap();
    let second = EstimateItem {
        id: Uuid::new_v4(),
        position: 1,
        ..l.clone()
    };
    s.add_estimate_item(&second).unwrap();
    let analysis = cpobras_core::UnitCostAnalysis {
        id: Uuid::new_v4(),
        code: "LEGACY".into(),
        description: "Legacy".into(),
        unit: l.unit.clone(),
        components: vec![cpobras_core::ResourcePriceSnapshot {
            resource_id: res,
            description: "Material".into(),
            kind: cpobras_core::ResourceKind::Material,
            quantity_per_unit: 3.into(),
            unit_price: 20.into(),
        }],
    };
    s.save_analysis(&analysis).unwrap();
    s.conn
        .execute(
            "INSERT INTO line_analysis_snapshots(analysis_id) VALUES (?1)",
            [analysis.id.to_string()],
        )
        .unwrap();
    s.conn
        .execute(
            "UPDATE estimate_lines SET analysis_id=?1,unit_cost_snapshot='60' WHERE id=?2",
            params![analysis.id.to_string(), second.id.to_string()],
        )
        .unwrap();
    let path =
        std::env::temp_dir().join(format!("cpobras-legacy-prices-{}.sqlite", Uuid::new_v4()));
    s.backup_to(&path).unwrap();
    let old = Connection::open(&path).unwrap();
    old.execute_batch("DROP TABLE line_analysis_sources;DROP TABLE estimate_resource_prices;DELETE FROM schema_migrations WHERE version=17;").unwrap();
    drop(old);
    let upgraded = LocalStore::open(&path).unwrap();
    let rows = upgraded.estimate_items(e.id).unwrap();
    assert_eq!(rows[0].unit_cost_snapshot, 40.into());
    assert_eq!(rows[1].unit_cost_snapshot, 60.into());
    assert_eq!(
        upgraded.estimate_resource_prices(e.id).unwrap()[&res],
        20.into()
    );
    let events = upgraded.change_events(0).unwrap().len();
    drop(upgraded);
    let reopened = LocalStore::open(&path).unwrap();
    assert_eq!(reopened.estimate_items(e.id).unwrap(), rows);
    assert_eq!(reopened.change_events(0).unwrap().len(), events);
    reopened.verify_integrity().unwrap();
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn legacy_library_unit_changes_do_not_prevent_opening_or_reinterpret_stored_prices() {
    let (mut s, _, e, l, _, res, _) = stock_fixture();
    let a = cpobras_core::UnitCostAnalysis {
        id: Uuid::new_v4(),
        code: "LEGACY-UNIT".into(),
        description: "Biblioteca modificada".into(),
        unit: "kg".into(),
        components: vec![cpobras_core::ResourcePriceSnapshot {
            resource_id: res,
            description: "Material".into(),
            kind: cpobras_core::ResourceKind::Material,
            quantity_per_unit: 2.into(),
            unit_price: 10.into(),
        }],
    };
    s.save_analysis(&a).unwrap();
    s.conn
        .execute(
            "UPDATE estimate_lines SET analysis_id=?1 WHERE id=?2",
            params![a.id.to_string(), l.id.to_string()],
        )
        .unwrap();
    let path =
        std::env::temp_dir().join(format!("cpobras-unit-migration-{}.sqlite", Uuid::new_v4()));
    s.backup_to(&path).unwrap();
    let old = Connection::open(&path).unwrap();
    old.execute_batch("DROP TABLE line_analysis_sources;DROP TABLE estimate_resource_prices;DELETE FROM schema_migrations WHERE version=17;").unwrap();
    drop(old);
    let upgraded = LocalStore::open(&path).unwrap();
    let line = &upgraded.estimate_items(e.id).unwrap()[0];
    assert!(line.analysis_id.is_none());
    assert_eq!(line.unit, l.unit);
    assert_eq!(line.unit_cost_snapshot, l.unit_cost_snapshot);
    upgraded.verify_integrity().unwrap();
    drop(upgraded);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn custom_price_definition_revision_copy_export_and_issue_are_consistent() {
    use cpobras_core::price_determination::{PriceDefinition, PriceKind};
    let (mut store, project, estimate, _) = fixture();
    let original = store.get_price_definition(estimate.id).unwrap();
    assert!(!original.custom);
    assert_eq!(original.revision, 0);
    let mut definition = PriceDefinition::from_rates(PricingRates::default());
    definition.rows[0].reference_percent = Decimal::from(10);
    definition.rows[2].kind = PriceKind::PercentDirect;
    definition.rows[2].percent = Decimal::from(15);
    definition.rows.last_mut().unwrap().percent = Decimal::from(21);
    let saved = store
        .save_price_definition(estimate.id, 0, &definition)
        .unwrap();
    assert_eq!(saved.revision, 1);
    assert_eq!(
        saved.calculation.unwrap().breakdown.total,
        Decimal::new(3025, 1)
    );
    assert!(store
        .save_price_definition(estimate.id, 0, &definition)
        .is_err());
    assert!(store
        .save_estimate_pricing(estimate.id, PricingRates::default())
        .is_err());
    let duplicate = store.duplicate_estimate(estimate.id, "Revisión").unwrap();
    assert_eq!(
        store.priced_estimate_total(duplicate.id).unwrap().total,
        Decimal::new(3025, 1)
    );
    let document = store.export_budget(estimate.id).unwrap();
    assert_eq!(document.format_version, 5);
    let json = serde_json::to_string(&document).unwrap();
    let imported = store
        .import_budget(project.id, &serde_json::from_str(&json).unwrap())
        .unwrap();
    assert_eq!(
        store.priced_estimate_total(imported.id).unwrap().total,
        Decimal::new(3025, 1)
    );
    store
        .save_price_template("Modelo", "ARS", "definition", &definition)
        .unwrap();
    assert_eq!(store.price_templates().unwrap()[0].definition, definition);
    store.issue_estimate(estimate.id).unwrap();
    assert!(store
        .save_price_definition(estimate.id, 1, &definition)
        .is_err());
    assert_eq!(
        store.priced_estimate_total(estimate.id).unwrap().total,
        Decimal::new(3025, 1)
    );
}

#[test]
fn invalid_custom_price_can_be_repaired_after_direct_cost_change() {
    use cpobras_core::price_determination::{PriceDefinition, PriceKind, PriceRole};
    let (mut store, _, estimate, line) = fixture();
    let mut definition = PriceDefinition::from_rates(PricingRates::default());
    definition.rows[0].kind = PriceKind::Fixed;
    definition.rows[0].role = PriceRole::Discount;
    definition.rows[0].subtract = true;
    definition.rows[0].amount = Decimal::from(150);
    store
        .save_price_definition(estimate.id, 0, &definition)
        .unwrap();
    store
        .edit_budget_lines(
            estimate.id,
            &[LineEdit {
                id: line.id,
                description: line.description,
                unit: line.unit,
                quantity: Decimal::ONE,
                unit_cost: Decimal::from(100),
            }],
            &[],
        )
        .unwrap();
    let saved = store.get_price_definition(estimate.id).unwrap();
    assert!(saved.calculation.is_none());
    assert!(saved.calculation_error.is_some());
    assert!(store.issue_estimate(estimate.id).is_err());
    definition.rows[0].amount = Decimal::from(10);
    store
        .save_price_definition(estimate.id, 1, &definition)
        .unwrap();
    assert_eq!(
        store.priced_estimate_total(estimate.id).unwrap().total,
        Decimal::from(90)
    );
    store.issue_estimate(estimate.id).unwrap();
}

#[test]
fn certificates_prorate_custom_price_including_fixed_charges() {
    use cpobras_core::price_determination::{PriceDefinition, PriceKind};
    let (mut s, p, e, l) = fixture();
    let mut definition = PriceDefinition::from_rates(PricingRates::default());
    definition.rows[0].kind = PriceKind::Fixed;
    definition.rows[0].amount = 50.into();
    s.save_price_definition(e.id, 0, &definition).unwrap();
    s.issue_estimate(e.id).unwrap();
    let mut cert = operation(p.id, "certificate");
    cert.estimate_id = Some(e.id);
    cert.period_start = "2026-11-01".into();
    cert.period_end = "2026-11-05".into();
    cert.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Mitad del trabajo".into(),
        quantity: 1.into(),
        ..Default::default()
    }];
    let cert = s.post_operation(&cert).unwrap();
    assert_eq!(cert.calculated["gross"], 125.into());
}

#[test]
fn print_snapshots_reconcile_client_prices_and_incidence_without_mutating_costs() {
    use cpobras_core::price_determination::{PriceDefinition, PriceKind};
    let (mut s, _, e, l) = fixture();
    s.edit_budget_lines(
        e.id,
        &[LineEdit {
            id: l.id,
            description: l.description.clone(),
            unit: l.unit.clone(),
            quantity: 1.into(),
            unit_cost: 1.into(),
        }],
        &[],
    )
    .unwrap();
    for position in 1..3 {
        s.add_estimate_item(&EstimateItem {
            id: Uuid::new_v4(),
            position,
            quantity: 1.into(),
            unit_cost_snapshot: 1.into(),
            ..l.clone()
        })
        .unwrap();
    }
    let mut definition = PriceDefinition::from_rates(PricingRates::default());
    definition.rows[0].kind = PriceKind::Fixed;
    definition.rows[0].amount = 1.into();
    s.save_price_definition(e.id, 0, &definition).unwrap();
    let before = s.export_budget(e.id).unwrap();
    let data = s.budget_print_data(e.id).unwrap();
    assert_eq!(data.final_total, 4.into());
    assert_eq!(
        data.lines.iter().map(|l| l.sale_total).collect::<Vec<_>>(),
        vec![
            Decimal::new(133, 2),
            Decimal::new(134, 2),
            Decimal::new(133, 2)
        ]
    );
    assert_eq!(
        data.lines
            .iter()
            .map(|l| l.incidence_percent)
            .sum::<Decimal>(),
        100.into()
    );
    assert_eq!(data.unallocated_total, 0.into());
    assert_eq!(
        serde_json::to_string(&before).unwrap(),
        serde_json::to_string(&s.export_budget(e.id).unwrap()).unwrap()
    );
    s.issue_estimate(e.id).unwrap();
    assert!(s.budget_print_data(e.id).unwrap().estimate.issued);
}
#[test]
fn print_identity_revision_logo_validation_and_backup_restore() {
    use crate::printing::PrintProfile;
    let (mut s, _, e, _) = fixture();
    let initial = s.get_print_profile().unwrap();
    assert_eq!(initial.revision, 0);
    let p = PrintProfile {
        company_name: "Constructora pública".into(),
        professional_name: "Profesional".into(),
        tax_id: "30-123".into(),
        ..Default::default()
    };
    let saved = s.save_print_profile(0, &p).unwrap();
    assert_eq!(saved.revision, 1);
    assert!(s.save_print_profile(0, &p).is_err());
    let mut bad = p.clone();
    bad.logo_png = b"no es PNG".to_vec();
    assert!(s.save_print_profile(1, &bad).is_err());
    assert!(s.save_print_profile(1, &PrintProfile::default()).is_err());
    let path = std::env::temp_dir().join(format!("cpobras-print-{}.sqlite", Uuid::new_v4()));
    s.backup_to(&path).unwrap();
    let reopened = LocalStore::open(&path).unwrap();
    assert_eq!(reopened.get_print_profile().unwrap().profile, p);
    assert_eq!(reopened.budget_print_data(e.id).unwrap().profile, p);
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}
#[test]
fn zero_direct_cost_prints_fixed_price_as_explicit_unallocated_amount() {
    use cpobras_core::price_determination::{PriceDefinition, PriceKind};
    let (mut s, _, e, l) = fixture();
    s.edit_budget_lines(
        e.id,
        &[LineEdit {
            id: l.id,
            description: l.description,
            unit: l.unit,
            quantity: 0.into(),
            unit_cost: 100.into(),
        }],
        &[],
    )
    .unwrap();
    let mut definition = PriceDefinition::from_rates(PricingRates::default());
    definition.rows[0].kind = PriceKind::Fixed;
    definition.rows[0].amount = 50.into();
    s.save_price_definition(e.id, 0, &definition).unwrap();
    let data = s.budget_print_data(e.id).unwrap();
    assert_eq!(data.final_total, 50.into());
    assert_eq!(data.unallocated_total, 50.into());
    assert_eq!(data.lines[0].sale_total, 0.into());
    assert_eq!(data.lines[0].incidence_percent, 0.into());
}

#[test]
fn organization_default_only_changes_new_projects_and_prints_use_the_project_owner() {
    use crate::printing::PrintProfile;
    let (mut s, p, e, _) = fixture();
    let a = s.default_organization().unwrap();
    s.save_organization(
        a.id,
        a.revision,
        "Organización A",
        &PrintProfile {
            company_name: "Emisor A".into(),
            ..Default::default()
        },
    )
    .unwrap();
    let b = s.create_organization("Organización B").unwrap();
    s.set_default_organization(b.id).unwrap();
    assert_eq!(s.project_organization(p.id).unwrap().id, a.id);
    assert_eq!(
        s.budget_print_data(e.id).unwrap().profile.company_name,
        "Emisor A"
    );
    let new = Project {
        id: Uuid::new_v4(),
        name: "Obra nueva".into(),
        ..p.clone()
    };
    s.save_project(&new).unwrap();
    assert_eq!(s.project_organization(new.id).unwrap().id, b.id);
    let changed = Project {
        name: "No debe guardarse".into(),
        ..p.clone()
    };
    assert!(s.save_project_for_organization(&changed, b.id).is_err());
    assert_eq!(s.get_project(p.id).unwrap().unwrap().name, p.name);
    assert_eq!(s.default_organization().unwrap().id, b.id);
}
#[test]
fn external_organizations_are_readonly_and_remote_updates_cannot_replace_own_identity() {
    use crate::printing::PrintProfile;
    let (mut s, p, _, _) = fixture();
    let id = Uuid::new_v4();
    let profile = PrintProfile {
        company_name: "Propietario remoto".into(),
        ..Default::default()
    };
    s.apply_external_organization_snapshot(id, "owner-key", 1, "Organización remota", &profile)
        .unwrap();
    let o = s.organization(id).unwrap();
    assert_eq!(o.ownership, "external");
    assert!(!o.is_default);
    assert!(s.save_organization(id, 1, "Editada", &profile).is_err());
    assert!(s.set_default_organization(id).is_err());
    assert!(s
        .save_project_for_organization(
            &Project {
                id: Uuid::new_v4(),
                ..p.clone()
            },
            id
        )
        .is_err());
    assert!(s
        .apply_external_organization_snapshot(id, "another-key", 2, "Intrusa", &profile)
        .is_err());
    assert!(s
        .apply_external_organization_snapshot(id, "owner-key", 1, "Vieja", &profile)
        .is_err());
    s.apply_external_organization_snapshot(
        id,
        "owner-key",
        2,
        "Actualizada por propietario",
        &profile,
    )
    .unwrap();
    assert_eq!(s.organization(id).unwrap().revision, 2);
    let own = s.default_organization().unwrap();
    assert!(s
        .apply_external_organization_snapshot(own.id, "owner-key", 9, "Colisión", &profile)
        .is_err());
}
#[test]
fn schema_nineteen_migration_keeps_legacy_logo_and_project_owner_after_reopening() {
    use crate::printing::PrintProfile;
    let (s, p, _, _) = fixture();
    let path =
        std::env::temp_dir().join(format!("cpobras-org-migration-{}.sqlite", Uuid::new_v4()));
    let profile = PrintProfile {
        company_name: "Emisor anterior".into(),
        logo_png: vec![1, 2, 3, 4],
        ..Default::default()
    };
    s.conn
        .execute(
            "INSERT INTO print_profiles(id,revision,profile_json) VALUES ('default',3,?1)",
            [serde_json::to_string(&profile).unwrap()],
        )
        .unwrap();
    s.conn.execute_batch("DROP TRIGGER new_project_organization; DROP TRIGGER external_company_readonly_update; DROP TRIGGER external_company_readonly_delete; DROP TABLE project_organizations; DROP TABLE organization_preferences; DROP TABLE organizations; DELETE FROM schema_migrations WHERE version=20;").unwrap();
    s.conn
        .backup(rusqlite::DatabaseName::Main, &path, None)
        .unwrap();
    drop(s);
    let mut migrated = LocalStore::open(&path).unwrap();
    let owner = migrated.project_organization(p.id).unwrap();
    assert_eq!(owner.profile, profile);
    let other = migrated.create_organization("Nueva propia").unwrap();
    migrated.set_default_organization(other.id).unwrap();
    drop(migrated);
    let reopened = LocalStore::open(&path).unwrap();
    assert_eq!(reopened.project_organization(p.id).unwrap().id, owner.id);
    assert_eq!(reopened.organization(owner.id).unwrap().profile, profile);
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn one_person_can_be_client_and_supplier_with_shared_data_and_stale_edits_rejected() {
    use crate::persons::PersonInput;
    let mut s = LocalStore::in_memory().unwrap();
    let p = s
        .save_person(
            None,
            0,
            "client",
            &PersonInput {
                name: "Gómez Construcciones".into(),
                cuit: Some("30-12345678-9".into()),
                email: "contacto@example.test".into(),
                ..Default::default()
            },
        )
        .unwrap();
    let both = s.add_person_role(p.id, p.revision, "supplier").unwrap();
    assert_eq!(both.id, p.id);
    assert_eq!(both.role, "both");
    assert_eq!(s.persons("client").unwrap().len(), 1);
    assert_eq!(s.persons("supplier").unwrap().len(), 1);
    assert_eq!(
        s.conn
            .query_row("SELECT COUNT(*) FROM persons", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        s.conn
            .query_row(
                "SELECT type FROM sqlite_master WHERE name='clients'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "view"
    );
    let alias = both.supplier_record_id.unwrap();
    let stale = s.management_record(alias).unwrap().unwrap();
    let mut edited = both.data;
    edited.phone = "1112345678".into();
    edited.name = "Gómez Obras".into();
    let changed = s
        .save_person(Some(p.id), both.revision, "client", &edited)
        .unwrap();
    assert_eq!(changed.role, "both");
    assert_eq!(s.list_clients().unwrap()[0].name, "Gómez Obras");
    assert_eq!(
        s.management_record(alias).unwrap().unwrap().attributes["phone"],
        "1112345678"
    );
    assert!(s.save_management_record(&stale).is_err());
    assert!(s
        .save_person(Some(p.id), p.revision, "client", &edited)
        .is_err());
    let duplicate = PersonInput {
        name: "Otro nombre".into(),
        cuit: Some("30123456789".into()),
        ..Default::default()
    };
    assert!(s.save_person(None, 0, "supplier", &duplicate).is_err());
    let matches = s.similar_persons(&duplicate, None).unwrap();
    assert_eq!(matches[0].person.id, p.id);
    assert_eq!(matches[0].score, 100);
    assert!(s
        .similar_persons(
            &PersonInput {
                name: "Gomez Obra".into(),
                ..Default::default()
            },
            None
        )
        .unwrap()
        .iter()
        .any(|m| m.person.id == p.id));
}
#[test]
fn project_party_selection_is_atomic_and_uses_person_roles() {
    use crate::persons::PersonInput;
    let (mut s, p, _, _) = fixture();
    let supplier = s
        .save_person(
            None,
            0,
            "supplier",
            &PersonInput {
                name: "Proveedor principal".into(),
                ..Default::default()
            },
        )
        .unwrap();
    let owner = s.project_organization(p.id).unwrap();
    s.save_project_parties(&p, owner.id, &[supplier.id])
        .unwrap();
    assert_eq!(s.project_suppliers(p.id).unwrap(), vec![supplier.id]);
    let wrong = Project {
        name: "Cambio inválido".into(),
        client_id: supplier.id,
        ..p.clone()
    };
    assert!(s.save_project_parties(&wrong, owner.id, &[]).is_err());
    assert_eq!(s.get_project(p.id).unwrap().unwrap().name, p.name);
    assert_eq!(s.project_suppliers(p.id).unwrap(), vec![supplier.id]);
    assert!(s
        .save_project_parties(&p, owner.id, &[p.client_id])
        .is_err());
    let both = s
        .add_person_role(supplier.id, supplier.revision, "client")
        .unwrap();
    let valid = Project {
        client_id: both.id,
        ..p
    };
    s.save_project_parties(&valid, owner.id, &[both.id])
        .unwrap();
    assert_eq!(s.get_project(valid.id).unwrap().unwrap().client_id, both.id);
}
#[test]
fn migration_merges_exact_tax_identity_keeps_document_links_and_does_not_merge_similar_names() {
    use crate::persons::PersonInput;
    let (mut s, p, _, _, supplier, _, _) = stock_fixture();
    let client = s.get_client(p.client_id).unwrap().unwrap();
    s.save_client(&Client {
        cuit: Some("30-12345678-9".into()),
        ..client
    })
    .unwrap();
    let mut invoice = operation(p.id, "payable");
    invoice.partner_id = Some(supplier);
    invoice.amount = 10.into();
    invoice.due_date = "2026-11-30".into();
    let saved = s.post_operation(&invoice).unwrap();
    let payload: String = s
        .conn
        .query_row(
            "SELECT payload FROM operation_documents WHERE id=?1",
            [saved.id.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    undo_people_migration_for_fixture(&s.conn);
    s.conn.execute("UPDATE management_records SET name='Proveedor anterior',attributes_json=json_set(attributes_json,'$.cuit','30123456789','$.email','proveedor@example.test') WHERE id=?1",[supplier.to_string()]).unwrap();
    let path = std::env::temp_dir().join(format!(
        "cpobras-person-migration-{}.sqlite",
        Uuid::new_v4()
    ));
    s.conn
        .backup(rusqlite::DatabaseName::Main, &path, None)
        .unwrap();
    drop(s);
    let mut migrated = LocalStore::open(&path).unwrap();
    let person = migrated.person(p.client_id).unwrap().unwrap();
    assert_eq!(person.role, "both");
    assert_eq!(person.data.email, "proveedor@example.test");
    assert_eq!(person.supplier_record_id, Some(supplier));
    assert_eq!(
        migrated.management_record(supplier).unwrap().unwrap().name,
        person.data.name
    );
    assert_eq!(
        migrated
            .conn
            .query_row(
                "SELECT payload FROM operation_documents WHERE id=?1",
                [saved.id.to_string()],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        payload
    );
    assert_eq!(
        migrated.get_project(p.id).unwrap().unwrap().client_id,
        p.client_id
    );
    migrated.verify_integrity().unwrap();
    migrated
        .save_person(
            None,
            0,
            "client",
            &PersonInput {
                name: "Juan Pérez".into(),
                ..Default::default()
            },
        )
        .unwrap();
    migrated
        .save_person(
            None,
            0,
            "supplier",
            &PersonInput {
                name: "Juan Perez".into(),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(migrated.persons("supplier").unwrap().len(), 2);
    drop(migrated);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn legacy_duplicate_clients_and_extended_contacts_migrate_to_one_person() {
    let (s, p, _, _) = fixture();
    undo_people_migration_for_fixture(&s.conn);
    s.conn
        .execute(
            "UPDATE clients SET cuit='30-22222222-2' WHERE id=?1",
            [p.client_id.to_string()],
        )
        .unwrap();
    let duplicate = Uuid::new_v4();
    s.conn
        .execute(
            "INSERT INTO clients(id,name,cuit) VALUES(?1,'Cliente duplicado','30222222222')",
            [duplicate.to_string()],
        )
        .unwrap();
    let second = Uuid::new_v4();
    s.conn
        .execute(
            "INSERT INTO projects(id,name,client_id,currency) VALUES(?1,'Segunda obra',?2,'ARS')",
            params![second.to_string(), duplicate.to_string()],
        )
        .unwrap();
    let profile = Uuid::new_v4();
    s.conn.execute("INSERT INTO management_records(id,kind,name,code,client_id,attributes_json,revision) VALUES(?1,'client_profile','Ficha ampliada','',?2,?3,1)",params![profile.to_string(),duplicate.to_string(),r#"{"email":"cliente@example.test","phone":"1122334455","address":"Domicilio anterior"}"#]).unwrap();
    let path = std::env::temp_dir().join(format!("cpobras-client-merge-{}.sqlite", Uuid::new_v4()));
    s.conn
        .backup(rusqlite::DatabaseName::Main, &path, None)
        .unwrap();
    drop(s);
    let migrated = LocalStore::open(&path).unwrap();
    let a = migrated.get_project(p.id).unwrap().unwrap();
    let b = migrated.get_project(second).unwrap().unwrap();
    assert_eq!(a.client_id, b.client_id);
    let person = migrated.person(a.client_id).unwrap().unwrap();
    assert_eq!(person.data.email, "cliente@example.test");
    assert_eq!(person.data.phone, "1122334455");
    assert_eq!(migrated.list_clients().unwrap().len(), 1);
    assert_eq!(
        migrated
            .management_record(profile)
            .unwrap()
            .unwrap()
            .attributes["email"],
        "cliente@example.test"
    );
    assert!(!migrated
        .conn
        .query_row(
            "SELECT attributes_json FROM management_records WHERE id=?1",
            [profile.to_string()],
            |r| r.get::<_, String>(0)
        )
        .unwrap()
        .contains("cliente@example.test"));
    migrated.verify_integrity().unwrap();
    drop(migrated);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn shared_project_contains_only_its_own_data_and_leaves_the_database_unchanged() {
    let (mut store, project, estimate, _) = fixture();
    let secret_client = Client {
        id: Uuid::new_v4(),
        name: "CONTACTO PRIVADO DE OTRA OBRA".into(),
        cuit: None,
    };
    store.save_client(&secret_client).unwrap();
    let other = Project {
        id: Uuid::new_v4(),
        client_id: secret_client.id,
        name: "OBRA CONFIDENCIAL".into(),
        currency: Currency::Ars,
    };
    store.save_project(&other).unwrap();
    store
        .create_estimate(&Estimate {
            id: Uuid::new_v4(),
            project_id: other.id,
            title: "PRESUPUESTO PRIVADO".into(),
            currency: Currency::Ars,
            issued: false,
        })
        .unwrap();
    let before = store.change_events(0).unwrap().len();
    let document = store
        .shared_project_document(project.id, "2026-11-07")
        .unwrap();
    assert_eq!(document["project"]["id"], project.id.to_string());
    assert_eq!(
        document["budgets"][0]["estimate"]["id"],
        estimate.id.to_string()
    );
    assert_eq!(document["budgets"].as_array().unwrap().len(), 1);
    let text = document.to_string();
    assert!(!text.contains("CONFIDENCIAL"));
    assert!(!text.contains("CONTACTO PRIVADO"));
    assert!(!text.contains("PRESUPUESTO PRIVADO"));
    assert_eq!(before, store.change_events(0).unwrap().len());
    store.verify_integrity().unwrap();
    assert!(store
        .shared_project_document(Uuid::new_v4(), "2026-11-07")
        .is_err());
}

#[test]
fn shared_permissions_remove_secrets_from_secondary_documents_and_keep_the_allowed_budget() {
    use crate::sharing::{restrict_shared_document, SharingPermissions};
    use serde_json::json;
    let data = json!({"version":1,"project":{"name":"Obra visible"},"client":{"id":"c","name":"Comitente","email":"SECRET_CONTACT"},"parties":[{"id":"p","kind":"supplier","name":"Proveedor","attributes":{"phone":"SECRET_PHONE"}}],"suppliers":["SECRET_PROVIDER"],"records":["SECRET_RECORD"],"resources":["SECRET_RESOURCE"],"stock":["SECRET_STOCK"],"planning":{"plan":{"tasks":["SECRET_PLAN"]}},"schedule":"SECRET_SCHEDULE","plan_revisions":["SECRET_HISTORY"],"baselines":["SECRET_BASELINE"],"warehouses":[],"operations":[{"kind":"purchase_order","number":"Orden visible","lines":["SECRET_RESOURCE"]},{"kind":"payment","notes":"SECRET_PAYMENT"},{"kind":"forecast","notes":"SECRET_FORECAST"}],"budgets":[{"estimate":{"title":"Presupuesto visible"},"document":{"lines":[{"description":"Partida visible"}],"sections":[],"assignments":[],"takeoffs":[],"formulas":[],"line_analyses":["SECRET_COMPOSITION"],"rates":{"profit_percent":"SECRET_MARGIN"},"price_definition":"SECRET_PRICE"},"pricing":{"revision":1,"direct":"200","definition":{"rows":["SECRET_PRICE"]},"calculation":{"breakdown":{"total":"242","profit":"SECRET_MARGIN"}}},"totals":{},"resource_prices":{"x":"SECRET_RESOURCE_PRICE"},"print_data":{"document":"SECRET_NESTED_PRINT","client":"SECRET_CONTACT"},"report":{"summaries":["SECRET_ACCOUNTING"],"cash_flow":["SECRET_CASH"],"costs":["SECRET_COST"],"section_results":["SECRET_RESULT"],"quotes":["SECRET_QUOTE"],"needs":["SECRET_RESOURCE"],"production":[],"alerts":["SECRET_FINANCE_ALERT"]}}]});
    let p = SharingPermissions {
        budget: true,
        price: false,
        resources: false,
        operations: true,
        accounting: false,
        planning: false,
        project_data: false,
        ..Default::default()
    };
    let filtered = restrict_shared_document(data.clone(), &p);
    assert!(!filtered.to_string().contains("SECRET"), "{filtered}");
    assert_eq!(
        filtered["budgets"][0]["document"]["lines"][0]["description"],
        "Partida visible"
    );
    assert_eq!(filtered["budgets"][0]["totals"]["total"], "242");
    assert_eq!(filtered["operations"].as_array().unwrap().len(), 1);
    let p = SharingPermissions {
        budget: false,
        price: false,
        resources: false,
        operations: false,
        accounting: true,
        planning: false,
        project_data: false,
        ..Default::default()
    };
    let finance = restrict_shared_document(data, &p);
    assert_eq!(finance["budgets"][0]["document"]["lines"], json!([]));
    assert_eq!(finance["operations"].as_array().unwrap().len(), 2);
    assert!(finance["planning"].is_null());
    let no_access = SharingPermissions {
        accounting: false,
        ..p
    };
    assert!(no_access.validate().is_err());
}

#[test]
fn reopening_an_issued_budget_preserves_prices_then_allows_edits_and_reissue() {
    let (mut s, _, e, line) = fixture();
    s.issue_estimate(e.id).unwrap();
    assert!(s.update_estimate_item(&line).is_err());
    assert!(s
        .conn
        .execute(
            "UPDATE estimates SET status='draft',title='Altered',issued_at=NULL WHERE id=?1",
            [e.id.to_string()]
        )
        .is_err());
    let before = s.export_budget(e.id).unwrap();
    s.reopen_estimate(e.id).unwrap();
    assert!(!s.get_estimate(e.id).unwrap().unwrap().issued);
    assert_eq!(
        serde_json::to_value(before).unwrap(),
        serde_json::to_value(s.export_budget(e.id).unwrap()).unwrap()
    );
    assert!(s.reopen_estimate(e.id).is_err());
    let mut edited = line;
    edited.quantity = Decimal::from(4);
    s.update_estimate_item(&edited).unwrap();
    s.issue_estimate(e.id).unwrap();
    assert!(s.update_estimate_item(&edited).is_err());
}
#[test]
fn saving_an_acu_pattern_copies_unit_composition_without_changing_the_source() {
    use crate::{line_workflows::LineResourceInput, resource_catalog::Resource};
    let (mut s, _, e, line) = fixture();
    let r = Resource {
        id: Uuid::new_v4(),
        code: "R".into(),
        description: "Operario".into(),
        unit: "h".into(),
        kind: cpobras_core::ResourceKind::Labor,
        active: true,
    };
    s.save_resource(&r).unwrap();
    let snapshot = s
        .save_line_resources(
            e.id,
            line.id,
            &[LineResourceInput {
                resource_id: r.id,
                quantity: Decimal::from(3),
                unit_price: Decimal::from(100),
            }],
        )
        .unwrap();
    s.issue_estimate(e.id).unwrap();
    let before = s.estimate_total(e.id).unwrap();
    let pattern = s
        .save_line_as_analysis(e.id, line.id, "ACU-TEST", "Trabajo reutilizable")
        .unwrap();
    assert_ne!(snapshot, pattern.id);
    assert!(!s.is_line_analysis(pattern.id).unwrap());
    assert_eq!(pattern.components[0].quantity_per_unit, Decimal::from(3));
    assert_eq!(pattern.components[0].unit_price, Decimal::from(100));
    assert_eq!(s.list_analyses().unwrap().len(), 1);
    assert_eq!(s.estimate_total(e.id).unwrap(), before);
    assert_eq!(
        s.estimate_items(e.id).unwrap()[0].analysis_id,
        Some(snapshot)
    );
    assert!(s
        .save_line_as_analysis(Uuid::new_v4(), line.id, "BAD", "Bad")
        .is_err());
    assert!(s
        .save_line_as_analysis(e.id, line.id, "", "Automático")
        .unwrap()
        .code
        .starts_with("ACU-"));
}

#[test]
fn automatic_codes_reserve_monotonically_and_skip_existing_identifiers() {
    let (mut s, _, e, line) = fixture();
    assert_eq!(s.automatic_code("analysis").unwrap(), "ACU-0001");
    assert_eq!(s.automatic_code("analysis").unwrap(), "ACU-0002");
    s.conn
        .execute(
            "INSERT INTO automatic_codes(scope,last_value) VALUES('resource',40)",
            [],
        )
        .unwrap();
    assert_eq!(s.automatic_code("resource").unwrap(), "INS-0041");
    assert!(s
        .save_line_as_analysis(e.id, line.id, "", "Sin insumos")
        .is_err());
}
#[test]
fn measured_badge_tracks_applied_quantity_and_manual_changes_clear_it() {
    use crate::takeoffs::TakeoffRow;
    let (mut s, _, e, line) = fixture();
    let row = TakeoffRow {
        id: Uuid::new_v4(),
        estimate_id: e.id,
        line_id: line.id,
        note: "Medición".into(),
        factor: Decimal::ONE,
        length: Decimal::from(3),
        width: Decimal::from(2),
        height: Decimal::ONE,
        sign: 1,
        position: 0,
    };
    s.save_takeoff_row(&row).unwrap();
    assert!(s.measured_lines(e.id).unwrap().is_empty());
    s.apply_takeoff_to_line(e.id, line.id).unwrap();
    assert_eq!(s.measured_lines(e.id).unwrap(), vec![line.id]);
    let copy = s.duplicate_estimate(e.id, "Copia medida").unwrap();
    assert_eq!(s.measured_lines(copy.id).unwrap().len(), 1);
    let json = s.export_budget(e.id).unwrap();
    let imported = s.import_budget(e.project_id, &json).unwrap();
    assert_eq!(s.measured_lines(imported.id).unwrap().len(), 1);
    let applied = s
        .apply_budget_pattern(
            imported.id,
            &crate::budget_patterns::PatternSource {
                estimate_id: Some(e.id),
                template_id: None,
            },
            &crate::budget_patterns::PatternSelection {
                line_ids: vec![line.id],
                section_ids: vec![],
            },
            false,
            None,
        )
        .unwrap();
    assert!(s
        .measured_lines(imported.id)
        .unwrap()
        .contains(&applied.line_ids[0]));
    let mut edited = s.estimate_items(e.id).unwrap().remove(0);
    edited.description = "Misma medición".into();
    s.update_estimate_item(&edited).unwrap();
    assert_eq!(s.measured_lines(e.id).unwrap().len(), 1);
    edited.quantity = Decimal::from(9);
    s.update_estimate_item(&edited).unwrap();
    assert!(s.measured_lines(e.id).unwrap().is_empty());
    s.set_line_formula(
        e.id,
        line.id,
        "largo*ancho",
        &BTreeMap::from([
            ("largo".into(), Decimal::from(4)),
            ("ancho".into(), Decimal::from(2)),
        ]),
    )
    .unwrap();
    assert_eq!(s.measured_lines(e.id).unwrap().len(), 1);
}
#[test]
fn project_files_are_copied_scoped_and_audited_without_blob_contents() {
    let (s, p, _, _) = fixture();
    let bytes = b"%PDF-1.4 test copied document";
    let id = s
        .attach_project_file(p.id, "plano.pdf", "Plano de obra", bytes)
        .unwrap();
    assert_eq!(
        s.project_attachments(p.id).unwrap()[0].bytes,
        bytes.len() as i64
    );
    assert_eq!(s.project_attachment_content(p.id, id).unwrap().1, bytes);
    assert!(s.project_attachment_content(Uuid::new_v4(), id).is_err());
    assert!(s
        .attach_project_file(p.id, "../archivo.pdf", "", bytes)
        .is_err());
    assert!(s.attach_project_file(p.id, "script.sh", "", bytes).is_err());
    assert!(s
        .attach_project_file(p.id, "plano.pdf", "", &vec![0; 20 * 1024 * 1024 + 1])
        .is_err());
    assert!(!serde_json::to_string(&s.change_events(0).unwrap())
        .unwrap()
        .contains("test copied document"));
    s.remove_project_attachment(p.id, id).unwrap();
    assert!(s.project_attachments(p.id).unwrap().is_empty());
}

#[test]
fn pert_presentation_round_trips_with_revisions_baselines_and_legacy_plans() {
    use cpobras_core::planning::PertPresentation;
    let (mut s, p, _, line) = fixture();
    let id = Uuid::new_v4();
    let mut plan = Plan {
        calendar_overrides: None,
        finance: Default::default(),
        segments: BTreeMap::new(),
        calendar: Calendar {
            exceptions: BTreeMap::new(),
            start_date: "2026-11-09".into(),
            nonworking_weekdays: vec![5, 6],
            holidays: vec![],
        },
        presentation: BTreeMap::from([(
            id,
            PertPresentation {
                x: 20.0,
                y: 30.0,
                estimates: Some([1, 2, 6]),
            },
        )]),
        tasks: vec![Task {
            id,
            parent_id: None,
            estimate_line_id: Some(line.id),
            name: "Tarea".into(),
            duration_days: 3,
            predecessors: vec![],
            not_before: None,
            finish_by: None,
            assignments: vec![],
            budget: Decimal::ZERO,
            actual_progress: Decimal::ZERO,
        }],
    };
    plan.calendar.exceptions.insert(
        "2026-11-10".into(),
        cpobras_core::planning::CalendarException {
            description: "Feriado local".into(),
            working: false,
        },
    );
    let saved = s.save_project_plan(p.id, 0, plan, "2026-11-09").unwrap();
    s.create_plan_baseline(p.id, "Antes de mover", "2026-11-09")
        .unwrap();
    let mut moved = saved.plan;
    moved.presentation.get_mut(&id).unwrap().x = 400.0;
    s.save_project_plan(p.id, 1, moved, "2026-11-09").unwrap();
    assert_eq!(
        s.project_plan(p.id).unwrap().unwrap().plan.presentation[&id].x,
        400.0
    );
    assert_eq!(
        s.plan_baselines(p.id).unwrap()[0].plan.presentation[&id].x,
        20.0
    );
    assert_eq!(s.plan_revisions(p.id).unwrap().len(), 2);
    assert_eq!(
        s.plan_baselines(p.id).unwrap()[0].plan.calendar.exceptions["2026-11-10"].description,
        "Feriado local"
    );
    let mut legacy = serde_json::to_value(s.project_plan(p.id).unwrap().unwrap().plan).unwrap();
    legacy.as_object_mut().unwrap().remove("presentation");
    assert!(serde_json::from_value::<Plan>(legacy)
        .unwrap()
        .presentation
        .is_empty());
}

#[test]
fn partial_tasks_allocate_each_budget_line_once_and_preserve_history() {
    use cpobras_core::planning::TaskSegment;
    let (mut s, p, e, line) = fixture();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let task = |id, name: &str| Task {
        id,
        parent_id: None,
        estimate_line_id: Some(line.id),
        name: name.into(),
        duration_days: 2,
        predecessors: vec![],
        not_before: None,
        finish_by: None,
        assignments: vec![],
        budget: Decimal::ZERO,
        actual_progress: Decimal::from(25),
    };
    let mut plan = Plan {
        calendar_overrides: None,
        finance: Default::default(),
        calendar: Calendar {
            exceptions: BTreeMap::new(),
            start_date: "2026-11-09".into(),
            nonworking_weekdays: vec![5, 6],
            holidays: vec![],
        },
        presentation: BTreeMap::new(),
        segments: BTreeMap::from([
            (
                a,
                TaskSegment {
                    group_id: a,
                    percent: Decimal::from(30),
                    base_budget: Decimal::ZERO,
                },
            ),
            (
                b,
                TaskSegment {
                    group_id: a,
                    percent: Decimal::from(70),
                    base_budget: Decimal::ZERO,
                },
            ),
        ]),
        tasks: vec![task(a, "Etapa 1"), task(b, "Etapa 2")],
    };
    let saved = s
        .save_project_plan(p.id, 0, plan.clone(), "2026-11-09")
        .unwrap();
    assert_eq!(
        saved.plan.tasks.iter().map(|t| t.budget).sum::<Decimal>(),
        s.estimate_total(e.id).unwrap()
    );
    assert_eq!(s.estimate_items(e.id).unwrap()[0].quantity, line.quantity);
    let restricted = crate::sharing::restrict_shared_document(
        s.shared_project_document(p.id, "2026-11-09").unwrap(),
        &crate::sharing::SharingPermissions {
            budget: false,
            ..Default::default()
        },
    );
    assert_eq!(
        restricted["planning"]["plan"]["segments"][a.to_string()]["base_budget"],
        "0"
    );
    assert!(s.project_plan(p.id).unwrap().unwrap().plan.segments[&a].base_budget > Decimal::ZERO);
    plan.segments.get_mut(&b).unwrap().percent = Decimal::from(80);
    assert!(s.save_project_plan(p.id, 1, plan, "2026-11-09").is_err());
    assert_eq!(s.project_plan(p.id).unwrap().unwrap().revision, 1);
    assert_eq!(
        s.plan_revisions(p.id).unwrap()[0].plan.segments[&a].percent,
        Decimal::from(30)
    );
}

fn financial_test_plan(line: Uuid) -> Plan {
    Plan {
        calendar_overrides: None,
        finance: cpobras_core::planning::FinanceSettings {
            cut_dates: vec!["2026-11-10".into()],
            collection_delay_days: 30,
            ..Default::default()
        },
        calendar: Calendar {
            start_date: "2026-11-09".into(),
            nonworking_weekdays: vec![5, 6],
            holidays: vec![],
            exceptions: BTreeMap::new(),
        },
        segments: BTreeMap::new(),
        presentation: BTreeMap::new(),
        tasks: vec![Task {
            id: Uuid::new_v4(),
            parent_id: None,
            estimate_line_id: Some(line),
            name: "Trabajo".into(),
            duration_days: 2,
            predecessors: vec![],
            not_before: None,
            finish_by: None,
            assignments: vec![],
            budget: Decimal::ZERO,
            actual_progress: Decimal::ZERO,
        }],
    }
}
#[test]
fn monthly_rentals_reconcile_partial_invoices_payments_and_cash_before_collection() {
    use crate::operations::PriceCostLink;
    use cpobras_core::price_determination::*;
    let (mut s, p, e, l) = fixture();
    let supplier = supplier(&mut s);
    let mut definition = PriceDefinition::from_rates(PricingRates::default());
    for row in &mut definition.rows {
        row.enabled = false;
    }
    let row = &mut definition.rows[0];
    row.enabled = true;
    row.detail_mode = DetailMode::Items;
    let item_id = Uuid::new_v4();
    let row_id = row.id;
    row.items = vec![PriceItem {
        id: item_id,
        parent_id: None,
        group: false,
        description: "Baños químicos".into(),
        unit: "un".into(),
        participation_percent: 100.into(),
        quantity: 2.into(),
        unit_price: 100.into(),
        periodic: Some(PeriodicCost {
            start: "2026-11-01".into(),
            end: "2026-12-31".into(),
            payment_day: 1,
            prorate: true,
        }),
    }];
    s.save_price_definition(e.id, 0, &definition).unwrap();
    s.save_project_plan(p.id, 0, financial_test_plan(l.id), "2026-11-05")
        .unwrap();
    let before = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(before.recurring_costs.len(), 2);
    assert_eq!(before.recurring_costs[0].amount, 200.into());
    assert_eq!(
        before.financial_projection.unwrap().additional_cash,
        600.into()
    );
    let mut bill = operation(p.id, "payable");
    bill.estimate_id = Some(e.id);
    bill.partner_id = Some(supplier);
    bill.amount = 120.into();
    bill.due_date = "2026-11-06".into();
    bill.price_cost = Some(PriceCostLink {
        row_id,
        item_id,
        period_start: "2026-11-01".into(),
    });
    let bill = s.post_operation(&bill).unwrap();
    let mut payment = operation(p.id, "payment");
    payment.reference_id = Some(bill.id);
    payment.partner_id = Some(supplier);
    payment.amount = 60.into();
    s.post_operation(&payment).unwrap();
    let after = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(after.recurring_costs[0].unbilled, 80.into());
    let f = after.financial_projection.unwrap();
    // The paid 60 reduces outstanding debt and also reduces opening cash by 60.
    assert_eq!(f.opening_cash, (-60).into());
    assert_eq!(f.additional_cash, 600.into());
    assert_eq!(f.periods[0].gross, 600.into());
    assert_eq!(f.periods[0].collection_date, "2026-12-10");
    assert_eq!(
        f.events
            .iter()
            .filter(|x| x.kind == "obligation")
            .map(|x| x.expense)
            .sum::<Decimal>(),
        60.into()
    );
    assert!(s
        .post_operation(&{
            let mut bad = operation(p.id, "payable");
            bad.estimate_id = Some(e.id);
            bad.amount = 1.into();
            bad.due_date = "2026-11-06".into();
            bad.price_cost = Some(PriceCostLink {
                row_id,
                item_id: Uuid::new_v4(),
                period_start: "2026-11-01".into(),
            });
            bad
        })
        .is_err());
}
#[test]
fn declared_acopio_reduces_period_purchases_without_creating_a_payment() {
    use cpobras_core::{ResourceKind, ResourcePriceSnapshot, UnitCostAnalysis};
    let (mut s, p, e, mut l, _, resource, warehouse) = stock_fixture();
    let id = Uuid::new_v4();
    s.save_analysis(&UnitCostAnalysis {
        id,
        code: "F".into(),
        description: "Materiales".into(),
        unit: "m".into(),
        components: vec![ResourcePriceSnapshot {
            resource_id: resource,
            description: "Material".into(),
            kind: ResourceKind::Material,
            quantity_per_unit: 5.into(),
            unit_price: 10.into(),
        }],
    })
    .unwrap();
    // Store a budget-owned composition through the same API as the editor.
    s.save_line_resources(
        e.id,
        l.id,
        &[crate::line_workflows::LineResourceInput {
            resource_id: resource,
            quantity: 5.into(),
            unit_price: 10.into(),
        }],
    )
    .unwrap();
    l = s.estimate_items(e.id).unwrap().remove(0);
    let mut stock = operation(p.id, "stock_opening");
    stock.number = String::new();
    stock.warehouse_id = Some(warehouse);
    stock.lines = vec![material_row(resource, l.id, 6, 10)];
    let posted = s.post_operation(&stock).unwrap();
    assert_eq!(posted.number, "ACO-0001");
    s.save_project_plan(p.id, 0, financial_test_plan(l.id), "2026-11-05")
        .unwrap();
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(report.summaries[0].paid, Decimal::ZERO);
    let f = report.financial_projection.unwrap();
    let m = &f.periods[0].materials[0];
    assert_eq!(m.required, 10.into());
    assert_eq!(m.from_stock, 6.into());
    assert_eq!(m.purchase, 4.into());
    assert_eq!(m.cost, 40.into());
    assert_eq!(f.additional_cash, 40.into());
    let mut updated = s.project_plan(p.id).unwrap().unwrap().plan;
    // Only issued certification can change official progress.
    s.issue_estimate(e.id).unwrap();
    let mut cert = operation(p.id, "certificate");
    cert.estimate_id = Some(e.id);
    cert.date = "2026-11-09".into();
    cert.period_start = "2026-11-01".into();
    cert.period_end = "2026-11-09".into();
    cert.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Avance".into(),
        quantity: l.quantity / Decimal::from(2),
        ..Default::default()
    }];
    s.post_operation(&cert).unwrap();
    updated.tasks[0].actual_progress = 50.into();
    s.save_project_plan(p.id, 1, updated, "2026-11-09").unwrap();
    let f = s
        .operations_report(p.id, Some(e.id), "2026-11-09")
        .unwrap()
        .financial_projection
        .unwrap();
    assert_eq!(f.periods[0].materials[0].required, 5.into());
    assert_eq!(f.periods[0].materials[0].purchase, Decimal::ZERO);
    assert_eq!(f.additional_cash, Decimal::ZERO);
}
#[test]
fn crew_friday_payments_cap_advance_recovery_and_replace_liquidated_wages() {
    use crate::line_workflows::LineResourceInput;
    use crate::management::ManagementRecord;
    use cpobras_core::{planning::Assignment, ResourceKind};
    let (mut s, p, e, l, _, resource, _) = stock_fixture();
    let company = Uuid::new_v4();
    let crew = Uuid::new_v4();
    let record = |id, kind: &str, company_id, attributes| ManagementRecord {
        id,
        kind: kind.into(),
        name: kind.into(),
        code: String::new(),
        company_id,
        parent_id: None,
        project_id: None,
        client_id: None,
        attributes,
        revision: 0,
    };
    s.save_management_record(&record(company, "company", None, BTreeMap::new()))
        .unwrap();
    s.save_management_record(&record(
        crew,
        "crew",
        Some(company),
        BTreeMap::from([
            ("daily_rate".into(), "200".into()),
            ("pay_frequency".into(), "weekly".into()),
            ("advance_recovery_percent".into(), "50".into()),
        ]),
    ))
    .unwrap();
    let mut r = s.get_resource(resource).unwrap().unwrap();
    r.kind = ResourceKind::Labor;
    r.unit = "h".into();
    s.save_resource(&r).unwrap();
    s.save_line_resources(
        e.id,
        l.id,
        &[LineResourceInput {
            resource_id: resource,
            quantity: 1.into(),
            unit_price: 100.into(),
        }],
    )
    .unwrap();
    let mut plan = financial_test_plan(l.id);
    plan.tasks[0].assignments = vec![Assignment {
        resource_id: crew,
        units_per_day: 1.into(),
        kind: "crew".into(),
    }];
    s.save_project_plan(p.id, 0, plan, "2026-11-05").unwrap();
    let mut advance = operation(p.id, "advance_paid");
    advance.partner_id = Some(crew);
    advance.amount = 100.into();
    s.post_operation(&advance).unwrap();
    let f = s
        .operations_report(p.id, Some(e.id), "2026-11-05")
        .unwrap()
        .financial_projection
        .unwrap();
    let wage = f.events.iter().find(|x| x.kind == "crew").unwrap();
    assert_eq!(wage.date, "2026-11-13");
    assert_eq!(wage.expense, 300.into());
    let mut bill = operation(p.id, "payable");
    bill.partner_id = Some(crew);
    bill.amount = 200.into();
    bill.advance = 50.into();
    bill.period_start = "2026-11-09".into();
    bill.period_end = "2026-11-09".into();
    bill.due_date = "2026-11-13".into();
    let posted = s.post_operation(&bill).unwrap();
    assert_eq!(posted.amount, 150.into());
    assert_eq!(posted.calculated["gross"], 200.into());
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    assert_eq!(report.summaries[0].advance_paid_balance, 50.into());
    let f = report.financial_projection.unwrap();
    // The advance already left the project fund; recovery only reduces future wages.
    assert_eq!(f.opening_cash, (-100).into());
    assert_eq!(f.additional_cash, 400.into());
    let mut bad = operation(p.id, "payable");
    bad.partner_id = Some(crew);
    bad.amount = 200.into();
    bad.advance = 51.into();
    bad.period_start = "2026-11-10".into();
    bad.period_end = "2026-11-10".into();
    bad.due_date = "2026-11-13".into();
    assert!(s.post_operation(&bad).is_err());
}
#[test]
fn sharing_redacts_financial_assumptions_and_crew_rates_before_transmission() {
    use crate::sharing::{restrict_shared_document, SharingPermissions};
    use serde_json::json;
    let data = json!({"planning":{"plan":{"finance":{"opening_cash":"SECRET_CASH"}}},"baselines":[{"plan":{"finance":{"opening_cash":"SECRET_CASH"}}}],"plan_revisions":[{"plan":{"finance":{"opening_cash":"SECRET_CASH"}}}],"records":[{"kind":"crew","attributes":{"daily_rate":"SECRET_RATE","pay_frequency":"SECRET_FREQUENCY"}}],"budgets":[{"report":{"financial_projection":{"cash":"SECRET_FORECAST"},"recurring_costs":["SECRET_RENTAL"]}}]});
    let p = SharingPermissions {
        accounting: false,
        ..Default::default()
    };
    let filtered = restrict_shared_document(data, &p);
    assert!(!filtered.to_string().contains("SECRET"), "{filtered}");
}
#[test]
fn material_orders_in_another_currency_cover_supply_without_implicit_currency_conversion() {
    let (mut s, p, e, l, partner, resource, _) = stock_fixture();
    s.save_line_resources(
        e.id,
        l.id,
        &[crate::line_workflows::LineResourceInput {
            resource_id: resource,
            quantity: 5.into(),
            unit_price: 10.into(),
        }],
    )
    .unwrap();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(partner);
    order.currency = "USD".into();
    order.due_date = "2026-11-09".into();
    order.lines = vec![material_row(resource, l.id, 10, 10)];
    order.lines[0].line_id = None;
    s.post_operation(&order).unwrap();
    let mut plan = financial_test_plan(l.id);
    plan.finance.opening_cash = 1000.into();
    plan.finance.cash_currency = Some("USD".into());
    s.save_project_plan(p.id, 0, plan, "2026-11-05").unwrap();
    let f = s
        .operations_report(p.id, Some(e.id), "2026-11-05")
        .unwrap()
        .financial_projection
        .unwrap();
    assert_eq!(f.currency, "ARS");
    assert_eq!(f.opening_cash, Decimal::ZERO);
    assert_eq!(f.periods[0].materials[0].pending_order, 10.into());
    assert_eq!(f.periods[0].materials[0].purchase, Decimal::ZERO);
    assert!(!f.warnings.is_empty());
    assert_eq!(f.additional_cash, Decimal::ZERO);
}
#[test]
fn global_calendar_is_inherited_but_work_specific_exceptions_win_without_rewriting_history() {
    use cpobras_core::planning::{CalendarException, CalendarOverrides};
    let (mut s, p, _, l) = fixture();
    let mut plan = financial_test_plan(l.id);
    plan.calendar_overrides = Some(CalendarOverrides::default());
    s.save_project_plan(p.id, 0, plan, "2026-11-05").unwrap();
    s.create_plan_baseline(p.id, "Antes del calendario", "2026-11-05")
        .unwrap();
    let mut calendar = s.general_calendar().unwrap();
    calendar.exceptions.insert(
        "2026-11-09".into(),
        CalendarException {
            description: "Feriado de prueba".into(),
            working: false,
        },
    );
    s.save_general_calendar(&calendar).unwrap();
    let inherited = s.project_plan(p.id).unwrap().unwrap();
    assert_eq!(
        inherited.plan.schedule("2026-11-05").unwrap().tasks[0].start,
        "2026-11-10"
    );
    let mut specific = inherited.plan;
    specific
        .calendar_overrides
        .as_mut()
        .unwrap()
        .exceptions
        .insert(
            "2026-11-09".into(),
            CalendarException {
                description: "Contratista trabaja".into(),
                working: true,
            },
        );
    let saved = s
        .save_project_plan(p.id, 1, specific, "2026-11-05")
        .unwrap();
    assert_eq!(
        saved.plan.schedule("2026-11-05").unwrap().tasks[0].start,
        "2026-11-09"
    );
    assert!(saved.plan.calendar.exceptions["2026-11-09"]
        .description
        .contains("Feriado de prueba"));
    assert!(s.plan_baselines(p.id).unwrap()[0]
        .plan
        .calendar
        .exceptions
        .is_empty());
    assert!(s.save_general_calendar(&calendar).is_err());
}
#[test]
fn provisional_certificates_freeze_indices_and_extras_and_settle_positive_and_negative_differences_once(
) {
    use crate::adjustments::CertificateExtra;
    use cpobras_core::adjustments::{AdjustmentAgreement, IndexPoint, IndexWeight};
    let (mut s, p, e, l) = fixture();
    let agreement = AdjustmentAgreement {
        base_month: "2026-09".into(),
        lag_months: 0,
        weights: vec![IndexWeight {
            base_month: None,
            series: "CAC".into(),
            weight: Decimal::ONE,
        }],
    };
    s.save_adjustment_agreement(e.id, 0, Some(agreement.clone()))
        .unwrap();
    let copy = s.duplicate_estimate(e.id, "Copia con acuerdo").unwrap();
    assert_eq!(
        s.adjustment_agreement(copy.id)
            .unwrap()
            .definition
            .unwrap()
            .base_month,
        "2026-09"
    );
    let point = |period: &str, value: i64, published: &str| IndexPoint {
        id: Uuid::new_v4(),
        series: "CAC".into(),
        period: period.into(),
        value: value.into(),
        publication_date: published.into(),
        source: "https://example.org/indice".into(),
    };
    s.save_index_point(&point("2026-09", 100, "2026-10-01"))
        .unwrap();
    s.save_index_point(&point("2026-10", 110, "2026-11-01"))
        .unwrap();
    s.issue_estimate(e.id).unwrap();
    assert!(s.save_adjustment_agreement(e.id, 1, None).is_err());
    let mut cert = operation(p.id, "certificate");
    cert.date = "2026-11-05".into();
    cert.estimate_id = Some(e.id);
    cert.period_start = "2026-11-01".into();
    cert.period_end = "2026-11-05".into();
    cert.retention_percent = 5.into();
    cert.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: "Trabajo".into(),
        quantity: Decimal::ONE,
        ..Default::default()
    }];
    let extra = |amount: i64, adjustable, retention| CertificateExtra {
        id: Uuid::new_v4(),
        description: "Movilización".into(),
        reason: "Pedido extraordinario".into(),
        authorization: "Orden del comitente 12".into(),
        amount: amount.into(),
        adjustable,
        retention,
        recover_advance: false,
    };
    cert.extras = vec![extra(50, false, false), extra(20, true, true)];
    let first = s.post_operation(&cert).unwrap();
    assert!(first.index_snapshot.as_ref().unwrap().provisional);
    assert_eq!(first.calculated["gross"], 182.into());
    assert_eq!(first.calculated["pending_base"], 100.into());
    assert_eq!(first.calculated["pending"], 110.into());
    assert_eq!(first.amount, "175.4".parse().unwrap());
    assert!(s
        .pending_adjustment_differences(p.id, "2026-11-05")
        .unwrap()
        .is_empty());
    s.save_index_point(&point("2026-11", 120, "2026-11-06"))
        .unwrap();
    assert!(s
        .pending_adjustment_differences(p.id, "2026-11-05")
        .unwrap()
        .is_empty());
    let pending = s
        .pending_adjustment_differences(p.id, "2026-11-06")
        .unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].delta, 12.into());
    assert_eq!(pending[0].retention_delta, "0.6".parse().unwrap());
    let mut second = cert.clone();
    second.id = Uuid::new_v4();
    second.number = "CERT-2".into();
    second.date = "2026-11-06".into();
    second.period_start = "2026-11-06".into();
    second.period_end = "2026-11-06".into();
    second.extras.clear();
    second.lines[0].quantity = "0.5".parse().unwrap();
    second.reconcile_ids = vec![first.id];
    let posted = s.post_operation(&second).unwrap();
    assert_eq!(posted.calculated["gross"], 72.into());
    assert_eq!(posted.reconciliations[0].delta, 12.into());
    assert!(s
        .pending_adjustment_differences(p.id, "2026-11-06")
        .unwrap()
        .is_empty());
    let mut repeated = second.clone();
    repeated.id = Uuid::new_v4();
    repeated.number = "CERT-3".into();
    repeated.date = "2026-11-07".into();
    repeated.period_start = "2026-11-07".into();
    repeated.period_end = "2026-11-07".into();
    repeated.lines[0].quantity = "0.25".parse().unwrap();
    assert!(s.post_operation(&repeated).is_err());
    s.save_index_point(&point("2026-11", 115, "2026-11-07"))
        .unwrap();
    let pending = s
        .pending_adjustment_differences(p.id, "2026-11-07")
        .unwrap();
    assert_eq!(
        pending
            .iter()
            .find(|d| d.source_id == first.id)
            .unwrap()
            .delta,
        Decimal::from(-6)
    );
    let third = s.post_operation(&repeated).unwrap();
    assert_eq!(third.calculated["gross"], "22.75".parse().unwrap());
    assert_eq!(third.reconciliations[0].delta, Decimal::from(-6));
    let original = s
        .operation_documents(Some(p.id))
        .unwrap()
        .into_iter()
        .find(|d| d.id == first.id)
        .unwrap();
    assert_eq!(
        original.index_snapshot.unwrap().factor,
        "1.1".parse().unwrap()
    );
    assert_eq!(original.amount, first.amount);
    let report = s.operations_report(p.id, Some(e.id), "2026-11-07").unwrap();
    assert_eq!(
        report
            .costs
            .iter()
            .map(|r| r.certified_income)
            .sum::<Decimal>(),
        "276.75".parse().unwrap()
    );
    s.verify_integrity().unwrap();
}
#[test]
fn shared_documents_redact_index_agreements_publications_and_certificate_extras_without_permission()
{
    use crate::sharing::{restrict_shared_document, SharingPermissions};
    use serde_json::json;
    let data = json!({"planning":null,"operations":[{"kind":"certificate","index_snapshot":{"source":"SECRET_PUBLICATION"},"extras":[{"authorization":"SECRET_EXTRA"}],"reconciliations":[{"snapshot":"SECRET_DIFFERENCE"}],"reconcile_ids":[]}],"budgets":[{"document":{"lines":[],"adjustment_agreement":{"series":"SECRET_AGREEMENT"}},"adjustment_agreement":{"definition":"SECRET_AGREEMENT"},"certification_overview":["SECRET_OVERVIEW"],"report":{"financial_projection":{"source":"SECRET_PROJECTION"}}}]});
    let filtered = restrict_shared_document(
        data.clone(),
        &SharingPermissions {
            price: false,
            accounting: false,
            ..Default::default()
        },
    );
    assert!(!filtered.to_string().contains("SECRET"), "{filtered}");
    let allowed = restrict_shared_document(data, &SharingPermissions::default());
    assert!(allowed.to_string().contains("SECRET_PUBLICATION"));
    assert!(allowed.to_string().contains("SECRET_AGREEMENT"));
}

#[test]
fn certificate_drafts_preliminary_emission_and_official_progress_are_separate() {
    let (mut s, p, e, l) = fixture();
    let mut second = l.clone();
    second.id = Uuid::new_v4();
    second.position = 1;
    second.description = "Sin avance".into();
    s.add_estimate_item(&second).unwrap();
    let mut plan = financial_test_plan(l.id);
    plan.tasks[0].actual_progress = 90.into();
    s.save_project_plan(p.id, 0, plan, "2026-11-05").unwrap();
    assert_eq!(
        s.project_plan(p.id).unwrap().unwrap().plan.tasks[0].actual_progress,
        Decimal::ZERO
    );
    s.issue_estimate(e.id).unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-05")
        .unwrap();
    assert_eq!(
        d.id,
        s.open_certificate_draft(p.id, e.id, None, "2026-11-06", "2026-11-10")
            .unwrap()
            .id
    );
    d.operation.date = "2026-11-05".into();
    d.progress
        .iter_mut()
        .find(|r| r.line_id == l.id)
        .unwrap()
        .accumulated_percent = 50.into();
    let stale = d.clone();
    let d = s.save_certificate_draft(&d).unwrap();
    assert!(s.save_certificate_draft(&stale).is_err());
    let preview = s.preview_certificate_draft(d.id).unwrap();
    assert!(preview.preliminary);
    assert_eq!(preview.rows.len(), 2);
    assert_eq!(preview.operation.amount, 100.into());
    assert_eq!(s.operation_documents(Some(p.id)).unwrap().len(), 0);
    assert_eq!(
        s.project_plan(p.id).unwrap().unwrap().plan.tasks[0].actual_progress,
        Decimal::ZERO
    );
    let issued = s
        .issue_certificate_draft(d.id, d.revision, "2026-11-05")
        .unwrap();
    assert!(!issued.number.is_empty());
    assert!(s
        .issue_certificate_draft(d.id, d.revision, "2026-11-05")
        .is_err());
    assert!(s.save_certificate_draft(&d).is_err());
    assert_eq!(
        s.project_plan(p.id).unwrap().unwrap().plan.tasks[0].actual_progress,
        50.into()
    );
    let frozen = s.issued_certificate_sheet(issued.id).unwrap();
    assert!(!frozen.preliminary);
    assert_eq!(frozen.rows[1].current, Decimal::ZERO);
    assert!(s
        .conn
        .execute("UPDATE certificate_sheets SET sheet_json='{}'", [])
        .is_err());
    let next = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-06", "2026-11-10")
        .unwrap();
    assert_ne!(next.id, d.id);
    assert_eq!(
        next.progress
            .iter()
            .find(|r| r.line_id == l.id)
            .unwrap()
            .accumulated_percent,
        50.into()
    );
}
#[test]
fn quotation_roundtrip_uses_stable_ids_partial_prices_and_never_reprices_budget() {
    use crate::quotation_workflow::*;
    let (mut s, p, e, l, supplier, res, _) = stock_fixture();
    let req = QuotationRequest {
        id: Uuid::new_v4(),
        project_id: p.id,
        estimate_id: None,
        kind: "material".into(),
        title: "Corralón".into(),
        number: String::new(),
        date: "2026-11-05".into(),
        currency: "ARS".into(),
        partner_id: None,
        scope: "Provisión".into(),
        delivery: "Obra".into(),
        payment: "A acordar".into(),
        validity: "15 días".into(),
        taxes: "Sin IVA".into(),
        items: vec![RequestItem {
            id: Uuid::new_v4(),
            source_id: res,
            code: "No confiar".into(),
            description: "No confiar".into(),
            unit: "kg".into(),
            quantity: 3.into(),
        }],
        profile: serde_json::json!({}),
        project_name: String::new(),
    };
    let request = s.create_quotation_request(&req).unwrap();
    assert_eq!(request.items[0].description, "Material");
    assert!(!request.number.is_empty());
    assert_eq!(s.quotation_requests(p.id).unwrap().len(), 1);
    let price = QuotedPrice {
        row_id: request.items[0].id,
        unit_price: Some(7.into()),
        notes: "Entrega incluida".into(),
    };
    let count = s.operation_documents(Some(p.id)).unwrap().len();
    let preview = s
        .preview_quotation_import(
            request.id,
            supplier,
            &[price.clone()],
            Uuid::new_v4(),
            "2026-11-05",
            "",
        )
        .unwrap();
    assert_eq!(preview.amount, 21.into());
    assert_eq!(s.operation_documents(Some(p.id)).unwrap().len(), count);
    s.post_operation(&preview).unwrap();
    assert_eq!(
        s.estimate_total(e.id).unwrap(),
        l.quantity * l.unit_cost_snapshot
    );
    let mut wrong = price;
    wrong.row_id = Uuid::new_v4();
    assert!(s
        .preview_quotation_import(
            request.id,
            supplier,
            &[wrong],
            Uuid::new_v4(),
            "2026-11-05",
            ""
        )
        .is_err());
}
#[test]
fn approved_contractor_work_is_consumed_once_on_client_emission_and_cost_once() {
    use crate::construction_workflow::ContractTerms;
    let (mut s, p, e, l) = fixture();
    let partner = supplier(&mut s);
    s.issue_estimate(e.id).unwrap();
    let mut c = operation(p.id, "subcontract");
    c.estimate_id = Some(e.id);
    c.partner_id = Some(partner);
    c.contract_terms = Some(ContractTerms::default());
    c.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: l.description.clone(),
        quantity: 2.into(),
        unit_price: 40.into(),
        ..Default::default()
    }];
    let c = s.post_operation(&c).unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, Some(c.id), "2026-11-01", "2026-11-05")
        .unwrap();
    d.progress[0].accumulated_percent = 50.into();
    d.operation.date = "2026-11-05".into();
    let d = s.save_certificate_draft(&d).unwrap();
    let sub = s
        .issue_certificate_draft(d.id, d.revision, "2026-11-05")
        .unwrap();
    assert_eq!(sub.amount, 40.into());
    assert_eq!(
        s.available_progress(p.id, e.id).unwrap()[0].quantity,
        1.into()
    );
    assert_eq!(
        s.operations_report(p.id, Some(e.id), "2026-11-05")
            .unwrap()
            .summaries[0]
            .accrued,
        40.into()
    );
    let mut client = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-05")
        .unwrap();
    client.progress[0].accumulated_percent = 50.into();
    client.operation.date = "2026-11-05".into();
    let client = s.save_certificate_draft(&client).unwrap();
    assert_eq!(client.operation.progress_sources[0].source_id, sub.id);
    assert_eq!(s.available_progress(p.id, e.id).unwrap().len(), 1);
    s.preview_certificate_draft(client.id).unwrap();
    assert_eq!(s.available_progress(p.id, e.id).unwrap().len(), 1);
    let issued = s
        .issue_certificate_draft(client.id, client.revision, "2026-11-05")
        .unwrap();
    assert_eq!(issued.amount, 100.into());
    assert!(s.available_progress(p.id, e.id).unwrap().is_empty());
    assert_eq!(
        s.operations_report(p.id, Some(e.id), "2026-11-05")
            .unwrap()
            .summaries[0]
            .accrued,
        40.into()
    );
}

#[test]
fn advance_is_recovered_before_index_and_new_terms_survive_exchange() {
    use crate::construction_workflow::CertificateTerms;
    use cpobras_core::adjustments::{AdjustmentAgreement, IndexPoint, IndexWeight};
    let (mut s, p, e, l) = fixture();
    let terms = CertificateTerms {
        advance_recovery_percent: 20.into(),
        retention_percent: Decimal::ZERO,
        collection_delay_days: 3,
    };
    s.save_adjustment_agreement_with_terms(
        e.id,
        0,
        Some(AdjustmentAgreement {
            base_month: "2026-09".into(),
            lag_months: 0,
            weights: vec![IndexWeight {
                base_month: None,
                series: "CAC".into(),
                weight: Decimal::ONE,
            }],
        }),
        Some(terms),
    )
    .unwrap();
    for (month, value) in [("2026-09", 100), ("2026-10", 150)] {
        s.save_index_point(&IndexPoint {
            id: Uuid::new_v4(),
            series: "CAC".into(),
            period: month.into(),
            value: value.into(),
            publication_date: format!("{month}-28"),
            source: "https://example.test/cac".into(),
        })
        .unwrap();
    }
    let exported = s.export_budget(e.id).unwrap();
    assert_eq!(
        exported.certificate_terms.unwrap().advance_recovery_percent,
        20.into()
    );
    let copied = s.duplicate_estimate(e.id, "Mismo acuerdo").unwrap();
    assert_eq!(
        s.adjustment_agreement(copied.id)
            .unwrap()
            .terms
            .advance_recovery_percent,
        20.into()
    );
    s.issue_estimate(e.id).unwrap();
    let mut adv = operation(p.id, "advance_received");
    adv.amount = 100.into();
    adv.estimate_id = Some(e.id);
    s.post_operation(&adv).unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-05")
        .unwrap();
    d.progress[0].accumulated_percent = 50.into();
    d.operation.date = "2026-11-05".into();
    let d = s.save_certificate_draft(&d).unwrap();
    let preview = s.preview_certificate_draft(d.id).unwrap();
    let o = s
        .issue_certificate_draft(d.id, d.revision, "2026-11-05")
        .unwrap();
    assert_eq!(o.advance, 20.into());
    assert_eq!(o.calculated["base_work"], 100.into());
    assert_eq!(o.calculated["adjustable_base"], 80.into());
    assert_eq!(o.amount, 120.into());
    assert_eq!(preview.operation.amount, o.amount);
    assert_eq!(o.due_date, "2026-11-08");
    assert_eq!(
        s.issued_certificate_sheet(o.id).unwrap().rows[0].quantity,
        l.quantity
    );
}
#[test]
fn fixed_weekly_contract_certificate_accepts_no_physical_progress_and_does_not_double_bill() {
    use crate::construction_workflow::ContractTerms;
    let (mut s, p, e, _) = fixture();
    let partner = supplier(&mut s);
    s.issue_estimate(e.id).unwrap();
    let mut contract = operation(p.id, "subcontract");
    contract.estimate_id = Some(e.id);
    contract.partner_id = Some(partner);
    contract.contract_terms = Some(ContractTerms {
        method: "fixed".into(),
        frequency: "weekly".into(),
        rate: 100.into(),
        ceiling: 400.into(),
        start: "2026-11-01".into(),
        end: "2026-11-30".into(),
        scope: "Apoyo de obra".into(),
        contributes_progress: false,
        ..Default::default()
    });
    // No physical rows are required for a support-only fixed contract.
    let contract = s.post_operation(&contract).unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, Some(contract.id), "2026-11-02", "2026-11-06")
        .unwrap();
    d.operation.date = "2026-11-06".into();
    let d = s.save_certificate_draft(&d).unwrap();
    let o = s
        .issue_certificate_draft(d.id, d.revision, "2026-11-06")
        .unwrap();
    assert_eq!(o.amount, 100.into());
    assert_eq!(o.due_date, "2026-11-06");
    assert!(s.available_progress(p.id, e.id).unwrap().is_empty());
    assert_eq!(
        s.operations_report(p.id, Some(e.id), "2026-11-06")
            .unwrap()
            .summaries[0]
            .accrued,
        100.into()
    );
    let mut duplicate = o;
    duplicate.id = Uuid::new_v4();
    duplicate.number = "OTHER".into();
    assert!(s.post_operation(&duplicate).is_err());
}

#[test]
fn planning_observer_keeps_cut_dates_but_never_receives_certificate_terms() {
    use crate::sharing::{restrict_shared_document, SharingPermissions};
    use serde_json::json;
    let p = SharingPermissions {
        accounting: false,
        ..Default::default()
    };
    let value = restrict_shared_document(
        json!({"planning":{"plan":{"finance":{"cut_dates":["2026-11-20"],"opening_cash":"SECRET"}}},"budgets":[{"document":{"certificate_terms":{"advance_recovery_percent":"SECRET"}},"adjustment_agreement":{"terms":{"advance_recovery_percent":"SECRET"},"definition":null},"report":{}}]}),
        &p,
    );
    assert!(!value.to_string().contains("SECRET"));
    assert_eq!(
        value["planning"]["plan"]["finance"]["cut_dates"],
        json!(["2026-11-20"])
    );
}

#[test]
fn site_book_uses_server_identity_revisions_confirmation_and_thirty_row_pages() {
    let (mut s, p, _, _) = fixture();
    let first = s.save_site_entry(p.id, None, 0, "Primer registro").unwrap();
    assert_eq!(first.number, "PAR-0001");
    assert!(first.created_at.ends_with('Z'));
    let edit = s
        .save_site_entry(p.id, Some(first.id), first.revision, "Texto corregido")
        .unwrap();
    assert_eq!(edit.created_at, first.created_at);
    assert!(s
        .save_site_entry(p.id, Some(first.id), first.revision, "Obsoleto")
        .is_err());
    let confirmed = s.confirm_site_entry(p.id, edit.id, edit.revision).unwrap();
    assert!(confirmed.confirmed_at.is_some());
    assert!(s
        .save_site_entry(p.id, Some(edit.id), confirmed.revision, "No permitido")
        .is_err());
    assert!(s
        .confirm_site_entry(p.id, edit.id, confirmed.revision)
        .is_err());
    assert!(s
        .conn
        .execute(
            "UPDATE site_book_entries SET description='X' WHERE id=?1",
            [edit.id.to_string()]
        )
        .is_err());
    for n in 0..30 {
        s.save_site_entry(p.id, None, 0, &format!("Borrador {n}"))
            .unwrap();
    }
    let page = s.site_entries(p.id, 0).unwrap();
    assert_eq!(page.entries.len(), 30);
    assert_eq!(page.total, 31);
    assert_eq!(page.entries[0].number, "PAR-0031");
    assert_eq!(s.site_entries(p.id, 1).unwrap().entries[0].id, first.id);
    let print = s
        .print_site_entries(p.id, "", "", "PAR-0001", "PAR-0031")
        .unwrap();
    assert_eq!(print.len(), 1);
    assert_eq!(print[0].description, "Texto corregido");
    let share = s.shared_project_document(p.id, "2026-11-05").unwrap();
    assert_eq!(share["site_book"].as_array().unwrap().len(), 1);
}
fn procurement_fixture() -> (
    LocalStore,
    Project,
    Estimate,
    crate::quotation_workflow::QuotationRequest,
    Uuid,
    Uuid,
) {
    use crate::quotation_workflow::*;
    let (mut s, p, e, _, supplier, res, _) = stock_fixture();
    let r = s
        .create_quotation_request(&QuotationRequest {
            id: Uuid::new_v4(),
            project_id: p.id,
            estimate_id: None,
            kind: "material".into(),
            title: "Corralón".into(),
            number: String::new(),
            date: "2026-11-05".into(),
            currency: "ARS".into(),
            partner_id: None,
            scope: "Materiales".into(),
            delivery: String::new(),
            payment: String::new(),
            validity: String::new(),
            taxes: "Sin IVA".into(),
            items: vec![RequestItem {
                id: Uuid::new_v4(),
                source_id: res,
                code: String::new(),
                description: String::new(),
                unit: "kg".into(),
                quantity: 10.into(),
            }],
            profile: serde_json::json!({}),
            project_name: String::new(),
        })
        .unwrap();
    (s, p, e, r, supplier, res)
}
#[test]
fn inline_quotes_awards_partial_receipts_and_payments_keep_independent_balances() {
    use crate::procurement::*;
    use crate::quotation_workflow::QuotedPrice;
    let (mut s, p, e, r, supplier, res) = procurement_fixture();
    let response = s
        .save_quote_response(&QuoteResponse {
            id: Uuid::new_v4(),
            request_id: r.id,
            supplier_id: supplier,
            revision: 0,
            reference: "Oferta A".into(),
            terms: "Contado".into(),
            prices: vec![QuotedPrice {
                row_id: r.items[0].id,
                unit_price: Some(5.into()),
                notes: String::new(),
            }],
        })
        .unwrap();
    let choice = AwardChoice {
        row_id: r.items[0].id,
        response_id: response.id,
        response_revision: response.revision,
        quantity: 6.into(),
    };
    let baseline = s.estimate_total(e.id).unwrap();
    let docs = s
        .award_quotation(r.id, &[choice.clone()], "2026-12-01", None)
        .unwrap();
    let order = &docs[0];
    assert_eq!(order.amount, 30.into());
    assert!(order.number.starts_with("PED-"));
    assert_eq!(s.award_balances(r.id).unwrap()[0].quantity, 4.into());
    assert_eq!(s.estimate_total(e.id).unwrap(), baseline);
    assert!(s
        .award_quotation(r.id, &[choice], "2026-12-01", None)
        .is_err());
    assert_eq!(s.supplier_orders(p.id, "material").unwrap().len(), 1);
    s.receive_material_order(p.id, order.id, &BTreeMap::from([(res, 2.into())]))
        .unwrap();
    let status = s.supplier_orders(p.id, "material").unwrap();
    assert_eq!(status[0].delivery_state, "Parcial");
    assert_eq!(status[0].payment_state, "Pendiente");
    assert_eq!(status[0].lines[0].remaining, 4.into());
    let mut payment = operation(p.id, "payment");
    payment.number = String::new();
    payment.date = "2026-12-01".into();
    payment.reference_id = Some(order.id);
    payment.partner_id = Some(supplier);
    payment.amount = 10.into();
    s.post_operation(&payment).unwrap();
    let status = s.supplier_orders(p.id, "material").unwrap();
    assert_eq!(status[0].payment_state, "Parcial");
    assert_eq!(status[0].pending_payment, 20.into());
    assert_eq!(status[0].delivery_state, "Parcial");
    assert!(s
        .receive_material_order(p.id, order.id, &BTreeMap::from([(res, 5.into())]))
        .is_err());
    s.receive_material_order(p.id, order.id, &BTreeMap::from([(res, 4.into())]))
        .unwrap();
    assert_eq!(
        s.supplier_orders(p.id, "material").unwrap()[0].delivery_state,
        "Completa"
    );
    assert_eq!(
        s.operation_stock("2099-01-01").unwrap()[0].quantity,
        6.into()
    );
}
#[test]
fn quotation_adjudication_rejects_stale_prices_and_rolls_back_all_documents_on_failure() {
    use crate::procurement::*;
    use crate::quotation_workflow::QuotedPrice;
    let (mut s, _, _, r, supplier, _) = procurement_fixture();
    let input = QuoteResponse {
        id: Uuid::new_v4(),
        request_id: r.id,
        supplier_id: supplier,
        revision: 0,
        reference: String::new(),
        terms: String::new(),
        prices: vec![QuotedPrice {
            row_id: r.items[0].id,
            unit_price: Some(5.into()),
            notes: String::new(),
        }],
    };
    let one = s.save_quote_response(&input).unwrap();
    assert!(s.save_quote_response(&input).is_err());
    let mut edit = one.clone();
    edit.prices[0].unit_price = Some(9.into());
    s.save_quote_response(&edit).unwrap();
    let count = s.operation_documents(None).unwrap().len();
    assert!(s
        .award_quotation(
            r.id,
            &[AwardChoice {
                row_id: r.items[0].id,
                response_id: one.id,
                response_revision: one.revision,
                quantity: 10.into()
            }],
            "2026-12-01",
            None
        )
        .is_err());
    assert_eq!(s.operation_documents(None).unwrap().len(), count);
    assert_eq!(s.award_balances(r.id).unwrap()[0].quantity, 10.into());
    let pdf = s
        .attach_quote_file(one.id, "Oferta.pdf", b"%PDF-1.4\nexample")
        .unwrap();
    assert_eq!(s.quote_files(r.id).unwrap().len(), 1);
    assert!(s.quote_file_content(Uuid::new_v4(), pdf).is_err());
    assert!(s.attach_quote_file(one.id, "bad.exe", b"%PDF-1.4").is_err());
    assert!(s
        .attach_quote_file(one.id, "bad.png", b"not a PNG")
        .is_err());
}

#[test]
fn scheduled_client_certificate_only_opens_the_next_cut_and_reuses_open_draft() {
    let (mut s, p, e, _) = fixture();
    let mut plan = financial_test_plan(Uuid::new_v4());
    plan.tasks.clear();
    plan.finance.cut_dates = vec!["2026-11-10".into(), "2026-11-20".into()];
    s.save_project_plan(p.id, 0, plan, "2026-11-05").unwrap();
    let d = s.open_next_client_certificate(p.id, e.id).unwrap();
    assert_eq!(d.operation.period_end, "2026-11-10");
    assert_eq!(s.open_next_client_certificate(p.id, e.id).unwrap().id, d.id);
    let mut changed = d.clone();
    changed.operation.period_end = "2026-11-20".into();
    assert!(s.save_certificate_draft(&changed).is_err());
}
#[test]
fn a_multi_contractor_award_is_atomic_when_a_later_contract_exceeds_physical_capacity() {
    use crate::construction_workflow::ContractTerms;
    use crate::procurement::*;
    use crate::quotation_workflow::*;
    let (mut s, p, e, l) = fixture();
    let one = supplier(&mut s);
    let two = Uuid::new_v4();
    s.save_management_record(&crate::management::ManagementRecord {
        id: two,
        kind: "supplier".into(),
        name: "Otro proveedor".into(),
        code: String::new(),
        project_id: None,
        company_id: None,
        parent_id: None,
        client_id: None,
        attributes: BTreeMap::new(),
        revision: 0,
    })
    .unwrap();
    let mut existing = operation(p.id, "subcontract");
    existing.partner_id = Some(one);
    existing.estimate_id = Some(e.id);
    existing.contract_terms = Some(ContractTerms::default());
    existing.lines = vec![crate::operations::OperationLine {
        line_id: Some(l.id),
        description: l.description.clone(),
        quantity: 1.into(),
        unit_price: 2.into(),
        ..Default::default()
    }];
    s.post_operation(&existing).unwrap();
    let request = s
        .create_quotation_request(&QuotationRequest {
            id: Uuid::new_v4(),
            project_id: p.id,
            estimate_id: Some(e.id),
            kind: "work".into(),
            title: "Trabajo".into(),
            number: String::new(),
            date: "2026-11-05".into(),
            currency: "ARS".into(),
            partner_id: None,
            scope: "Mano de obra".into(),
            delivery: String::new(),
            payment: String::new(),
            validity: String::new(),
            taxes: "Sin IVA".into(),
            items: vec![RequestItem {
                id: Uuid::new_v4(),
                source_id: l.id,
                code: String::new(),
                description: l.description,
                unit: l.unit,
                quantity: 2.into(),
            }],
            profile: serde_json::json!({}),
            project_name: String::new(),
        })
        .unwrap();
    let mut choices = vec![];
    for supplier_id in [one, two] {
        let response = s
            .save_quote_response(&QuoteResponse {
                id: Uuid::new_v4(),
                request_id: request.id,
                supplier_id,
                revision: 0,
                reference: String::new(),
                terms: String::new(),
                prices: vec![QuotedPrice {
                    row_id: request.items[0].id,
                    unit_price: Some(2.into()),
                    notes: String::new(),
                }],
            })
            .unwrap();
        choices.push(AwardChoice {
            row_id: request.items[0].id,
            response_id: response.id,
            response_revision: response.revision,
            quantity: 1.into(),
        });
    }
    let before = s.operation_documents(None).unwrap().len();
    assert!(s
        .award_quotation(
            request.id,
            &choices,
            "2026-12-01",
            Some(ContractTerms::default())
        )
        .is_err());
    assert_eq!(s.operation_documents(None).unwrap().len(), before);
    assert_eq!(s.award_balances(request.id).unwrap()[0].quantity, 2.into());
    assert!(s.conn.is_autocommit());
}

#[test]
fn hidden_project_data_is_not_reintroduced_by_request_profiles_or_frozen_certificates() {
    use crate::sharing::{restrict_shared_document, SharingPermissions};
    use serde_json::json;
    let permissions = SharingPermissions {
        project_data: false,
        ..Default::default()
    };
    let data = json!({"quotation_requests":[{"profile":{"address":"SECRET"}}],"operations":[{"kind":"rfq","quotation_request":{"profile":{"address":"SECRET"}}}],"budgets":[{"certificate_sheets":[{"profile":{"address":"SECRET"}}],"report":{}}]});
    let shared = restrict_shared_document(data, &permissions);
    assert!(!shared.to_string().contains("SECRET"));
}

#[test]
fn editing_requests_preserves_prices_and_issued_orders_and_allows_new_materials() {
    use crate::procurement::AwardChoice;
    use crate::quotation_workflow::RequestItem;
    let (mut s, p, _, r, supplier, _) = procurement_fixture();
    let mut response = s.add_quote_supplier(r.id, supplier).unwrap();
    response.prices[0].unit_price = Some(5.into());
    let response = s.save_quote_response(&response).unwrap();
    let resource = Uuid::new_v4();
    s.save_resource(&crate::resource_catalog::Resource {
        id: resource,
        code: "NEW-MAT".into(),
        description: "Otro material".into(),
        unit: "kg".into(),
        kind: cpobras_core::ResourceKind::Material,
        active: true,
    })
    .unwrap();
    let mut edit = r.clone();
    edit.title = "Pedido actualizado".into();
    edit.items[0].quantity = 8.into();
    edit.items.push(RequestItem {
        id: Uuid::new_v4(),
        source_id: resource,
        code: String::new(),
        description: String::new(),
        unit: "kg".into(),
        quantity: 3.into(),
    });
    let saved = s.update_quotation_request(&edit, 0).unwrap();
    assert_eq!(saved.revision, 1);
    assert!(s.update_quotation_request(&edit, 0).is_err());
    assert_eq!(
        s.quotation_requests(p.id).unwrap()[0].title,
        "Pedido actualizado"
    );
    let original: String = s
        .conn
        .query_row(
            "SELECT request_json FROM quotation_requests WHERE id=?1",
            [r.id.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<crate::quotation_workflow::QuotationRequest>(&original)
            .unwrap()
            .items[0]
            .quantity,
        10.into()
    );
    let mut response = s.quote_responses(r.id).unwrap().remove(0);
    assert_eq!(response.prices[0].unit_price, Some(5.into()));
    assert_eq!(response.prices[1].unit_price, None);
    assert_eq!(response.revision, 2);
    response.prices[1].unit_price = Some(7.into());
    let response = s.save_quote_response(&response).unwrap();
    let choices = saved
        .request
        .items
        .iter()
        .map(|row| AwardChoice {
            row_id: row.id,
            response_id: response.id,
            response_revision: response.revision,
            quantity: row.quantity,
        })
        .collect::<Vec<_>>();
    let orders = s
        .award_quotation(r.id, &choices, "2099-01-01", None)
        .unwrap();
    assert_eq!(orders[0].amount, 61.into());
    let mut invalid = saved.request.clone();
    invalid.items.remove(0);
    assert!(s.update_quotation_request(&invalid, 1).is_err());
    let mut invalid = saved.request.clone();
    invalid.items[0].quantity = 7.into();
    assert!(s.update_quotation_request(&invalid, 1).is_err());
    assert_eq!(
        s.supplier_orders(p.id, "material").unwrap()[0]
            .document
            .amount,
        61.into()
    );
}
#[test]
fn removing_and_restoring_supplier_columns_preserves_awards_attachments_and_prices() {
    use crate::procurement::AwardChoice;
    let (mut s, p, _, r, supplier, _) = procurement_fixture();
    let mut response = s.add_quote_supplier(r.id, supplier).unwrap();
    response.prices[0].unit_price = Some(5.into());
    let response = s.save_quote_response(&response).unwrap();
    s.attach_quote_file(response.id, "Oferta.pdf", b"%PDF-1.4\nexample")
        .unwrap();
    let orders = s
        .award_quotation(
            r.id,
            &[AwardChoice {
                row_id: r.items[0].id,
                response_id: response.id,
                response_revision: response.revision,
                quantity: 2.into(),
            }],
            "2099-01-01",
            None,
        )
        .unwrap();
    s.hide_quote_response(r.id, response.id, response.revision)
        .unwrap();
    assert!(s.quote_responses(r.id).unwrap().is_empty());
    assert!(s.save_quote_response(&response).is_err());
    assert_eq!(
        s.supplier_orders(p.id, "material").unwrap()[0].document.id,
        orders[0].id
    );
    let restored = s.add_quote_supplier(r.id, supplier).unwrap();
    assert_eq!(restored.id, response.id);
    assert_eq!(restored.prices[0].unit_price, Some(5.into()));
    assert!(restored.revision > response.revision);
    assert_eq!(s.quote_files(r.id).unwrap()[0].name, "Oferta.pdf");
    assert!(s
        .hide_quote_response(r.id, response.id, response.revision)
        .is_err());
}
#[test]
fn schema_thirty_brings_imported_legacy_offers_into_the_comparison() {
    let (mut s, p, _, r, supplier, _) = procurement_fixture();
    let op = s
        .preview_quotation_import(
            r.id,
            supplier,
            &[crate::quotation_workflow::QuotedPrice {
                row_id: r.items[0].id,
                unit_price: Some(4.into()),
                notes: String::new(),
            }],
            Uuid::new_v4(),
            "2099-01-01",
            "",
        )
        .unwrap();
    s.post_operation(&op).unwrap();
    let path = std::env::temp_dir().join(format!("cpobras-schema29-{}.db", Uuid::new_v4()));
    s.backup_to(&path).unwrap();
    let old = rusqlite::Connection::open(&path).unwrap();
    let triggers:Vec<String>=old.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'audit_quotation_responses_%' OR name LIKE 'audit_quotation_request_revisions_%')").unwrap().query_map([],|r|r.get(0)).unwrap().collect::<std::result::Result<_,_>>().unwrap();
    for trigger in triggers {
        old.execute_batch(&format!("DROP TRIGGER {trigger}"))
            .unwrap();
    }
    old.execute_batch("DROP TABLE quotation_request_revisions; ALTER TABLE quotation_responses DROP COLUMN hidden;DELETE FROM schema_migrations WHERE version=30;").unwrap();
    drop(old);
    let reopened = LocalStore::open(&path).unwrap();
    let rows = reopened.quote_responses(r.id).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].prices[0].unit_price, Some(4.into()));
    assert_eq!(reopened.quotation_requests(p.id).unwrap().len(), 1);
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn supplier_stock_partial_delivery_exchange_and_credit_preserve_cash_and_history() {
    use crate::supplier_logistics::{Proof, SupplierMovement};
    let (mut s, p, e, line, supplier, res, _) = stock_fixture();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.estimate_id = Some(e.id);
    order.lines = vec![material_row(res, line.id, 10, 10000)];
    let order = s.post_operation(&order).unwrap();
    let movement = |kind: &str, revision, quantities, amount| SupplierMovement {
        order_id: order.id,
        project_id: p.id,
        kind: kind.into(),
        revision,
        quantities,
        amount,
        reason: "Proveedor sin disponibilidad".into(),
        ..Default::default()
    };
    assert!(s
        .record_supplier_movement(&movement(
            "reserve",
            0,
            BTreeMap::from([(res, 10.into())]),
            0.into()
        ))
        .is_err());
    let mut payment = operation(p.id, "payment");
    payment.reference_id = Some(order.id);
    payment.partner_id = Some(supplier);
    payment.amount = 100000.into();
    let proof = Proof {
        name: "recibo.pdf".into(),
        content: b"%PDF-1.4 prueba".to_vec(),
    };
    let payment = s
        .material_payment_with_proof(&payment, Some(proof.clone()))
        .unwrap();
    assert!(s
        .record_supplier_movement(&movement(
            "request",
            1,
            BTreeMap::from([(res, 4.into())]),
            0.into()
        ))
        .is_err()); // stale
    s.record_supplier_movement(&movement(
        "request",
        0,
        BTreeMap::from([(res, 4.into())]),
        0.into(),
    ))
    .unwrap();
    let receipt = s
        .receive_material_order_with_proof(
            p.id,
            order.id,
            &BTreeMap::from([(res, 4.into())]),
            Some(proof.clone()),
        )
        .unwrap();
    let listed = s.supplier_orders(p.id, "material").unwrap();
    let o = &listed[0];
    assert!(!o.editable);
    assert_eq!(o.lines[0].vendor_stock, Decimal::from(6));
    assert_eq!(o.lines[0].requested, Decimal::ZERO);
    assert_eq!(o.files.len(), 2);
    assert!(o.files.iter().any(|f| f.document_id == payment.id));
    assert!(o.files.iter().any(|f| f.document_id == receipt.id));
    assert!(s
        .record_supplier_movement(&movement(
            "release",
            1,
            BTreeMap::from([(res, 7.into())]),
            60000.into()
        ))
        .is_err());
    s.record_supplier_movement(&movement(
        "release",
        1,
        BTreeMap::from([(res, 6.into())]),
        60000.into(),
    ))
    .unwrap();
    assert_eq!(
        s.supplier_credit(p.id, Some(supplier), "ARS").unwrap(),
        Decimal::from(60000)
    );
    let updated = s.supplier_orders(p.id, "material").unwrap();
    assert_eq!(updated[0].document.amount, Decimal::from(40000));
    assert_eq!(updated[0].paid, Decimal::from(40000));
    assert_eq!(updated[0].lines[0].vendor_stock, Decimal::ZERO);
    let mut replacement = operation(p.id, "purchase_order");
    replacement.partner_id = Some(supplier);
    replacement.lines = vec![material_row(res, line.id, 1, 85000)];
    let replacement = s.post_operation(&replacement).unwrap();
    let mut credit = SupplierMovement {
        order_id: replacement.id,
        project_id: p.id,
        kind: "apply".into(),
        amount: 60000.into(),
        ..Default::default()
    };

    let new = s
        .supplier_orders(p.id, "material")
        .unwrap()
        .into_iter()
        .find(|o| o.document.id == replacement.id)
        .unwrap();
    assert_eq!(new.pending_payment, Decimal::from(25000));
    assert_eq!(new.paid, Decimal::from(60000));
    credit.revision = 1;
    credit.amount = 1.into();
    assert!(s.record_supplier_movement(&credit).is_err());
    let docs = s.operation_documents(Some(p.id)).unwrap();
    assert_eq!(
        docs.iter()
            .filter(|o| o.kind == "payment")
            .map(|o| o.amount)
            .sum::<Decimal>(),
        Decimal::from(100000)
    );
    let raw: String = s
        .conn
        .query_row(
            "SELECT payload FROM operation_documents WHERE id=?1",
            [order.id.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<crate::operations::Operation>(&raw)
            .unwrap()
            .amount,
        Decimal::from(100000)
    );
    assert!(s
        .conn
        .execute("DELETE FROM supplier_movements", [])
        .is_err());
    s.verify_integrity().unwrap();
}

#[test]
fn unpaid_order_edits_are_versioned_and_proof_validation_is_atomic() {
    use crate::supplier_logistics::{Proof, SupplierMovement};
    let (mut s, p, _, line, supplier, res, _) = stock_fixture();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.lines = vec![material_row(res, line.id, 10, 100)];
    let order = s.post_operation(&order).unwrap();
    let mut change = SupplierMovement {
        project_id: p.id,
        order_id: order.id,
        kind: "edit".into(),
        partner_id: Some(supplier),
        lines: vec![material_row(res, line.id, 5, 120)],
        ..Default::default()
    };
    s.record_supplier_movement(&change).unwrap();
    assert_eq!(
        s.supplier_orders(p.id, "material").unwrap()[0]
            .document
            .amount,
        Decimal::from(600)
    );
    assert!(s.record_supplier_movement(&change).is_err());
    let count = s.operation_documents(Some(p.id)).unwrap().len();
    let invalid = Proof {
        name: "../remito.pdf".into(),
        content: b"%PDF-1.4".to_vec(),
    };
    assert!(s
        .receive_material_order_with_proof(
            p.id,
            order.id,
            &BTreeMap::from([(res, 1.into())]),
            Some(invalid)
        )
        .is_err());
    assert_eq!(s.operation_documents(Some(p.id)).unwrap().len(), count);
    s.receive_material_order_with_proof(p.id, order.id, &BTreeMap::from([(res, 1.into())]), None)
        .unwrap();
    change.revision = 1;
    assert!(s.record_supplier_movement(&change).is_err());
}

#[test]
fn supplier_reservation_after_a_receipt_counts_only_later_deliveries_and_cannot_refund_delivered_value(
) {
    use crate::supplier_logistics::SupplierMovement;
    let (mut s, p, _, line, supplier, res, _) = stock_fixture();
    let mut order = operation(p.id, "purchase_order");
    order.partner_id = Some(supplier);
    order.lines = vec![material_row(res, line.id, 10, 100)];
    let order = s.post_operation(&order).unwrap();
    let mut payment = operation(p.id, "payment");
    payment.reference_id = Some(order.id);
    payment.partner_id = Some(supplier);
    payment.amount = 600.into();
    s.post_operation(&payment).unwrap();
    s.receive_material_order(p.id, order.id, &BTreeMap::from([(res, 4.into())]))
        .unwrap();
    let mut m = SupplierMovement {
        order_id: order.id,
        project_id: p.id,
        kind: "reserve".into(),
        quantities: BTreeMap::from([(res, 2.into())]),
        ..Default::default()
    };

    assert_eq!(
        s.supplier_orders(p.id, "material").unwrap()[0].lines[0].vendor_stock,
        Decimal::from(2)
    );
    m.kind = "release".into();
    m.revision = 0;
    m.amount = 300.into();
    m.reason = "Cambio".into();
    assert!(s.record_supplier_movement(&m).is_err()); // Only 200 of the payment backs undelivered goods.
    s.receive_material_order(p.id, order.id, &BTreeMap::from([(res, 1.into())]))
        .unwrap();
    assert_eq!(
        s.supplier_orders(p.id, "material").unwrap()[0].lines[0].vendor_stock,
        Decimal::ONE
    );
}

#[test]
fn full_supplier_credit_replacement_keeps_a_balance_or_only_requires_the_difference() {
    use crate::supplier_logistics::SupplierMovement;
    for replacement_cost in [85000, 120000] {
        let (mut s, p, _, line, supplier, res, _) = stock_fixture();
        let mut old = operation(p.id, "purchase_order");
        old.partner_id = Some(supplier);
        old.lines = vec![material_row(res, line.id, 1, 100000)];
        let old = s.post_operation(&old).unwrap();
        let mut pay = operation(p.id, "payment");
        pay.partner_id = Some(supplier);
        pay.reference_id = Some(old.id);
        pay.amount = 100000.into();
        s.post_operation(&pay).unwrap();
        s.record_supplier_movement(&SupplierMovement {
            project_id: p.id,
            order_id: old.id,
            kind: "release".into(),
            quantities: BTreeMap::from([(res, 1.into())]),
            amount: 100000.into(),
            reason: "Sin disponibilidad".into(),
            ..Default::default()
        })
        .unwrap();
        let mut new = operation(p.id, "purchase_order");
        new.partner_id = Some(supplier);
        new.lines = vec![material_row(res, line.id, 1, replacement_cost)];
        let new = s.post_operation(&new).unwrap();
        let report = s.operations_report(p.id, None, "2026-12-31").unwrap();
        assert_eq!(
            report
                .cash_flow
                .iter()
                .map(|p| p.actual_out)
                .sum::<Decimal>(),
            Decimal::from(100000)
        );
        assert_eq!(
            report
                .cash_flow
                .iter()
                .map(|p| p.planned_out)
                .sum::<Decimal>(),
            Decimal::from((replacement_cost - 100000).max(0))
        );
        let orders = s.supplier_orders(p.id, "material").unwrap();
        let new = orders.iter().find(|o| o.document.id == new.id).unwrap();
        assert_eq!(
            new.pending_payment,
            Decimal::from((replacement_cost - 100000).max(0))
        );
        assert_eq!(
            s.supplier_credit(p.id, Some(supplier), "ARS").unwrap(),
            Decimal::from((100000 - replacement_cost).max(0))
        );
        assert_eq!(
            s.operation_documents(Some(p.id))
                .unwrap()
                .iter()
                .filter(|o| o.kind == "payment")
                .count(),
            1
        );
    }
}

#[test]
fn batch_certificate_preview_does_not_save_and_incomplete_extras_remain_editable() {
    use crate::adjustments::CertificateExtra;
    let (mut s, p, e, line) = fixture();
    s.save_adjustment_agreement_with_terms(
        e.id,
        0,
        None,
        Some(crate::construction_workflow::CertificateTerms {
            advance_recovery_percent: Decimal::from(50),
            retention_percent: Decimal::from(5),
            collection_delay_days: 3,
        }),
    )
    .unwrap();
    s.issue_estimate(e.id).unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-05")
        .unwrap();
    d.progress[0].accumulated_percent = 50.into();
    d.operation.extras.push(CertificateExtra {
        id: Uuid::new_v4(),
        description: String::new(),
        reason: String::new(),
        authorization: String::new(),
        amount: 0.into(),
        adjustable: false,
        retention: false,
        recover_advance: false,
    });
    let sheet = s.calculate_certificate_preview(&d).unwrap();
    assert!(sheet.operation.amount > Decimal::ZERO);
    assert_eq!(sheet.operation.advance_percent, Some(Decimal::from(50)));
    assert_eq!(sheet.operation.retention_percent, Decimal::from(5));
    assert_eq!(s.certificate_drafts(p.id, e.id).unwrap()[0].revision, 0);
    d = s.save_certificate_draft(&d).unwrap();
    assert!(d.operation.extras.is_empty());
    d.operation.extras.push(CertificateExtra {
        id: Uuid::new_v4(),
        description: "Falta completar".into(),
        reason: String::new(),
        authorization: String::new(),
        amount: 100.into(),
        adjustable: false,
        retention: false,
        recover_advance: false,
    });
    let d = s.save_certificate_draft(&d).unwrap();
    assert!(s.preview_certificate_draft(d.id).is_err());
    assert!(s.certificate_editor_sheet(d.id).is_ok());
    let mut reopened = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-05")
        .unwrap();
    assert_eq!(reopened.revision, d.revision);
    reopened.operation.extras.clear();
    let repaired = s.save_certificate_draft(&reopened).unwrap();
    assert!(s.preview_certificate_draft(repaired.id).is_ok());
    assert_eq!(repaired.progress[0].line_id, line.id);
}
#[test]
fn batch_subcontract_extras_are_optional_reason_and_scope_preserves_execution() {
    use crate::adjustments::CertificateExtra;
    let (mut s, p, e, line, supplier, _, _) = stock_fixture();
    s.issue_estimate(e.id).unwrap();
    let mut contract = operation(p.id, "subcontract");
    contract.estimate_id = Some(e.id);
    contract.partner_id = Some(supplier);
    contract.lines = vec![crate::operations::OperationLine {
        line_id: Some(line.id),
        description: "Trabajo".into(),
        quantity: line.quantity,
        unit_price: 100.into(),
        ..Default::default()
    }];
    let contract = s.post_operation(&contract).unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, Some(contract.id), "2026-11-01", "2026-11-05")
        .unwrap();
    d.progress[0].accumulated_percent = 50.into();
    d.operation.extras.push(CertificateExtra {
        id: Uuid::new_v4(),
        description: "Adicional de obra".into(),
        reason: String::new(),
        authorization: String::new(),
        amount: 100.into(),
        adjustable: false,
        retention: false,
        recover_advance: false,
    });
    let d = s.save_certificate_draft(&d).unwrap();
    let preview = s.preview_certificate_draft(d.id).unwrap();
    assert_eq!(preview.operation.calculated["extras"], Decimal::from(100));
    s.issue_certificate_draft(d.id, d.revision, "2026-11-05")
        .unwrap();
    let half = line.quantity / Decimal::from(2);
    assert!(s
        .revise_subcontract(
            p.id,
            contract.id,
            0,
            &BTreeMap::from([(line.id, Decimal::ZERO)]),
            "Abandono"
        )
        .is_err());
    s.revise_subcontract(
        p.id,
        contract.id,
        0,
        &BTreeMap::from([(line.id, half)]),
        "Abandono",
    )
    .unwrap();
    let orders = s.supplier_orders(p.id, "work").unwrap();
    assert_eq!(orders[0].lines[0].quantity, half);
    assert_eq!(orders[0].lines[0].received, half);
    assert!(s
        .operation_documents(Some(p.id))
        .unwrap()
        .iter()
        .any(|o| o.kind == "subcertificate" && o.extras.len() == 1));
}
#[test]
fn batch_planning_only_permissions_remove_money_and_module_payloads() {
    use crate::sharing::{restrict_shared_document, SharingPermissions};
    use serde_json::json;
    let data = json!({"planning":{"plan":{"tasks":[{"budget":"SECRET"}],"finance":{"opening_cash":"SECRET","cut_dates":["2026-11-05"]}}},"schedule":{"Ok":{"budget":"SECRET","curve":["SECRET"]}},"budgets":[],"operations":[],"material_orders":["SECRET"],"work_orders":["SECRET"],"quotation_requests":[],"quotation_responses":[],"site_book":["SECRET"],"stock":[],"warehouses":[],"records":[],"resources":[],"parties":[],"baselines":[],"plan_revisions":[]});
    let p = SharingPermissions {
        budget: false,
        price: false,
        resources: false,
        operations: false,
        accounting: false,
        planning: true,
        project_data: false,
        materials: Some(false),
        subcontracts: Some(false),
        site_book: Some(false),
        certificates: Some(false),
    };
    let filtered = restrict_shared_document(data, &p);
    assert!(!filtered.to_string().contains("SECRET"));
    assert_eq!(
        filtered["planning"]["plan"]["finance"]["cut_dates"],
        json!(["2026-11-05"])
    );
}

#[test]
fn certificate_bugfix_open_rebuilds_saved_progress_without_revising_and_issues_before_planned_cut()
{
    use crate::construction_workflow::CertificateTerms;
    let (mut s, p, e, _) = fixture();
    s.save_adjustment_agreement_with_terms(
        e.id,
        0,
        None,
        Some(CertificateTerms {
            advance_recovery_percent: 50.into(),
            retention_percent: 5.into(),
            collection_delay_days: 3,
        }),
    )
    .unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-13")
        .unwrap();
    d.operation.date = "2026-11-09".into();
    d.progress[0].accumulated_percent = 50.into();
    // Older drafts may contain saved percentages with missing/outdated derived lines.
    s.conn
        .execute(
            "UPDATE certificate_drafts SET payload_json=?1 WHERE id=?2",
            params![serde_json::to_string(&d).unwrap(), d.id.to_string()],
        )
        .unwrap();
    let before = serde_json::to_string(&s.certificate_drafts(p.id, e.id).unwrap()).unwrap();
    let sheet = s.certificate_editor_sheet(d.id).unwrap();
    assert_eq!(sheet.operation.calculated["base_work"], Decimal::from(100));
    assert_eq!(sheet.operation.advance, Decimal::ZERO);
    assert_eq!(sheet.operation.calculated["retention"], Decimal::from(5));
    assert_eq!(sheet.operation.amount, Decimal::from(95));
    assert_eq!(sheet.operation.date, "2026-11-09");
    assert_eq!(
        before,
        serde_json::to_string(&s.certificate_drafts(p.id, e.id).unwrap()).unwrap()
    );
    let saved = s.save_certificate_draft(&d).unwrap();
    assert!(s
        .issue_certificate_draft(d.id, saved.revision, "2026-11-09")
        .is_err());
    s.issue_estimate(e.id).unwrap();
    let emitted = s
        .issue_certificate_draft(d.id, saved.revision, "2026-11-09")
        .unwrap();
    assert_eq!(emitted.amount, sheet.operation.amount);
    assert_eq!(emitted.advance, Decimal::ZERO);
    assert_eq!(emitted.period_end, "2026-11-13");
    assert_eq!(emitted.date, "2026-11-09");
    let docs = s.operation_documents(Some(p.id)).unwrap();
    assert!(!docs.iter().any(|o| o.kind == "advance_received"));
    let report = s.operations_report(p.id, Some(e.id), "2026-11-09").unwrap();
    assert_eq!(report.summaries[0].collected, Decimal::ZERO);
    assert_eq!(report.summaries[0].advance_received_balance, Decimal::ZERO);
    assert!(!report
        .alerts
        .iter()
        .any(|a| a.contains("pendiente de conciliar")));
}

#[test]
fn certificate_bugfix_early_issue_still_rejects_dates_before_period_start() {
    let (mut s, p, e, _) = fixture();
    s.issue_estimate(e.id).unwrap();
    let mut d = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-08", "2026-11-13")
        .unwrap();
    d.operation.date = "2026-11-07".into();
    d.progress[0].accumulated_percent = 50.into();
    let d = s.save_certificate_draft(&d).unwrap();
    assert!(s.preview_certificate_draft(d.id).is_err());
    assert!(s
        .issue_certificate_draft(d.id, d.revision, "2026-11-07")
        .is_err());
    assert!(s
        .operation_documents(Some(p.id))
        .unwrap()
        .iter()
        .all(|o| o.kind != "certificate"));
}

#[test]
fn supplier_delivery_requests_and_direct_receipts_share_the_remaining_capacity() {
    use crate::supplier_logistics::SupplierMovement;
    for receive_first in [false, true] {
        let (mut s, p, _, line, supplier, res, _) = stock_fixture();
        let mut order = operation(p.id, "purchase_order");
        order.partner_id = Some(supplier);
        order.lines = vec![material_row(res, line.id, 10, 100)];
        let order = s.post_operation(&order).unwrap();
        let mut payment = operation(p.id, "payment");
        payment.reference_id = Some(order.id);
        payment.partner_id = Some(supplier);
        payment.amount = 1000.into();
        s.post_operation(&payment).unwrap();
        if receive_first {
            s.receive_material_order(p.id, order.id, &BTreeMap::from([(res, 3.into())]))
                .unwrap();
        }
        let listed = s.supplier_orders(p.id, "material").unwrap();
        let available = listed[0].lines[0].vendor_stock;
        assert_eq!(available, Decimal::from(if receive_first { 7 } else { 10 }));
        let mut request = SupplierMovement {
            order_id: order.id,
            project_id: p.id,
            kind: "request".into(),
            quantities: BTreeMap::from([(res, available + Decimal::ONE)]),
            ..Default::default()
        };
        assert!(s.record_supplier_movement(&request).is_err());
        request.quantities.insert(res, available);
        s.record_supplier_movement(&request).unwrap();
        let listed = s.supplier_orders(p.id, "material").unwrap();
        assert_eq!(listed[0].lines[0].requested, available);
        s.receive_material_order_with_proof(
            p.id,
            order.id,
            &BTreeMap::from([(res, 2.into())]),
            None,
        )
        .unwrap();
        let listed = s.supplier_orders(p.id, "material").unwrap();
        let l = &listed[0].lines[0];
        assert_eq!(l.received, Decimal::from(if receive_first { 5 } else { 2 }));
        assert_eq!(l.vendor_stock, available - Decimal::from(2));
        assert_eq!(l.requested, available - Decimal::from(2));
        assert_eq!(l.remaining, available - Decimal::from(2));
    }
}

#[test]
fn certificate_accumulated_quantity_preserves_exact_units_and_rejects_overruns() {
    let (mut s, p, e, mut line) = fixture();
    line.quantity = 3.into();
    s.update_estimate_item(&line).unwrap();
    s.save_project_plan(p.id, 0, financial_test_plan(line.id), "2026-11-05")
        .unwrap();
    s.issue_estimate(e.id).unwrap();
    let mut draft = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-05")
        .unwrap();
    draft.operation.date = "2026-11-05".into();
    draft.progress[0].accumulated_quantity = Some(Decimal::ONE);
    draft.progress[0].accumulated_percent = Decimal::from_str_exact("33.3333333333333333").unwrap();
    let saved = s.save_certificate_draft(&draft).unwrap();
    assert_eq!(saved.operation.lines[0].quantity, Decimal::ONE);
    assert_eq!(saved.progress[0].accumulated_quantity, Some(Decimal::ONE));
    let preview = s.preview_certificate_draft(saved.id).unwrap();
    assert_eq!(preview.rows[0].accumulated, Decimal::ONE);
    let mut invalid = saved.clone();
    invalid.progress[0].accumulated_quantity = Some(4.into());
    assert!(s.save_certificate_draft(&invalid).is_err());
    invalid.progress[0].accumulated_quantity = Some((-1).into());
    assert!(s.save_certificate_draft(&invalid).is_err());
    let mut legacy = saved;
    legacy.progress[0].accumulated_quantity = None;
    legacy.progress[0].accumulated_percent = 100.into();
    let saved = s.save_certificate_draft(&legacy).unwrap();
    assert_eq!(saved.operation.lines[0].quantity, 3.into());
}

#[test]
fn deleting_last_takeoff_restores_manual_quantity_after_reapply_and_roundtrip() {
    use crate::takeoffs::TakeoffRow;
    let (mut s, _, e, line) = fixture();
    let manual = line.quantity;
    let row = TakeoffRow {
        id: Uuid::new_v4(),
        estimate_id: e.id,
        line_id: line.id,
        note: "Metrado".into(),
        factor: 1.into(),
        length: 3.into(),
        width: 2.into(),
        height: 1.into(),
        sign: 1,
        position: 0,
    };
    s.save_takeoff_row(&row).unwrap();
    s.apply_takeoff_to_line(e.id, line.id).unwrap();
    let second = TakeoffRow {
        id: Uuid::new_v4(),
        position: 1,
        ..row.clone()
    };
    s.save_takeoff_row(&second).unwrap();
    s.apply_takeoff_to_line(e.id, line.id).unwrap();
    let copy = s.duplicate_estimate(e.id, "Copia").unwrap();
    let exported = s.export_budget(e.id).unwrap();
    assert_eq!(exported.takeoff_previous_quantities[&line.id], manual);
    let imported = s.import_budget(e.project_id, &exported).unwrap();
    for estimate in [e.id, copy.id, imported.id] {
        let item = s.estimate_items(estimate).unwrap().remove(0);
        let rows = s.list_takeoff_rows(estimate, item.id).unwrap();
        s.delete_takeoff_row(rows[0].id).unwrap();
        assert_eq!(s.estimate_items(estimate).unwrap()[0].quantity, 12.into());
        assert_eq!(s.measured_lines(estimate).unwrap(), vec![item.id]);
        s.delete_takeoff_row(rows[1].id).unwrap();
        assert_eq!(s.estimate_items(estimate).unwrap()[0].quantity, manual);
        assert!(s.measured_lines(estimate).unwrap().is_empty());
    }
}
#[test]
fn deleting_takeoffs_preserves_manual_changes_and_does_not_guess_legacy_values() {
    use crate::takeoffs::TakeoffRow;
    let (mut s, _, e, line) = fixture();
    let row = TakeoffRow {
        id: Uuid::new_v4(),
        estimate_id: e.id,
        line_id: line.id,
        note: "Metrado".into(),
        factor: 1.into(),
        length: 3.into(),
        width: 2.into(),
        height: 1.into(),
        sign: 1,
        position: 0,
    };
    s.save_takeoff_row(&row).unwrap();
    s.apply_takeoff_to_line(e.id, line.id).unwrap();
    let mut edited = s.estimate_items(e.id).unwrap().remove(0);
    edited.quantity = 9.into();
    s.update_estimate_item(&edited).unwrap();
    s.delete_takeoff_row(row.id).unwrap();
    assert_eq!(s.estimate_items(e.id).unwrap()[0].quantity, 9.into());
    s.save_takeoff_row(&row).unwrap();
    s.apply_takeoff_to_line(e.id, line.id).unwrap();
    s.conn
        .execute(
            "UPDATE measured_lines SET previous_quantity=NULL WHERE line_id=?1",
            [line.id.to_string()],
        )
        .unwrap();
    s.delete_takeoff_row(row.id).unwrap();
    assert_eq!(s.estimate_items(e.id).unwrap()[0].quantity, 6.into());
    assert!(s.measured_lines(e.id).unwrap().is_empty());
}

#[test]
fn project_funds_keep_client_deficit_separate_from_own_money() {
    let (mut s, p, e, _) = fixture();
    let mut advance = operation(p.id, "advance_received");
    advance.estimate_id = Some(e.id);
    advance.amount = 100.into();
    let advance = s.register_fund_movement(&advance, None).unwrap();
    assert_eq!(advance.estimate_id, Some(e.id));
    assert_eq!(
        s.adjustment_agreement(e.id)
            .unwrap()
            .terms
            .advance_recovery_percent,
        50.into()
    );
    let mut paid = operation(p.id, "direct_payment");
    paid.amount = 120.into();
    paid.notes = "Permiso de obra pagado".into();
    s.register_fund_movement(&paid, None).unwrap();
    let mut own = operation(p.id, "fund_contribution");
    own.amount = 20.into();
    s.register_fund_movement(&own, None).unwrap();
    let report = s.operations_report(p.id, Some(e.id), "2026-11-05").unwrap();
    let summary = &report.summaries[0];
    assert_eq!(summary.collected, 100.into());
    assert_eq!(summary.paid, 120.into());
    assert_eq!(summary.cash, (-20).into());
    assert_eq!(summary.own_contributions, 20.into());
    assert_eq!(summary.available_cash, Decimal::ZERO);
    assert_eq!(summary.accrued, 120.into());
    let mut refund = operation(p.id, "fund_reimbursement");
    refund.amount = 21.into();
    assert!(s.post_operation(&refund).is_err());
    assert_eq!(
        s.project_fund_balance(p.id, "ARS", "2026-11-05").unwrap(),
        Decimal::ZERO
    );
}
#[test]
fn certificates_recover_only_received_advances_for_their_budget() {
    let (mut s, p, e, _) = fixture();
    let other = s.duplicate_estimate(e.id, "Otro convenio").unwrap();
    let mut advance = operation(p.id, "advance_received");
    advance.amount = 80.into();
    advance.advance_percent = Some(50.into());
    assert!(s.post_operation(&advance).is_err()); // More than one budget: never guess the agreement.
    advance.estimate_id = Some(other.id);
    s.post_operation(&advance).unwrap();
    s.save_adjustment_agreement_with_terms(
        e.id,
        0,
        None,
        Some(crate::construction_workflow::CertificateTerms {
            advance_recovery_percent: 50.into(),
            retention_percent: Decimal::ZERO,
            collection_delay_days: 0,
        }),
    )
    .unwrap();
    s.issue_estimate(e.id).unwrap();
    let mut draft = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-01", "2026-11-05")
        .unwrap();
    draft.operation.date = "2026-11-05".into();
    draft.progress[0].accumulated_percent = 50.into();
    let no_advance = s.calculate_certificate_preview(&draft).unwrap();
    assert_eq!(no_advance.operation.advance, Decimal::ZERO);
    advance.id = Uuid::new_v4();
    advance.number = Uuid::new_v4().to_string();
    advance.estimate_id = Some(e.id);
    advance.amount = 40.into();
    s.post_operation(&advance).unwrap();
    let draft = s.save_certificate_draft(&draft).unwrap();
    let issued = s
        .issue_certificate_draft(draft.id, draft.revision, "2026-11-05")
        .unwrap();
    assert_eq!(issued.advance, 40.into());
    let mut next = s
        .open_certificate_draft(p.id, e.id, None, "2026-11-06", "2026-11-10")
        .unwrap();
    next.operation.date = "2026-11-10".into();
    next.progress[0].accumulated_percent = 100.into();
    assert_eq!(
        s.calculate_certificate_preview(&next)
            .unwrap()
            .operation
            .advance,
        Decimal::ZERO
    );
}
#[test]
fn contact_baja_preserves_roles_and_used_people_cannot_be_deleted() {
    let (mut s, p, _, _) = fixture();
    assert!(s.delete_unused_person(p.client_id).is_err());
    s.set_entity_archived("person:client", p.client_id, true)
        .unwrap();
    assert!(!s.person(p.client_id).unwrap().unwrap().client_active);
    let mut new_project = p.clone();
    new_project.id = Uuid::new_v4();
    assert!(s.save_project(&new_project).is_err());
    s.set_entity_archived("person:client", p.client_id, false)
        .unwrap();
    assert!(s.person(p.client_id).unwrap().unwrap().client_active);
    let data = crate::persons::PersonInput {
        name: "Contacto sin uso".into(),
        cuit: None,
        code: String::new(),
        email: String::new(),
        phone: String::new(),
        address: String::new(),
    };
    let unused = s.save_person(None, 0, "supplier", &data).unwrap();
    s.set_entity_archived("person:supplier", unused.id, true)
        .unwrap();
    assert!(!s.person(unused.id).unwrap().unwrap().supplier_active);
    s.set_entity_archived("person:supplier", unused.id, false)
        .unwrap();
    s.delete_unused_person(unused.id).unwrap();
    assert!(s.person(unused.id).unwrap().is_none());
}
#[test]
fn removing_projects_and_budgets_hides_lists_but_preserves_history() {
    let (mut s, p, e, line) = fixture();
    s.set_entity_archived("estimate", e.id, true).unwrap();
    assert!(s.list_project_estimates(p.id).unwrap().is_empty());
    assert_eq!(s.estimate_items(e.id).unwrap()[0].id, line.id);
    s.set_entity_archived("estimate", e.id, false).unwrap();
    assert_eq!(s.list_project_estimates(p.id).unwrap().len(), 1);
    s.set_entity_archived("project", p.id, true).unwrap();
    assert!(s.list_projects().unwrap().is_empty());
    assert!(s.get_project(p.id).unwrap().is_some());
    assert!(s.shared_project_document(p.id, "2026-11-05").is_err());
}

fn reviewed_update(line: &EstimateItem, price: Decimal) -> crate::assisted_budget::PriceUpdate {
    use crate::assisted_budget::*;
    PriceUpdate {
        line_id: line.id,
        expected: ExpectedLine {
            description: line.description.clone(),
            unit: line.unit.clone(),
            quantity: line.quantity,
            unit_cost: line.unit_cost_snapshot,
            analysis_id: line.analysis_id,
        },
        unit_price: price,
        description: None,
        unit: None,
        quantity: None,
    }
}
#[test]
fn reviewed_batch_is_atomic_and_detects_stale_prices() {
    use crate::assisted_budget::*;
    let (mut s, _, e, line) = fixture();
    let mut batch = ReviewedBatch {
        section_moves: vec![],
        acus: vec![],
        id: Uuid::new_v4(),
        estimate_id: e.id,
        currency: "ARS".into(),
        new_estimate: None,
        updates: vec![reviewed_update(&line, 150.into())],
        deletes: vec![],
        creates: vec![NewLine {
            id: Uuid::new_v4(),
            description: "Nueva".into(),
            unit: "".into(),
            quantity: 1.into(),
            unit_price: 20.into(),
            section: None,
        }],
    };
    assert!(s.apply_reviewed_budget_batch(&batch).is_err());
    assert_eq!(
        s.estimate_items(e.id).unwrap()[0].unit_cost_snapshot,
        100.into()
    );
    batch.creates[0].unit = "m".into();
    batch.creates[0].section = Some("Rubro nuevo".into());
    let result = s.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!((result.updated, result.created), (1, 1));
    let retry = s.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!(retry.created, 1);
    assert_eq!(s.estimate_items(e.id).unwrap().len(), 2);
    batch.id = Uuid::new_v4();
    batch.creates.clear();
    assert!(s.apply_reviewed_budget_batch(&batch).is_err());
    assert_eq!(
        s.estimate_items(e.id).unwrap()[0].unit_cost_snapshot,
        150.into()
    );
}
#[test]
fn reviewed_batch_can_create_a_budget_but_rolls_it_back_on_bad_lines() {
    use crate::assisted_budget::*;
    let (mut s, p, _, _) = fixture();
    let mut batch = ReviewedBatch {
        section_moves: vec![],
        acus: vec![],
        id: Uuid::new_v4(),
        estimate_id: Uuid::new_v4(),
        currency: "ARS".into(),
        new_estimate: Some(NewEstimate {
            project_id: p.id,
            title: "Desde IA".into(),
        }),
        updates: vec![],
        deletes: vec![],
        creates: vec![NewLine {
            id: Uuid::new_v4(),
            description: "Partida".into(),
            unit: "".into(),
            quantity: 0.into(),
            unit_price: 0.into(),
            section: Some("Preparación".into()),
        }],
    };
    assert!(s.apply_reviewed_budget_batch(&batch).is_err());
    assert!(s.get_estimate(batch.estimate_id).unwrap().is_none());
    batch.creates[0].unit = "gl".into();
    s.apply_reviewed_budget_batch(&batch).unwrap();
    s.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!(s.estimate_items(batch.estimate_id).unwrap().len(), 1);
    assert_eq!(s.list_budget_sections(batch.estimate_id).unwrap().len(), 1);
}
#[test]
fn reviewed_batch_edits_and_deletes_with_history_and_protects_issued_budgets() {
    use crate::assisted_budget::*;
    let (mut s, _, e, line) = fixture();
    let mut update = reviewed_update(&line, 120.into());
    update.description = Some("Descripción editada".into());
    update.quantity = Some(3.into());
    let edit = ReviewedBatch {
        section_moves: vec![],
        acus: vec![],
        id: Uuid::new_v4(),
        estimate_id: e.id,
        currency: "ARS".into(),
        new_estimate: None,
        updates: vec![update],
        creates: vec![],
        deletes: vec![],
    };
    s.apply_reviewed_budget_batch(&edit).unwrap();
    let changed = s.estimate_items(e.id).unwrap().remove(0);
    assert_eq!(changed.description, "Descripción editada");
    assert_eq!(changed.quantity, 3.into());
    let expected = reviewed_update(&changed, 0.into()).expected;
    let mut deletion = ReviewedBatch {
        section_moves: vec![],
        acus: vec![],
        id: Uuid::new_v4(),
        estimate_id: e.id,
        currency: "ARS".into(),
        new_estimate: None,
        updates: vec![],
        creates: vec![],
        deletes: vec![Deletion {
            line_id: line.id,
            expected,
        }],
    };
    deletion.deletes[0].expected.quantity = 2.into();
    assert!(s.apply_reviewed_budget_batch(&deletion).is_err());
    assert_eq!(s.estimate_items(e.id).unwrap().len(), 1);
    deletion.deletes[0].expected.quantity = 3.into();
    s.apply_reviewed_budget_batch(&deletion).unwrap();
    assert!(s.estimate_items(e.id).unwrap().is_empty());
    assert!(s
        .conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM deleted_estimate_lines WHERE id=?1)",
            [line.id.to_string()],
            |r| r.get::<_, bool>(0)
        )
        .unwrap());
    let (mut s, _, e, line) = fixture();
    s.issue_estimate(e.id).unwrap();
    let issued = ReviewedBatch {
        section_moves: vec![],
        acus: vec![],
        id: Uuid::new_v4(),
        estimate_id: e.id,
        currency: "ARS".into(),
        new_estimate: None,
        updates: vec![reviewed_update(&line, 1.into())],
        creates: vec![],
        deletes: vec![],
    };
    assert!(s.apply_reviewed_budget_batch(&issued).is_err());
}

#[test]
fn reviewed_batch_moves_rubros_atomically_without_touching_prices() {
    use crate::assisted_budget::*;
    let (mut store, _, estimate, line) = fixture();
    let target = crate::budget_sections::BudgetSection {
        id: Uuid::new_v4(),
        estimate_id: estimate.id,
        parent_id: None,
        code: "99".into(),
        title: "Estructuras".into(),
        position: 0,
    };
    store.save_budget_section(&target).unwrap();
    let move_plan = SectionMove {
        line_id: line.id,
        expected: reviewed_update(&line, line.unit_cost_snapshot).expected,
        expected_section: None,
        section_id: target.id,
    };
    let mut batch = ReviewedBatch {
        id: Uuid::new_v4(),
        estimate_id: estimate.id,
        currency: "ARS".into(),
        new_estimate: None,
        updates: vec![],
        creates: vec![],
        deletes: vec![],
        acus: vec![],
        section_moves: vec![move_plan],
    };
    let result = store.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!(result.moved_sections, 1);
    assert_eq!(
        store.list_line_sections(estimate.id).unwrap(),
        vec![(line.id, target.id)]
    );
    assert_eq!(
        store.estimate_items(estimate.id).unwrap()[0].unit_cost_snapshot,
        line.unit_cost_snapshot
    );
    assert_eq!(
        store
            .apply_reviewed_budget_batch(&batch)
            .unwrap()
            .moved_sections,
        1
    );
    batch.id = Uuid::new_v4();
    assert!(store.apply_reviewed_budget_batch(&batch).is_err());
    assert_eq!(
        store.list_line_sections(estimate.id).unwrap(),
        vec![(line.id, target.id)]
    );
}

fn assisted_acu_fixture() -> (LocalStore, Project, Estimate, EstimateItem, Uuid) {
    use crate::resource_catalog::{Resource, ResourcePrice};
    let (mut s, p, e, mut line) = fixture();
    line.unit = "m²".into();
    s.update_estimate_item(&line).unwrap();
    let id = Uuid::new_v4();
    s.save_resource(&Resource {
        id,
        code: "MAT-ACU".into(),
        description: "Material de prueba".into(),
        unit: "kg".into(),
        kind: cpobras_core::ResourceKind::Material,
        active: true,
    })
    .unwrap();
    s.add_resource_price(&ResourcePrice {
        id: Uuid::new_v4(),
        resource_id: id,
        amount: Decimal::new(29, 2),
        currency: Currency::Ars,
        effective_date: "2026-11-01".into(),
        source: None,
    })
    .unwrap();
    (s, p, e, line, id)
}
fn assisted_acu_batch(
    s: &LocalStore,
    p: &Project,
    e: &Estimate,
    line: &EstimateItem,
    id: Uuid,
) -> crate::assisted_budget::ReviewedBatch {
    use crate::{assisted_acu::*, assisted_budget::*};
    let context = s
        .assisted_acu_context(p.id, Some(e.id), "2026-11-10")
        .unwrap();
    let snapshot = context.lines.iter().find(|l| l.id == line.id).unwrap();
    ReviewedBatch {
        section_moves: vec![],
        id: Uuid::new_v4(),
        estimate_id: e.id,
        currency: "ARS".into(),
        new_estimate: None,
        updates: vec![],
        creates: vec![],
        deletes: vec![],
        acus: vec![AcuChange {
            line_id: line.id,
            expected: Some(ExpectedLine {
                description: line.description.clone(),
                unit: line.unit.clone(),
                quantity: line.quantity,
                unit_cost: line.unit_cost_snapshot,
                analysis_id: line.analysis_id,
            }),
            expected_recipe: snapshot.expected_recipe.clone(),
            expected_section: snapshot.section_id,
            as_of: "2026-11-10".into(),
            components: vec![Consumption {
                resource_id: id,
                quantity: Decimal::new(3, 1),
                expected_resource: context.resources.into_iter().find(|r| r.id == id).unwrap(),
            }],
            section_id: None,
            section_title: Some("Revoques".into()),
            measurements: None,
            expected_takeoffs: snapshot.takeoffs.clone(),
            expected_formula: snapshot.formula.clone(),
            notes: "Consumo revisado por unidad de partida".into(),
        }],
    }
}
#[test]
fn assisted_acu_calculates_exact_catalog_cost_and_retry_does_not_duplicate() {
    let (mut s, p, e, line, id) = assisted_acu_fixture();
    let batch = assisted_acu_batch(&s, &p, &e, &line, id);
    let result = s.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!(result.composed, 1);
    let saved = s.estimate_items(e.id).unwrap().remove(0);
    assert_eq!(saved.unit_cost_snapshot, Decimal::new(87, 3));
    assert_eq!(saved.quantity, line.quantity);
    assert!(saved.analysis_id.is_some());
    assert_eq!(s.list_budget_sections(e.id).unwrap()[0].title, "Revoques");
    s.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!(
        s.conn
            .query_row("SELECT COUNT(*) FROM line_analysis_snapshots", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}
#[test]
fn assisted_acu_rejects_changed_or_missing_prices_without_partial_writes() {
    use crate::resource_catalog::ResourcePrice;
    let (mut s, p, e, line, id) = assisted_acu_fixture();
    let batch = assisted_acu_batch(&s, &p, &e, &line, id);
    s.add_resource_price(&ResourcePrice {
        id: Uuid::new_v4(),
        resource_id: id,
        amount: 1.into(),
        currency: Currency::Ars,
        effective_date: "2026-11-09".into(),
        source: None,
    })
    .unwrap();
    assert!(s.apply_reviewed_budget_batch(&batch).is_err());
    assert_eq!(
        s.estimate_items(e.id).unwrap()[0].unit_cost_snapshot,
        line.unit_cost_snapshot
    );
    assert!(s.list_budget_sections(e.id).unwrap().is_empty());
    let mut missing = assisted_acu_batch(&s, &p, &e, &line, id);
    missing.acus[0].components[0].expected_resource.price = None;
    assert!(s.apply_reviewed_budget_batch(&missing).is_err());
}
#[test]
fn assisted_acu_measurements_are_calculated_and_restore_previous_manual_quantity() {
    use crate::assisted_acu::Dimensions;
    let (mut s, p, e, line, id) = assisted_acu_fixture();
    let mut batch = assisted_acu_batch(&s, &p, &e, &line, id);
    batch.acus[0].measurements = Some(vec![
        Dimensions {
            note: "Dos caras".into(),
            factor: 2.into(),
            length: 20.into(),
            width: 1.into(),
            height: 3.into(),
            sign: 1,
        },
        Dimensions {
            note: "Abertura en ambas caras".into(),
            factor: 2.into(),
            length: 2.into(),
            width: 1.into(),
            height: 2.into(),
            sign: -1,
        },
    ]);
    s.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!(s.estimate_items(e.id).unwrap()[0].quantity, 112.into());
    let rows = s.list_takeoff_rows(e.id, line.id).unwrap();
    assert_eq!(rows.len(), 2);
    for row in rows {
        s.delete_takeoff_row(row.id).unwrap();
    }
    assert_eq!(s.estimate_items(e.id).unwrap()[0].quantity, line.quantity);
}
#[test]
fn assisted_acu_reuses_reference_consumption_but_not_historical_prices() {
    use crate::{line_workflows::LineResourceInput, resource_catalog::ResourcePrice};
    let (mut s, p, e, line, id) = assisted_acu_fixture();
    s.save_line_resources(
        e.id,
        line.id,
        &[LineResourceInput {
            resource_id: id,
            quantity: 2.into(),
            unit_price: 10.into(),
        }],
    )
    .unwrap();
    s.issue_estimate(e.id).unwrap();
    let source = s
        .get_analysis(s.estimate_items(e.id).unwrap()[0].analysis_id.unwrap())
        .unwrap()
        .unwrap();
    let target = Estimate {
        id: Uuid::new_v4(),
        project_id: p.id,
        title: "Destino".into(),
        currency: Currency::Ars,
        issued: false,
    };
    s.create_estimate(&target).unwrap();
    let target_line = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id: target.id,
        position: 0,
        analysis_id: None,
        description: "Revoque nuevo".into(),
        unit: "m²".into(),
        quantity: 1.into(),
        unit_cost_snapshot: 0.into(),
    };
    s.add_estimate_item(&target_line).unwrap();
    s.add_resource_price(&ResourcePrice {
        id: Uuid::new_v4(),
        resource_id: id,
        amount: 20.into(),
        currency: Currency::Ars,
        effective_date: "2026-11-09".into(),
        source: None,
    })
    .unwrap();
    let examples = s
        .assisted_acu_reference(&format!("budget:{}", e.id))
        .unwrap();
    let mut batch = assisted_acu_batch(&s, &p, &target, &target_line, id);
    batch.acus[0].components[0].quantity = examples[0].components[0].quantity;
    s.apply_reviewed_budget_batch(&batch).unwrap();
    assert_eq!(
        s.estimate_items(target.id).unwrap()[0].unit_cost_snapshot,
        40.into()
    );
    assert_eq!(
        s.get_analysis(source.id)
            .unwrap()
            .unwrap()
            .direct_unit_cost()
            .unwrap(),
        20.into()
    );
}
