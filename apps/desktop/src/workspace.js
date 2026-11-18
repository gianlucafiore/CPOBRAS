import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./style.css";
import { createWorkspaceApp } from "./app.js";

const app=createWorkspaceApp({ invoke, databaseSwitching: true });
let closing=false;
if(window.__TAURI_INTERNALS__?.metadata?.currentWindow)getCurrentWindow().onCloseRequested(async event=>{
  event.preventDefault();if(closing)return;closing=true;
  try{if(await app.flushPending())await getCurrentWindow().destroy();}finally{closing=false;}
});
