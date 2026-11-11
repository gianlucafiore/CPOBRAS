// Knowledge used by the conversational budget copilot. Data comes from the
// active workspace; these descriptions are NOT permissions or database writes.
// Native Tauri commands and storage transactions remain the source of truth.
import {appKnowledgeContext} from './ai-app-knowledge.js';

export const AI_DOMAIN_VERSION = '2026-11-10.1';

export const AI_TOOL_CONTRACTS = Object.freeze({
  calculate_takeoff:{kind:'read',args:'shape, dimension_unit, count, length, width, height?, waste_percent?',effect:'Calcula geometría, sin guardar metrados'},
  audit_budget:{kind:'read',args:'',effect:'Examina partidas, ACU, precios faltantes y advertencias'},
  compare_estimates:{kind:'read',args:'baseline_id?',effect:'Compara versiones existentes de una obra'},
  search_catalog:{kind:'read',args:'query',effect:'Busca precios e insumos reales sin modificarlos'},
  manage_sections:{kind:'reviewed_write',args:'action=create|rename|delete|convert y nombres o referencias permitidas',effect:'Crea, renombra, borra o convierte rubros tras revisión; borrar rubro no borra partidas'},
  prepare_budget:{kind:'reviewed_write',args:'brief',effect:'Prepara partidas nuevas y ACU, con aprobación previa'},
  prepare_acu:{kind:'reviewed_write',args:'brief, scope=selected|all_missing',effect:'Prepara ACU de partidas existentes; no modifica cantidades sin autorización'},
  review_budget:{kind:'reviewed_write',args:'brief',effect:'Audita el presupuesto, clasifica partidas en rubros existentes y propone ACU con precios de biblioteca; una aprobación transaccional para cambios válidos'},
  describe_capabilities:{kind:'read',args:'module opcional',effect:'Explica los módulos y relaciones de CPObras sin modificar datos'},
  plan_workflow:{kind:'read',args:'goal',effect:'Construye un plan de operaciones entre módulos con dependencias, permisos y faltantes, sin ejecutarlo'},
  inspect_module:{kind:'read',args:'module',effect:'Consulta resúmenes reales de módulos con adaptadores explícitamente verificados'}
});

const DOMAIN=Object.freeze({
  presupuesto:'Contenedor de rubros y partidas, moneda y estado. Solo presupuestos propios en elaboración admiten modificaciones.',
  rubro:'Grupo jerárquico de partidas. No tiene cantidad, unidad ni ACU. Borrar rubro conserva partidas y subrubros.',
  partida:'Trabajo presupuestado con descripción, unidad, cantidad y costo unitario. Puede estar asignada a un rubro y vinculada a ACU y metrados.',
  acu:'Composición de insumos por unidad de partida. Cada consumo está expresado en la unidad exacta del insumo; su costo se calcula con precios vigentes del presupuesto o catálogo.',
  insumo:'Material, mano de obra, equipo o subcontrato de biblioteca. Precio tiene moneda, fecha y unidad. Ausencia de precio es diferente a cero.',
  metrado:'Dimensiones y cantidades de obra. No se reemplazan medidas existentes por inferencias de IA.',
  calculos:'Parcial de partida = cantidad × precio unitario; costo unitario ACU = suma(consumo por unidad × precio del insumo). Los cálculos los ejecuta CPOBRAS.',
  integridad:'La IA no escribe SQL ni elige IDs arbitrarios. Una vista previa es inmutable, se validan versiones y relaciones antes del commit; operaciones incorrectas quedan pendientes.'
});
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function budgetReviewIntent(question){
 const q=norm(question);
 return /\bpresupuesto\b/.test(q)
  &&/\b(?:revisa|revisar|audita|auditar|analiza|analizar)\b/.test(q)
  &&/\b(?:organiza|organizar|clasifica|clasificar|ordena|ordenar|reubica|reubicar)\b/.test(q)
  &&/\brubros?\b/.test(q)
  &&/\b(?:acus?|analisis de costos|composiciones?)\b/.test(q)
  &&/\b(?:completa|completar|arma|armar|genera|generar|carga|cargar)\b/.test(q);
}

export function aiDomainContext(state,question=''){
 const q=norm(question),review=budgetReviewIntent(question);
 const parts=review||/\b(?:partida|presupuesto|rubro|acu|insumo|metrado|precio|costo)\b/.test(q);
 const sections=Array.isArray(state.sections)?state.sections:[];
 const lines=Array.isArray(state.lines)?state.lines:[];
 const assignments=state.assignments||{};
 const withoutAcu=lines.filter(l=>!l.analysis_id&&!(l.components||[]).length);
 const ungrouped=lines.filter(l=>!assignments[l.id]&&!l.section_id);
 const concepts=parts?DOMAIN:{integridad:DOMAIN.integridad};
 const tools=Object.fromEntries(Object.entries(AI_TOOL_CONTRACTS).filter(([name])=>review||/\b(?:acu|composicion|insumos)\b/.test(q)?['review_budget','prepare_acu','manage_sections','audit_budget','search_catalog'].includes(name):true));
 const appContext=appKnowledgeContext(question,state);
 return 'MAPA OPERATIVO CPOBRAS (contratos descriptivos, no comandos ejecutables):\n'+JSON.stringify({
  version:AI_DOMAIN_VERSION,conceptos:concepts,herramientas:tools,
  estado:{presupuesto_id:state.estimateId||null,proyecto_id:state.projectId||null,partidas:lines.length,rubros:sections.length,sin_acu:withoutAcu.length,sin_rubro:ungrouped.length},
  restricciones:['No afirmar guardado sin resultado nativo confirmado','No inventar precio, ID, conversión ni unidad','Los faltantes quedan pendientes sin impedir otras propuestas válidas']
 })+'\n'+appContext;
}
