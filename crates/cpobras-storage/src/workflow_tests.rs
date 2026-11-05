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
        calendar: Calendar {
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
    assert!(
        store.delete_estimate_item(estimate.id, line.id).is_err(),
        "Linked budget lines must remain referenced by the current plan"
    );
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
    let store = LocalStore::open(&path).unwrap();
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
