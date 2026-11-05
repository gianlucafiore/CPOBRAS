use super::*;
use serde_json::{json, Value};

#[test]
fn ipc_creates_budget_and_preserves_issued_snapshot() {
    let temp = std::env::temp_dir().join(format!("cpobras-ipc-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&temp).unwrap();
    std::fs::create_dir(temp.join("backups")).unwrap();
    let app = configure(tauri::test::mock_builder())
        .manage(Mutex::new(LocalStore::in_memory().unwrap()))
        .manage(BackupDirectory(temp.join("backups")))
        .build(tauri::generate_context!())
        .unwrap();
    let view = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let call = |name: &str, body: Value| {
        tauri::test::get_ipc_response(
            &view,
            tauri::webview::InvokeRequest {
                cmd: name.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.into(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    };
    let client = call(
        "create_client",
        json!({"clientName":"Comitente", "cuit":null}),
    )
    .unwrap();
    let project = call(
        "create_project",
        json!({"projectName":"Obra de prueba", "clientId":client["id"], "currency":"ARS"}),
    )
    .unwrap();
    let estimate = call(
        "create_estimate",
        json!({"projectId":project["id"], "title":"Presupuesto"}),
    )
    .unwrap();
    let resource = call("create_resource", json!({"code":"MAT-1","description":"Material","unit":"kg","kind":"material","price":"1.005","effectiveDate":"2026-11-05","source":null})).unwrap();
    let analysis = call("create_analysis", json!({"code":"ACU-1","description":"Análisis","unit":"kg","components":[{"resourceId":resource["id"],"quantity":"2","unitPrice":"1.005"}]})).unwrap();
    assert_eq!(analysis["unit_cost"], "2.010");
    call(
        "add_line_from_analysis",
        json!({"estimateId":estimate["id"],"analysisId":analysis["id"],"quantity":"10"}),
    )
    .unwrap();
    call("issue_estimate", json!({"estimateId":estimate["id"]})).unwrap();
    assert!(call(
        "refresh_draft_analysis_costs",
        json!({"estimateId":estimate["id"]})
    )
    .is_err());
    let total = call("estimate_total", json!({"estimateId":estimate["id"]})).unwrap();
    assert_eq!(total, "20.100");
    assert!(call(
        "create_project",
        json!({"projectName":"Invalid", "clientId":"broken", "currency":"ARS"})
    )
    .is_err());
    let company_id = uuid::Uuid::new_v4().to_string();
    call("save_management_record",json!({"record":{"id":company_id,"kind":"company","name":"Empresa IPC","code":"EMP","company_id":null,"parent_id":null,"project_id":null,"client_id":null,"attributes":{},"revision":0}})).unwrap();
    let list_id = uuid::Uuid::new_v4().to_string();
    call("create_price_list",json!({"list":{"id":list_id,"name":"Lista ARS","supplier_id":null,"currency":"ARS","zone":"Buenos Aires","valid_from":"2026-11-01","valid_until":null}})).unwrap();
    call("register_scoped_price",json!({"price":{"id":uuid::Uuid::new_v4(),"list_id":list_id,"resource_id":resource["id"],"effective_date":"2026-11-05","amount":"100","source":"Cotización de prueba"}})).unwrap();
    let nested_id = uuid::Uuid::new_v4().to_string();
    call("save_nested_analysis",json!({"analysis":{"id":nested_id,"code":"NEST","description":"Compuesto","unit":"m","components":[{"source":{"type":"resource","id":resource["id"]},"quantity_formula":"largo*2","variables":{"largo":"3"},"waste_percent":"10","production_coefficient":"1","yield_factor":"2"}]}})).unwrap();
    let cost = call(
        "calculate_nested_cost",
        json!({"analysisId":nested_id,"listId":list_id,"asOf":"2026-11-05","changes":{}}),
    )
    .unwrap();
    assert_eq!(
        cost["unit_cost"]
            .as_str()
            .unwrap()
            .parse::<rust_decimal::Decimal>()
            .unwrap(),
        rust_decimal::Decimal::from(330)
    );
    let document = call(
        "export_budget_document",
        json!({"estimateId":estimate["id"]}),
    )
    .unwrap();
    let imported = call(
        "import_budget_document",
        json!({"projectId":project["id"],"document":document}),
    )
    .unwrap();
    assert_ne!(imported["id"], estimate["id"]);
    let imported_lines = call("list_estimate_lines", json!({"estimateId":imported["id"]})).unwrap();
    let private=call("save_line_resources",json!({"estimateId":imported["id"],"lineId":imported_lines[0]["id"],"components":[{"resourceId":resource["id"],"quantity":"2.5","unitPrice":"1.005"}]})).unwrap();
    let detail = call("get_analysis_details", json!({"analysisId":private})).unwrap();
    assert_eq!(detail["is_line_owned"], true);
    assert_eq!(
        call("list_analyses", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    call("move_budget_line",json!({"estimateId":imported["id"],"lineId":imported_lines[0]["id"],"beforeId":null,"sectionId":null})).unwrap();
    assert!(call("save_line_resources",json!({"estimateId":estimate["id"],"lineId":document["lines"][0]["id"],"components":[{"resourceId":resource["id"],"quantity":"1","unitPrice":"1"}]})).is_err());

    let task_id = uuid::Uuid::new_v4();
    let saved=call("save_project_plan",json!({"projectId":project["id"],"revision":0,"asOf":"2026-11-05","plan":{"calendar":{"start_date":"2026-11-05","nonworking_weekdays":[5,6],"holidays":[]},"tasks":[{"id":task_id,"parent_id":null,"estimate_line_id":document["lines"][0]["id"],"name":"Tarea IPC","duration_days":3,"predecessors":[],"not_before":null,"finish_by":null,"assignments":[],"budget":"0","actual_progress":"25"}]}})).unwrap();
    assert_eq!(saved["revision"], 1);
    call(
        "create_plan_baseline",
        json!({"projectId":project["id"],"name":"Contractual","asOf":"2026-11-05"}),
    )
    .unwrap();
    let backup = call("create_backup", json!({})).unwrap();
    let wh_id = uuid::Uuid::new_v4();
    call("create_warehouse",json!({"warehouse":{"id":wh_id,"project_id":project["id"],"name":"Depósito IPC","location":"A1"}})).unwrap();
    assert_eq!(
        call("list_warehouses", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let op_id = uuid::Uuid::new_v4();
    let op=call("post_operation",json!({"operation":{"id":op_id,"project_id":project["id"],"kind":"request","number":"SOL-IPC","date":"2026-11-05","lines":[{"resource_id":resource["id"],"description":"Material IPC","quantity":"2","unit_price":"1.005"}]}})).unwrap();
    assert_eq!(op["id"], op_id.to_string());
    assert_eq!(
        call("list_operations", json!({"projectId":project["id"]}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        call("stock_balances", json!({"asOf":"2026-11-05"})).unwrap(),
        json!([])
    );
    let report = call(
        "operations_report",
        json!({"projectId":project["id"],"estimateId":estimate["id"],"asOf":"2026-11-05"}),
    )
    .unwrap();
    assert_eq!(report["project_id"], project["id"]);
    assert_eq!(
        call("operations_portfolio", json!({"asOf":"2026-11-05"}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(call("post_operation", json!({"operation":op})).is_err());
    call("verify_database", json!({})).unwrap();
    call("restore_backup", json!({"id":backup})).unwrap();
    let exported = call(
        "write_export",
        json!({"name":"presupuesto.csv","bytes":[65,66,67]}),
    )
    .unwrap();
    assert!(exported.as_str().unwrap().ends_with("presupuesto.csv"));
    assert!(call("write_export", json!({"name":"../escape.csv","bytes":[65]})).is_err());
    let untrusted = tauri::WebviewWindowBuilder::new(&app, "untrusted", Default::default())
        .build()
        .unwrap();
    let denied = tauri::test::get_ipc_response(
        &untrusted,
        tauri::webview::InvokeRequest {
            cmd: "list_clients".into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(json!({})),
            headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.into(),
        },
    );
    assert!(
        denied.is_err(),
        "Auxiliary windows must not access workspace commands"
    );
    let remote = tauri::test::get_ipc_response(
        &view,
        tauri::webview::InvokeRequest {
            cmd: "list_clients".into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "https://example.com".parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(json!({})),
            headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.into(),
        },
    );
    assert!(
        remote.is_err(),
        "Remote origins must not access workspace commands"
    );
    std::fs::remove_dir_all(temp).unwrap();
}

#[test]
fn optimized_glib_string_variant_iteration_matches_upstream_fix() {
    use glib::prelude::*;
    let value = vec!["uno", "dos", "tres"].to_variant();
    assert_eq!(
        value.array_iter_str().unwrap().collect::<Vec<_>>(),
        vec!["uno", "dos", "tres"]
    );
    assert_eq!(
        value.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        vec!["tres", "dos", "uno"]
    );
    let mut mixed = value.array_iter_str().unwrap();
    assert_eq!(mixed.next(), Some("uno"));
    assert_eq!(mixed.next_back(), Some("tres"));
    assert_eq!(mixed.next(), Some("dos"));
    assert_eq!(mixed.next_back(), None);
}
