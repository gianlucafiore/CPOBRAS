use crate::Db;
use cpobras_storage::persons::{Person, PersonInput, PersonMatch};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_persons(db: tauri::State<'_, Db>, role: String) -> Result<Vec<Person>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .persons(&role)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_person(
    db: tauri::State<'_, Db>,
    id: Option<Uuid>,
    revision: u32,
    role: String,
    person: PersonInput,
) -> Result<Person, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_person(id, revision, &role, &person)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn add_person_role(
    db: tauri::State<'_, Db>,
    id: Uuid,
    revision: u32,
    role: String,
) -> Result<Person, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .add_person_role(id, revision, &role)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn find_similar_persons(
    db: tauri::State<'_, Db>,
    person: PersonInput,
    exclude_id: Option<Uuid>,
) -> Result<Vec<PersonMatch>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .similar_persons(&person, exclude_id)
        .map_err(|e| e.to_string())
}
