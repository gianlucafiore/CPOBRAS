mod commands;

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
            app.manage(BackupDirectory(backups));
            app.manage(Mutex::new(store));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar CPOBRAS");
}

pub(crate) fn configure<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        commands::budget_tools::export_budget_document,
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
        commands::planning::get_project_plan,
        commands::planning::save_project_plan,
        commands::planning::calculate_schedule,
        commands::planning::create_plan_baseline,
        commands::planning::list_plan_baselines,
        commands::planning::list_plan_revisions,
        commands::maintenance::verify_database,
        commands::maintenance::write_export,
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
        commands::resources::list_resources,
        commands::resources::create_resource,
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
