import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./style.css";
import "./themes.css";
import { createWorkspaceApp } from "./app.js";
import { uiText } from "./services/interface-language.js";
import { showAvailableRelease } from "./components/release-notice.js";

const legacyAi = import.meta.env.DEV && import.meta.env.VITE_TEST_AI === "1";
const app=createWorkspaceApp({
  invoke, databaseSwitching:true, aiActionsEnabled:true, aiEnabled:legacyAi, aiHelpEnabled:!legacyAi,
});
void app.ready.then(() => showAvailableRelease(invoke, document));
let closing=false;
if(window.__TAURI_INTERNALS__?.metadata?.currentWindow){
 const desktopWindow=getCurrentWindow();
 const updateTitle=()=>{void desktopWindow.setTitle(uiText("CPOBRAS — Gestión de obras")).catch(()=>{});};
 updateTitle();
 new MutationObserver(updateTitle).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
 desktopWindow.onCloseRequested(async event=>{
  event.preventDefault();if(closing)return;closing=true;
  try{if(await app.flushPending())await desktopWindow.destroy();}finally{closing=false;}
});
}
