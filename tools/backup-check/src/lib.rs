//! Exercise the production backup manager without a desktop or WebView dependency.
#![allow(dead_code)]
type Db = std::sync::Mutex<cpobras_storage::LocalStore>;
#[path = "../../../apps/desktop/src-tauri/src/backups.rs"]
mod backups;
