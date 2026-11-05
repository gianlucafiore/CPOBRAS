import { e } from "./helpers.js";
const pages={
 projects:["Obras y presupuestos","Creá una obra y abrila para trabajar con sus presupuestos. Antes necesitás registrar al comitente en Clientes."],
 clients:["Clientes","Registrá a quienes te contratan. Después podrás elegirlos al crear una obra; los contactos y datos ampliados están en Organización."],
 resources:["Catálogo de insumos","Cargá materiales, mano de obra, equipos y subcontratos con su unidad y precio. Luego asignálos desde la pestaña Insumos de una partida."],
 analyses:["Biblioteca de ACU","Un ACU es una receta reutilizable de insumos por unidad de trabajo. Crealo con componentes y usalo en «Desde ACU». También podés cargar insumos directamente en una partida."],
 workspace:["Trabajar con el presupuesto","Seleccioná un rubro antes de agregar partidas. Arrastrá el asa ⋮⋮ para ordenarlas o moverlas a otro rubro. Doble clic o clic derecho para editar; en Insumos podés construir su precio."],
 "budget-tools":["Herramientas del presupuesto","Editá varias partidas, creá plantillas o importá y exportá archivos. Guardar edición masiva aplica todos los cambios juntos; importar crea un presupuesto nuevo."],
 costing:["Costos y precios","Primero creá una lista con moneda, zona y vigencia, y registrá precios. Después elegí un ACU compuesto para calcular costos o comparar escenarios; las conversiones requieren cotización explícita."],
 planning:["Planificación de la obra","Elegí una obra, configurá calendario y feriados y agregá tareas. Vinculalas con partidas, asigná recursos y guardá una línea base para comparar fechas, costos y avances."],
 management:["Organización y directorios","Elegí el directorio que querés completar. Empezá por Empresas; luego vinculá establecimientos, responsables, contratos y centros de costos con sus obras."],
 backups:["Copias de seguridad","Creá una copia antes de cambios importantes. Restaurar recupera los datos guardados y conserva primero una copia del estado actual."]
};
const panels={
 acu:["Composición de la partida","Acá ves los insumos por unidad y el precio calculado. «Editar insumos» crea una composición propia de esta partida, sin cambiar otras partidas ni la biblioteca."],
 resources:["Asignar insumos","Seleccioná una partida de la grilla y pulsá Asignar en el insumo que necesites. Ajustá el consumo por unidad y el precio; al guardar se recalcula su precio unitario."],
 takeoffs:["Metrados","Cargá factor, largo, ancho y alto. Usá Descontar para huecos o aberturas; «Aplicar cantidad medida» lleva el resultado a la partida seleccionada."],
 summary:["Resumen económico","Revisá costo directo, gastos, beneficio e impuestos. Los cambios solo se permiten en borrador; al emitir el presupuesto queda bloqueado."]
};
export function helpBox(key,panel=false){const [title,text]=(panel?panels:pages)[key]||pages.projects;return `<aside class="context-help ${panel?"panel-help":""}" aria-label="Ayuda: ${e(title)}"><span aria-hidden="true">ⓘ</span><div><strong>${e(title)}</strong><p>${e(text)}</p></div></aside>`;}
