import { invoke } from "@tauri-apps/api/core";
import "./style.css";
import { createWorkspaceApp } from "./app.js";

createWorkspaceApp({ invoke, databaseSwitching: true });
