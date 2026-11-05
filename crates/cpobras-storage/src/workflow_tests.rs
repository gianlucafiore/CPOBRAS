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
