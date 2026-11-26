import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./style.css";
import "./themes.css";
import { createWorkspaceApp } from "./app.js";
import { showAvailableRelease } from "./components/release-notice.js";

const app=createWorkspaceApp({ invoke, databaseSwitching: true, aiEnabled: import.meta.env.DEV && import.meta.env.VITE_TEST_AI === "1" });
void app.ready.then(() => showAvailableRelease(invoke, document));
let closing=false;
if(window.__TAURI_INTERNALS__?.metadata?.currentWindow)getCurrentWindow().onCloseRequested(async event=>{
  event.preventDefault();if(closing)return;closing=true;
  try{if(await app.flushPending())await getCurrentWindow().destroy();}finally{closing=false;}
});
