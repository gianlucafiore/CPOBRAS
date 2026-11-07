import { e } from "./helpers.js";
const pages = {
  "print-profile": [
    "Datos públicos de impresión",
    "Configurá la identidad de la empresa o profesional, el logotipo y los datos que querés publicar. Solo esta ficha se imprime automáticamente; los directorios internos se conservan por separado.",
  ],
  "budget-printing": [
    "Imprimir presupuesto",
    "Elegí presentación para cliente, interna o planilla de incidencias. El PDF se guarda y se solicita abrirlo en el lector predeterminado del sistema. Revisá condiciones públicas y versión antes de generar.",
  ],
  "price-determination": [
    "Determinación de precio",
    "Activá y ordená conceptos para pasar del costo directo al precio final. Cada línea puede usar porcentaje, monto o detalle. Revisá la vista previa y guardá la determinación antes de salir.",
  ],
  portfolio: [
    "Cartera global de obras",
    "Resumen de todas las obras desde Inicio. Se usa el último presupuesto emitido de cada una, o el último borrador si no hay emitidos. Para trabajar, volvé a Inicio y abrí la obra correspondiente.",
  ],
  operations: [
    "Gestión de obra: compras, producción, certificaciones y finanzas",
    "La obra abierta se conserva en todas las pestañas. El presupuesto activo y la fecha de corte definen el informe. Usá las pestañas para recorrer cada etapa y registrar documentos vinculados. El tablero reúne esta obra y los informes se exportan a Excel o PDF.",
  ],
  projects: [
    "Obras y presupuestos",
    "Inicio reúne los datos base y las obras. Abrí una obra para trabajar con sus presupuestos. Antes necesitás registrar al comitente en Clientes.",
  ],
  clients: [
    "Clientes",
    "Registrá a quienes te contratan. Después podrás elegirlos al crear una obra; los contactos y datos ampliados están en Organización.",
  ],
  resources: [
    "Catálogo de insumos",
    "Cargá materiales, mano de obra, equipos y subcontratos con su unidad y precio. Luego asignálos desde la pestaña Insumos de una partida.",
  ],
  analyses: [
    "Biblioteca de ACU",
    "Un ACU es una receta reutilizable de insumos por unidad de trabajo. Crealo con componentes y usalo en «Desde ACU». También podés cargar insumos directamente en una partida.",
  ],
  workspace: [
    "Trabajar con el presupuesto",
    "Seleccioná un rubro antes de agregar partidas. Arrastrá el asa ⋮⋮ para ordenarlas o moverlas a otro rubro. Doble clic o clic derecho para editar; en Insumos podés construir su precio.",
  ],
  "budget-tools": [
    "Herramientas del presupuesto",
    "Editá varias partidas, creá plantillas o importá y exportá archivos. Guardar edición masiva aplica todos los cambios juntos; importar crea un presupuesto nuevo.",
  ],
  costing: [
    "Costos y precios",
    "Biblioteca general administrada desde Inicio. Primero creá una lista con moneda, zona y vigencia, y registrá precios. Después elegí un ACU compuesto para calcular costos o comparar escenarios; las conversiones requieren cotización explícita.",
  ],
  planning: [
    "Planificación de la obra",
    "El cronograma pertenece a la obra abierta. Configurá calendario y feriados y agregá tareas. Vinculalas con partidas, asigná recursos y guardá una línea base para comparar fechas, costos y avances.",
  ],
  "project-data": [
    "Datos de la obra",
    "Estas fichas, contratos, centros de costos, documentación y cuadrillas pertenecen a la obra abierta. Los clientes y demás datos base se administran desde Inicio.",
  ],
  management: [
    "Organización y directorios",
    "Elegí el directorio que querés completar. Empezá por Empresas; luego vinculá establecimientos, responsables, contratos y centros de costos con sus obras.",
  ],
  backups: [
    "Copias de seguridad",
    "Creá una copia antes de cambios importantes. Restaurar recupera los datos guardados y conserva primero una copia del estado actual.",
  ],
};
const panels = {
  acu: [
    "Composición de la partida",
    "Acá ves los insumos por unidad y el precio calculado. «Agregar insumo» abre un formulario individual. Doble clic o Editar para cambiar un insumo. Su precio se comparte en este presupuesto; cada partida conserva su rendimiento.",
  ],
  resources: [
    "Asignar insumos",
    "Seleccioná una partida de la grilla y pulsá Asignar en el insumo que necesites. Ajustá el consumo por unidad y el precio en el formulario individual. Al guardar se recalcula la partida.",
  ],
  takeoffs: [
    "Metrados",
    "Cargá factor, largo, ancho y alto. Usá Descontar para huecos o aberturas; «Aplicar cantidad medida» lleva el resultado a la partida seleccionada.",
  ],
  summary: [
    "Resumen económico",
    "Revisá costo directo, gastos, beneficio e impuestos. Los cambios solo se permiten en borrador; al emitir el presupuesto queda bloqueado.",
  ],
};
export function helpBox(key, panel = false) {
  const [title, text] = (panel ? panels : pages)[key] || pages.projects;
  return `<aside class="context-help ${panel ? "panel-help" : ""}" aria-label="Ayuda: ${e(title)}"><span aria-hidden="true">ⓘ</span><div><strong>${e(title)}</strong><p>${e(text)}</p></div></aside>`;
}
