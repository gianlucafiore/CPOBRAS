use crate::Db;
use cpobras_storage::operations::{Operation, ProjectOperationsReport, StockBalance, Warehouse};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_operations(
    db: tauri::State<'_, Db>,
    project_id: Option<Uuid>,
) -> Result<Vec<Operation>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operation_documents(project_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn post_operation(
    db: tauri::State<'_, Db>,
    operation: Operation,
) -> Result<Operation, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .post_operation(&operation)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_warehouses(db: tauri::State<'_, Db>) -> Result<Vec<Warehouse>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operation_warehouses()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn create_warehouse(
    db: tauri::State<'_, Db>,
    warehouse: Warehouse,
) -> Result<Warehouse, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .create_operation_warehouse(&warehouse)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn stock_balances(
    db: tauri::State<'_, Db>,
    as_of: String,
) -> Result<Vec<StockBalance>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operation_stock(&as_of)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn operations_report(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    estimate_id: Option<Uuid>,
    as_of: String,
) -> Result<ProjectOperationsReport, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operations_report(project_id, estimate_id, &as_of)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn operations_portfolio(
    db: tauri::State<'_, Db>,
    as_of: String,
) -> Result<Vec<ProjectOperationsReport>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operations_portfolio(&as_of)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_certificate_drafts(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    estimate_id: Uuid,
) -> Result<Vec<cpobras_storage::construction_workflow::CertificateDraft>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .certificate_drafts(project_id, estimate_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn open_certificate_draft(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    estimate_id: Uuid,
    contract_id: Option<Uuid>,
    start: String,
    end: String,
) -> Result<cpobras_storage::construction_workflow::CertificateDraft, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .open_certificate_draft(project_id, estimate_id, contract_id, &start, &end)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn save_certificate_draft(
    db: tauri::State<'_, Db>,
    draft: cpobras_storage::construction_workflow::CertificateDraft,
) -> Result<cpobras_storage::construction_workflow::CertificateDraft, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_certificate_draft(&draft)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn preview_certificate_draft(
    db: tauri::State<'_, Db>,
    id: Uuid,
) -> Result<cpobras_storage::construction_workflow::CertificateSheet, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .preview_certificate_draft(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn issue_certificate_draft(
    db: tauri::State<'_, Db>,
    id: Uuid,
    revision: u32,
    date: String,
) -> Result<Operation, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .issue_certificate_draft(id, revision, &date)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn issued_certificate_sheet(
    db: tauri::State<'_, Db>,
    id: Uuid,
) -> Result<cpobras_storage::construction_workflow::CertificateSheet, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .issued_certificate_sheet(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn available_progress(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    estimate_id: Uuid,
) -> Result<Vec<cpobras_storage::construction_workflow::AvailableProgress>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .available_progress(project_id, estimate_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn create_quotation_request(
    db: tauri::State<'_, Db>,
    request: cpobras_storage::quotation_workflow::QuotationRequest,
) -> Result<cpobras_storage::quotation_workflow::QuotationRequest, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .create_quotation_request(&request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_quotation_requests(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
) -> Result<Vec<cpobras_storage::quotation_workflow::QuotationRequest>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .quotation_requests(project_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn preview_quotation_import(
    db: tauri::State<'_, Db>,
    request_id: Uuid,
    supplier_id: Uuid,
    prices: Vec<cpobras_storage::quotation_workflow::QuotedPrice>,
    import_id: Uuid,
    date: String,
    reference: String,
) -> Result<Operation, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .preview_quotation_import(
            request_id,
            supplier_id,
            &prices,
            import_id,
            &date,
            &reference,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn calculate_certificate_preview(
    db: tauri::State<'_, Db>,
    draft: cpobras_storage::construction_workflow::CertificateDraft,
) -> Result<cpobras_storage::construction_workflow::CertificateSheet, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .calculate_certificate_preview(&draft)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn certificate_editor_sheet(
    db: tauri::State<'_, Db>,
    id: uuid::Uuid,
) -> Result<cpobras_storage::construction_workflow::CertificateSheet, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .certificate_editor_sheet(id)
        .map_err(|e| e.to_string())
}
