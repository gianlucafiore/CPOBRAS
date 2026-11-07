use crate::p2p::P2p;
use serde_json::Value;
use uuid::Uuid;
#[tauri::command]
pub(crate) fn p2p_status(p2p: tauri::State<'_, P2p>) -> Result<Value, String> {
    p2p.status()
}
#[tauri::command]
pub(crate) async fn p2p_enable<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    p2p: tauri::State<'_, P2p>,
    enabled: bool,
) -> Result<Value, String> {
    p2p.set_enabled(&app, enabled).await
}
#[tauri::command]
pub(crate) async fn p2p_invite<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    p2p: tauri::State<'_, P2p>,
    project_id: Uuid,
    label: String,
) -> Result<Value, String> {
    p2p.invite(&app, project_id, label).await
}
#[tauri::command]
pub(crate) async fn p2p_join<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    p2p: tauri::State<'_, P2p>,
    invitation: String,
) -> Result<Value, String> {
    p2p.join(&app, &invitation).await
}
#[tauri::command]
pub(crate) async fn p2p_sync<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    p2p: tauri::State<'_, P2p>,
) -> Result<Value, String> {
    p2p.sync_all(&app).await
}
#[tauri::command]
pub(crate) fn p2p_revoke(p2p: tauri::State<'_, P2p>, id: Uuid) -> Result<Value, String> {
    p2p.revoke(id)
}
#[tauri::command]
pub(crate) fn p2p_forget(p2p: tauri::State<'_, P2p>, id: Uuid) -> Result<Value, String> {
    p2p.forget(id)
}
#[tauri::command]
pub(crate) fn p2p_read(p2p: tauri::State<'_, P2p>, id: Uuid) -> Result<Value, String> {
    p2p.read(id)
}
