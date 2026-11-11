const fold = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Persist conversational data only. A restored intent never carries approval,
// prepared batches, credentials or executable model output.
export function conversationStore(storage, projectId, estimateId) {
 const key = 'cpobras:conversation:v1:' + JSON.stringify([projectId, estimateId]);
 return {
  read() {
   try {
    const value = JSON.parse(storage?.getItem(key) || 'null');
    if (value?.version !== 1 || Date.now() - value.updated > 86400000) return null;
    const intent = value.intent;
    if (intent && (intent.mode !== 'fill' || !Array.isArray(intent.lineIds) || intent.lineIds.length !== 1 || typeof intent.lineIds[0] !== 'string' || typeof intent.brief !== 'string' || intent.brief.length > 3000)) return null;
    if (intent?.operation && !['append','productivity'].includes(intent.operation)) return null;
    return {messages: (value.messages || []).slice(-10).filter(m => ['user','assistant'].includes(m.role) && typeof m.content === 'string').map(m => ({role:m.role, content:m.content.slice(0,4000)})), intent};
   } catch { return null; }
  },
  write(messages, intent) {
   try { storage?.setItem(key, JSON.stringify({version:1, updated:Date.now(), messages:messages.slice(-10).map(m => ({role:m.role, content:String(m.content || m.answer || '').slice(0,4000)})), intent:intent ? {mode:'fill', lineIds:[...intent.lineIds], brief:intent.brief.slice(0,3000), ...(intent.operation ? {operation:intent.operation} : {})} : null})); } catch { /* Storage may be disabled or full. */ }
  },
  clear() { try { storage?.removeItem(key); } catch {} }
 };
}

export function conversationAcuRequest(question, state, intent) {
 const q = fold(question);
 if (/[¿?]/.test(question) || /^(?:no|nunca|cancelar|cancela|descarta)\b/.test(q)) return null;
 const selected = /\b(?:partida seleccionada|partida actual|esta partida)\b/.test(q);
 const generate = /\b(?:genera|generar|generame|prepara|preparar|arma|armar)\b.*\bacu\b/.test(q);
 if (generate && selected) {
  const line = state.lines.find(l => l.id === state.selectedLineId);
  return line ? {mode:'fill', lineIds:[line.id], brief:question.slice(0,3000)} : {error:'Seleccioná una partida existente para preparar su ACU.'};
 }
 if (!intent) return null;
 const continuation = /^(?:(?:bueno|dale|si|ok|perfecto)\s+)*(?:generalo|generala|preparalo|reintenta|reintentar|intenta de nuevo|cargalos|cargalo|guardalos|guardalo)$/.test(q);
 const criteria = /^(?:usa|usar|utiliza|utilizar|con|inclui|incluye)\b/.test(q);
 const affirmation = /^(?:si|dale|adelante|de acuerdo)$/.test(q);
 if (!continuation && !criteria && !affirmation) return null;
 if (!state.lines.some(l => l.id === intent.lineIds[0])) return {error:'La partida pendiente ya no está disponible. Elegí un destino explícito.'};
 return {...intent, lineIds:[...intent.lineIds], brief:criteria ? (intent.brief + '\nCriterios del usuario: ' + question).slice(-3000) : intent.brief};
}

export function structuredConversationContext(state, intent) {
 const selectedLine=state.lines.find(l => l.id === state.selectedLineId);
 return {projectId:state.projectId, estimateId:state.estimateId, tab:state.panel, view:state.view,
  selectedLineId:state.selectedLineId, selectedLine:selectedLine ? {id:selectedLine.id,description:selectedLine.description,unit:selectedLine.unit,quantity:selectedLine.quantity,analysisId:selectedLine.analysis_id,sectionId:selectedLine.section_id,components:(selectedLine.components||[]).slice(0,60)} : null,
  selectedSectionId:state.selectedSectionId || null, pendingIntent:intent,
  destinationChanged:!!intent && state.selectedLineId !== intent.lineIds[0]};
}
