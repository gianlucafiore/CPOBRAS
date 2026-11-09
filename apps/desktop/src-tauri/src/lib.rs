mod backups;
mod commands;
mod p2p;
mod system_open;

use cpobras_storage::LocalStore;
use std::sync::Mutex;
use tauri::Manager;

type Db = Mutex<LocalStore>;
struct BackupDirectory(std::path::PathBuf);

pub fn run() {
    configure(tauri::Builder::default())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let store = LocalStore::open(directory.join("cpobras.sqlite"))
                .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
            let backups = directory.join("backups");
            std::fs::create_dir_all(&backups)?;
            app.manage(Mutex::new(
                backups::BackupManager::load(backups.clone()).map_err(std::io::Error::other)?,
            ));
            app.manage(BackupDirectory(backups));
            app.manage(Mutex::new(store));
            app.manage(p2p::P2p::load(directory.join("p2p")).map_err(std::io::Error::other)?);
            p2p::start_worker(app.handle().clone());
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                if let (Some(backups), Some(db)) = (
                    handle.try_state::<backups::Backups>(),
                    handle.try_state::<Db>(),
                ) {
                    if let Ok(mut manager) = backups.lock() {
                        manager.tick(&db, backups::now());
                    }
                }
                std::thread::sleep(std::time::Duration::from_secs(60));
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar CPOBRAS");
}

pub(crate) fn configure<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::p2p::p2p_status,
            commands::p2p::p2p_projects,
            commands::p2p::p2p_set_permissions,
            commands::p2p::p2p_enable,
            commands::p2p::p2p_invite,
            commands::p2p::p2p_join,
            commands::p2p::p2p_sync,
            commands::p2p::p2p_revoke,
            commands::p2p::p2p_forget,
            commands::p2p::p2p_read,
            commands::persons::list_persons,
            commands::persons::save_person,
            commands::persons::add_person_role,
            commands::persons::find_similar_persons,
            commands::organizations::list_organizations,
            commands::organizations::get_organization,
            commands::organizations::create_organization,
            commands::organizations::save_organization,
            commands::organizations::set_default_organization,
            commands::printing::get_print_profile,
            commands::printing::save_print_profile,
            commands::printing::get_budget_print_data,
            commands::printing::open_export_pdf,
            commands::price_determination::get_price_definition,
            commands::price_determination::calculate_price_definition,
            commands::price_determination::save_price_definition,
            commands::price_determination::list_price_templates,
            commands::price_determination::save_price_template,
            commands::operations::list_operations,
            commands::operations::post_operation,
            commands::site_workflow::get_editable_quotation_request,
            commands::site_workflow::update_quotation_request,
            commands::site_workflow::hide_quote_response,
            commands::site_workflow::add_quote_supplier,
            commands::project_dashboard::open_quote_file,
            commands::project_dashboard::open_operation_file,
            commands::site_workflow::list_site_entries,
            commands::site_workflow::save_site_entry,
            commands::site_workflow::confirm_site_entry,
            commands::site_workflow::print_site_entries,
            commands::site_workflow::open_next_client_certificate,
            commands::site_workflow::list_quote_responses,
            commands::site_workflow::save_quote_response,
            commands::site_workflow::list_quote_files,
            commands::site_workflow::attach_quote_file,
            commands::site_workflow::award_balances,
            commands::site_workflow::award_quotation,
            commands::site_workflow::list_supplier_orders,
            commands::site_workflow::receive_material_order,
            commands::site_workflow::record_supplier_movement,
            commands::site_workflow::revise_subcontract,
            commands::site_workflow::list_supplier_movements,
            commands::site_workflow::receive_material_order_with_proof,
            commands::site_workflow::material_payment_with_proof,
            commands::operations::list_certificate_drafts,
            commands::operations::open_certificate_draft,
            commands::operations::save_certificate_draft,
            commands::operations::preview_certificate_draft,
            commands::operations::calculate_certificate_preview,
            commands::operations::certificate_editor_sheet,
            commands::operations::issue_certificate_draft,
            commands::operations::issued_certificate_sheet,
            commands::operations::available_progress,
            commands::operations::create_quotation_request,
            commands::operations::list_quotation_requests,
            commands::operations::preview_quotation_import,
            commands::operations::list_warehouses,
            commands::operations::create_warehouse,
            commands::operations::stock_balances,
            commands::operations::operations_report,
            commands::operations::operations_portfolio,
            commands::budget_tools::export_budget_document,
            commands::budget_tools::get_pattern_document,
            commands::budget_tools::get_estimate_resource_prices,
            commands::budget_tools::save_budget_pattern,
            commands::budget_tools::apply_budget_pattern,
            commands::budget_tools::import_budget_document,
            commands::budget_tools::save_budget_template,
            commands::budget_tools::list_budget_templates,
            commands::budget_tools::edit_budget_lines,
            commands::budget_tools::move_budget_line,
            commands::budget_tools::save_line_resources,
            commands::budget_tools::duplicate_budget_line,
            commands::budget_tools::set_line_formula,
            commands::costing::list_price_lists,
            commands::costing::create_price_list,
            commands::costing::register_scoped_price,
            commands::costing::scoped_price_history,
            commands::costing::list_nested_analyses,
            commands::costing::save_nested_analysis,
            commands::costing::calculate_nested_cost,
            commands::costing::save_fx_quote,
            commands::costing::list_fx_quotes,
            commands::costing::convert_currency,
            commands::costing::reprice_analysis_selective,
            commands::management::list_management_records,
            commands::management::save_management_record,
            commands::management::list_change_events,
            commands::system_settings::get_general_calendar,
            commands::system_settings::save_general_calendar,
            commands::system_settings::list_index_points,
            commands::system_settings::save_index_point,
            commands::system_settings::get_adjustment_agreement,
            commands::system_settings::save_adjustment_agreement,
            commands::system_settings::certificate_index_preview,
            commands::system_settings::pending_adjustment_differences,
            commands::system_settings::certification_overview,
            commands::planning::get_project_plan,
            commands::planning::save_project_plan,
            commands::planning::calculate_schedule,
            commands::planning::create_plan_baseline,
            commands::planning::list_plan_baselines,
            commands::planning::list_plan_revisions,
            commands::maintenance::choose_backup_folder,
            commands::maintenance::get_backup_settings,
            commands::maintenance::save_backup_settings,
            commands::maintenance::open_backup_folder,
            commands::maintenance::verify_database,
            commands::maintenance::write_export,
            commands::maintenance::save_export_file,
            commands::maintenance::create_backup,
            commands::maintenance::list_backups,
            commands::maintenance::restore_backup,
            commands::clients::list_clients,
            commands::clients::create_client,
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::budgets::list_project_estimates,
            commands::budgets::create_estimate,
            commands::budgets::list_estimate_lines,
            commands::budgets::add_estimate_line,
            commands::budgets::update_estimate_line,
            commands::budgets::delete_estimate_line,
            commands::budgets::estimate_total,
            commands::budgets::duplicate_estimate,
            commands::budgets::issue_estimate,
            commands::project_dashboard::list_measured_lines,
            commands::project_dashboard::get_estimate_metadata,
            commands::project_dashboard::list_project_attachments,
            commands::project_dashboard::add_project_attachment,
            commands::project_dashboard::remove_project_attachment,
            commands::project_dashboard::open_project_attachment,
            commands::budgets::reopen_estimate,
            commands::budgets::save_line_as_analysis,
            commands::resources::list_resources,
            commands::resources::create_resource,
            commands::resources::import_resources,
            commands::analyses::list_analyses,
            commands::analyses::create_analysis,
            commands::analyses::update_analysis,
            commands::resources::update_resource,
            commands::budgets::refresh_draft_analysis_costs,
            commands::budgets::add_line_from_analysis,
            commands::resources::list_price_history,
            commands::resources::register_resource_price,
            commands::analyses::reprice_analysis,
            commands::sections::save_budget_section,
            commands::sections::list_budget_sections,
            commands::sections::list_line_sections,
            commands::analyses::get_analysis_details,
            commands::sections::assign_line_section,
            commands::budgets::get_estimate_pricing,
            commands::budgets::save_estimate_pricing,
            commands::budgets::priced_estimate_total,
            commands::measurements::save_takeoff,
            commands::measurements::list_takeoffs,
            commands::measurements::apply_takeoff,
            commands::measurements::delete_takeoff,
            commands::analyses::analysis_cost_breakdown,
            commands::analyses::compare_contracting,
            commands::budgets::compare_estimates,
        ])
}

#[cfg(test)]
mod tests;
