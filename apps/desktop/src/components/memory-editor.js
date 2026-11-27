import { uiText, uiHtml } from "../services/interface-language.js";
import {e} from "./helpers.js";
import {memoryHtml} from "../services/memory-markdown.js";

export function memoryEditor(value,{name="budget-memory",label=uiText("Memoria descriptiva"),rows=18,readonly=false,required=false}={}){
  const button=(action,text,title)=>`<button type="button" class="btn tiny" data-action="memory-format" data-format="${action}" aria-label="${title}" title="${title}" ${readonly?"disabled":""}>${text}</button>`;
  return `<div class="memory-editor" data-memory-editor><label class="memory-editor-label" for="memory-editor-${e(name)}">${e(label)}</label><div class="memory-toolbar" role="toolbar" aria-label="${uiHtml("Formato de la memoria")}">${button("heading",uiHtml("Título"),uiHtml("Título"))}${button("bold","<b>B</b>",uiHtml("Negrita (Ctrl+B)"))}${button("italic","<i>I</i>",uiHtml("Cursiva (Ctrl+I)"))}${button("bullet",uiHtml("• Lista"),uiHtml("Lista con viñetas"))}${button("numbered",uiHtml("1. Lista"),uiHtml("Lista numerada"))}<button type="button" class="btn tiny" data-action="memory-preview" aria-pressed="false">${uiHtml("Vista previa")}</button></div><textarea id="memory-editor-${e(name)}" name="${e(name)}" rows="${rows}" maxlength="25000" data-memory-required="${required}" ${readonly?"readonly":""} ${required?"required":""}>${e(value||"")}</textarea><section class="memory-formatted memory-editor-preview" aria-label="${uiHtml("Vista previa de la memoria descriptiva")}" hidden>${memoryHtml(value)}</section><p class="small-muted memory-editor-help">${uiHtml("Títulos, negrita, cursiva y listas. Podés usar la barra o escribir Markdown.")}</p></div>`;
}

function refresh(editor){
  const preview=editor.querySelector('.memory-editor-preview');
  if(preview&&!preview.hidden)preview.innerHTML=memoryHtml(editor.querySelector('textarea').value);
}

export function memoryEditorInput(target){
  const editor=target.closest?.('[data-memory-editor]');
  if(editor&&target.matches('textarea'))refresh(editor);
}

export function memoryEditorAction(button){
  const editor=button.closest?.('[data-memory-editor]');
  if(!editor||!['memory-format','memory-preview'].includes(button.dataset.action))return false;
  const textarea=editor.querySelector('textarea');
  if(button.dataset.action==='memory-preview'){
    const preview=editor.querySelector('.memory-editor-preview');preview.hidden=!preview.hidden;
    textarea.hidden=!preview.hidden;textarea.required=preview.hidden&&textarea.dataset.memoryRequired==='true';
    for(const control of editor.querySelectorAll('[data-format]'))control.disabled=!preview.hidden||textarea.readOnly;
    button.setAttribute('aria-pressed',String(!preview.hidden));button.textContent=preview.hidden?uiText("Vista previa"):uiText("Ver texto");refresh(editor);return true;
  }
  if(textarea.readOnly||textarea.disabled)return true;
  const {selectionStart:start,selectionEnd:end,value}=textarea,format=button.dataset.format;
  let from=start,to=end,replacement,selectionFrom,selectionTo;
  if(['bold','italic'].includes(format)){
    const marker=format==='bold'?'**':'*',selected=value.slice(start,end)||uiText("texto");
    let before=0,after=0;
    while(value[start-before-1]==='*')before++;
    while(value[end+after]==='*')after++;
    const wrapped=format==='bold'?before>=2&&after>=2:before%2===1&&after%2===1;
    if(wrapped){from-=marker.length;to+=marker.length;replacement=selected;selectionFrom=from;selectionTo=from+selected.length;}
    else{replacement=marker+selected+marker;selectionFrom=start+marker.length;selectionTo=selectionFrom+selected.length;}
  }else{
    from=start===0?0:value.lastIndexOf('\n',start-1)+1;
    const last=value.indexOf('\n',end>start&&value[end-1]==='\n'?end-1:end);to=last<0?value.length:last;
    const lines=value.slice(from,to).split('\n');
    replacement=lines.map((line,i)=>{
      const text=line.replace(/^\s*(?:#{1,3}\s+|[-+*]\s+|\d+[.)]\s+)/,'');
      return (format==='heading'?'## ':format==='numbered'?`${i+1}. `:'- ')+(text||uiText("Texto"));
    }).join('\n');selectionFrom=from;selectionTo=from+replacement.length;
  }
  if(value.length-(to-from)+replacement.length>textarea.maxLength&&textarea.maxLength>=0)return true;
  textarea.setRangeText(replacement,from,to,'select');textarea.focus();textarea.setSelectionRange(selectionFrom,selectionTo);
  textarea.dispatchEvent(new textarea.ownerDocument.defaultView.Event('input',{bubbles:true}));
  refresh(editor);return true;
}

export function memoryEditorKeydown(event){
  if(!(event.ctrlKey||event.metaKey)||event.altKey||!['b','i'].includes(event.key.toLowerCase()))return false;
  const editor=event.target.closest?.('[data-memory-editor]');
  if(!editor||event.target.tagName!=='TEXTAREA'||event.target.readOnly)return false;
  event.preventDefault();
  return memoryEditorAction(editor.querySelector(`[data-format="${event.key.toLowerCase()==='b'?'bold':'italic'}"]`));
}
