use crate::Db;
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_site_entries(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    page: u32,
) -> Result<cpobras_storage::site_book::SitePage, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .site_entries(project_id, page)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_site_entry(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    id: Option<Uuid>,
    revision: u32,
    description: String,
) -> Result<cpobras_storage::site_book::SiteEntry, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_site_entry(project_id, id, revision, &description)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn confirm_site_entry(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    id: Uuid,
    revision: u32,
) -> Result<cpobras_storage::site_book::SiteEntry, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .confirm_site_entry(project_id, id, revision)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn print_site_entries(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    from: String,
    to: String,
    first: String,
    last: String,
) -> Result<Vec<cpobras_storage::site_book::SiteEntry>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .print_site_entries(project_id, &from, &to, &first, &last)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn open_next_client_certificate(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    estimate_id: Uuid,
) -> Result<cpobras_storage::construction_workflow::CertificateDraft, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .open_next_client_certificate(project_id, estimate_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_quote_responses(
    db: tauri::State<'_, Db>,
    request_id: Uuid,
) -> Result<Vec<cpobras_storage::procurement::QuoteResponse>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .quote_responses(request_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_quote_response(
    db: tauri::State<'_, Db>,
    response: cpobras_storage::procurement::QuoteResponse,
) -> Result<cpobras_storage::procurement::QuoteResponse, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_quote_response(&response)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_quote_files(
    db: tauri::State<'_, Db>,
    request_id: Uuid,
) -> Result<Vec<cpobras_storage::procurement::QuoteFile>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .quote_files(request_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn attach_quote_file(
    db: tauri::State<'_, Db>,
    response_id: Uuid,
    name: String,
    content: Vec<u8>,
) -> Result<Uuid, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .attach_quote_file(response_id, &name, &content)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn award_balances(
    db: tauri::State<'_, Db>,
    request_id: Uuid,
) -> Result<Vec<cpobras_storage::procurement::AwardBalance>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .award_balances(request_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn award_quotation(
    db: tauri::State<'_, Db>,
    request_id: Uuid,
    choices: Vec<cpobras_storage::procurement::AwardChoice>,
    due_date: String,
    contract_terms: Option<cpobras_storage::construction_workflow::ContractTerms>,
) -> Result<Vec<cpobras_storage::operations::Operation>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .award_quotation(request_id, &choices, &due_date, contract_terms)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_supplier_orders(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    kind: String,
) -> Result<Vec<cpobras_storage::procurement::SupplierOrder>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .supplier_orders(project_id, &kind)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn receive_material_order(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    order_id: Uuid,
    quantities: std::collections::BTreeMap<Uuid, rust_decimal::Decimal>,
) -> Result<cpobras_storage::operations::Operation, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .receive_material_order(project_id, order_id, &quantities)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn get_editable_quotation_request(
    db: tauri::State<'_, Db>,
    id: Uuid,
) -> Result<cpobras_storage::quotation_edits::EditableRequest, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .editable_quotation_request(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn update_quotation_request(
    db: tauri::State<'_, Db>,
    request: cpobras_storage::quotation_workflow::QuotationRequest,
    revision: u32,
) -> Result<cpobras_storage::quotation_edits::EditableRequest, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .update_quotation_request(&request, revision)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn hide_quote_response(
    db: tauri::State<'_, Db>,
    request_id: Uuid,
    id: Uuid,
    revision: u32,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .hide_quote_response(request_id, id, revision)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn add_quote_supplier(
    db: tauri::State<'_, Db>,
    request_id: Uuid,
    supplier_id: Uuid,
) -> Result<cpobras_storage::procurement::QuoteResponse, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .add_quote_supplier(request_id, supplier_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn record_supplier_movement(
    db: tauri::State<'_, Db>,
    movement: cpobras_storage::supplier_logistics::SupplierMovement,
) -> Result<cpobras_storage::supplier_logistics::SupplierMovement, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .record_supplier_movement(&movement)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_supplier_movements(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    order_id: Uuid,
) -> Result<Vec<cpobras_storage::supplier_logistics::SupplierMovement>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .supplier_movements(project_id, order_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn receive_material_order_with_proof(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    order_id: Uuid,
    quantities: std::collections::BTreeMap<Uuid, rust_decimal::Decimal>,
    proof: Option<cpobras_storage::supplier_logistics::Proof>,
) -> Result<cpobras_storage::operations::Operation, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .receive_material_order_with_proof(project_id, order_id, &quantities, proof)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn material_payment_with_proof(
    db: tauri::State<'_, Db>,
    operation: cpobras_storage::operations::Operation,
    proof: Option<cpobras_storage::supplier_logistics::Proof>,
) -> Result<cpobras_storage::operations::Operation, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .material_payment_with_proof(&operation, proof)
        .map_err(|e| e.to_string())
}
