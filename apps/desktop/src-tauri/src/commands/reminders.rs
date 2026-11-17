use crate::Db;
use cpobras_storage::reminders::{Reminder, ReminderInput, ReminderPage};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_reminders(
    db: tauri::State<'_, Db>,
    today: String,
    page: u32,
) -> Result<ReminderPage, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .reminders(&today, page)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_reminder(
    db: tauri::State<'_, Db>,
    reminder: ReminderInput,
) -> Result<Reminder, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_reminder(&reminder)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn delete_reminder(
    db: tauri::State<'_, Db>,
    id: Uuid,
    revision: u32,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .delete_reminder(id, revision)
        .map_err(|e| e.to_string())
}
