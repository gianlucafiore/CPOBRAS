import { e } from "./helpers.js";
const pages = {
  "system-settings": [
    "Datos generales",
    "Administrá las unidades, monedas y cotizaciones compartidas por las obras. Estos datos están disponibles para reutilizarlos al preparar insumos, ACU y presupuestos.",
  ],
  organizations: [
    "Organizaciones",
    "Elegí una organización propia o consultá una externa de solo lectura. Sus datos públicos, logotipo y directorios están dentro de la misma ficha. La predeterminada se preselecciona solo al crear obras nuevas.",
  ],
  "budget-printing": [
    "Imprimir presupuesto",
    "Elegí presentación para cliente, interna o planilla de incidencias. Los campos se guardan al salir de ellos y antes de generar. Elegí si incluís la memoria descriptiva del presupuesto. El PDF se guarda y se abre en el lector predeterminado del sistema.",
  ],
  "price-determination": [
    "Determinación de precio",
    "Activá y ordená conceptos para pasar del costo directo al precio final. Cada línea puede usar porcentaje, monto o detalle. Los cambios se guardan automáticamente. Revisá el indicador de guardado y los errores antes de salir.",
  ],
  portfolio: [
    "Cartera global de obras",
    "Resumen de todas las obras desde Inicio. Se usa el último presupuesto emitido de cada una, o el último borrador si no hay emitidos. Para trabajar, volvé a Inicio y abrí la obra correspondiente.",
  ],
  operations: [
    "Gestión de obra: materiales, subcontrataciones, libro y finanzas",
    "La obra abierta se conserva en todas las pestañas. Cada apartado muestra sus propias tareas; en Finanzas, «Consultar al» define la fecha de los informes. Usá las pestañas para recorrer cada etapa y registrar documentos vinculados. El tablero reúne esta obra y los informes se exportan a Excel o PDF.",
  ],
  projects: [
    "Obras y presupuestos",
    "Inicio reúne los datos base y las obras. Abrí una obra para trabajar con sus presupuestos. Elegí su cliente al crearla, o creá uno desde esa misma ventana. Clientes y Proveedores se administran desde Inicio. A la derecha podés cargar recordatorios manuales de compras, certificados y solicitudes de presupuesto.",
  ],
  suppliers: [
    "Proveedores",
    "Gestioná personas que suministran materiales o servicios. Importar desde Clientes agrega la función de proveedor al mismo contacto, conservando una única identidad. Las coincidencias ayudan a evitar duplicados.",
  ],
  clients: [
    "Clientes",
    "Registrá a quienes te contratan. Podés incorporarlos desde Proveedores sin duplicar datos, o crearlos desde la obra si todavía no existen. Una persona puede cumplir ambas funciones.",
  ],
  resources: [
    "Catálogo de insumos",
    "Cargá materiales, mano de obra, equipos y subcontratos con su unidad y precio. Luego asignálos desde la pestaña Insumos de una partida. Las listas e historial de precios están en el desplegable al pie.",
  ],
  analyses: [
    "Biblioteca de ACU",
    "Un ACU es una receta reutilizable de insumos por unidad de trabajo. Crealo con componentes y usalo en «Desde ACU». También podés cargar insumos directamente en una partida. Al pie están los ACU compuestos y la comparación de costos, en una sección desplegable.",
  ],
  workspace: [
    "Trabajar con el presupuesto",
    "Seleccioná un rubro antes de agregar partidas. Arrastrá el asa ⋮⋮ para ordenarlas o moverlas a otro rubro. Los rubros también tienen un asa para reordenar su bloque completo (Alt + ↑/↓ con teclado). Doble clic o clic derecho para editar; en Insumos podés construir su precio.",
  ],
  "budget-tools": [
    "Herramientas del presupuesto",
    "Exportá el presupuesto para el cliente o un respaldo completo con ACU, insumos y metrados en Excel o PDF. En edición avanzada podés modificar partidas, importar y crear plantillas.",
  ],
  costing: [
    "Costos y precios",
    "Biblioteca general administrada desde Inicio. Primero creá una lista con moneda, zona y vigencia, y registrá precios. Después elegí un ACU compuesto para calcular costos o comparar escenarios; las conversiones requieren cotización explícita.",
  ],
  planning: [
    "Planificación de la obra",
    "Gantt y PERT son dos vistas del mismo cronograma. En PERT arrastrá partidas al lienzo y conectá salida con entrada para definir precedencias. Mover un nodo solo cambia su posición visual. Configurá el calendario y guardá líneas base para comparar avances.",
  ],
  "project-data": [
    "Proyecto",
    "Consultá los datos físicos, ubicación, presupuestos y legajos del proyecto. Elegí un presupuesto o creá uno nuevo para trabajar en su desglose, precio, planificación y gestión. Los clientes y datos generales se administran desde Inicio.",
  ],
  management: [
    "Organización y directorios",
    "Elegí el directorio que querés completar. Empezá por Empresas; luego vinculá establecimientos, responsables, contratos y centros de costos con sus obras.",
  ],
  sharing: ["Vinculación P2P", "Compartí una obra propia mediante una invitación para un observador de solo lectura. Las actualizaciones llegan cuando ambos equipos están conectados. Las copias recibidas siguen disponibles sin conexión."],
  backups: [
    "Copias de seguridad",
    "Elegí una carpeta fija y activá respaldos automáticos mientras el programa esté abierto. Una carpeta sincronizada permite que tu aplicación de nube los suba. Restaurar conserva antes una copia del estado actual.",
  ],
};
const panels = {
  memory: ["Memoria descriptiva", "Presentación pública del presupuesto con títulos, negrita, cursiva y listas. Se guarda automáticamente. Elegí un documento con memoria para imprimirla al comienzo; la cotización se anexa desde una página nueva."],
  "direct-costs": [
    "Gastos Directos del presupuesto",
    "Definí el plazo estimado de obra, inicialmente 6 meses. Los gastos mensuales usan ese plazo; marcá «Usar meses distintos» para indicar una duración propia por insumo. Los gastos puntuales se suman una vez. El plazo también se usa en los gastos indirectos vinculados de Determinación de precio. Los cambios se guardan automáticamente.",
  ],
  acu: [
    "Composición de la partida",
    "Acá ves los insumos por unidad y el precio calculado. «Agregar insumo» abre un formulario individual. Doble clic o Editar para cambiar un insumo. Su precio se comparte en este presupuesto; cada partida conserva su rendimiento.",
  ],
  resources: [
    "Insumos del presupuesto",
    "Esta lista muestra las cantidades y precios totales de los insumos de todo el presupuesto. Para agregar o modificar insumos, usá el ACU de la partida correspondiente o la pestaña Gastos Directos.",
  ],
  takeoffs: [
    "Metrados",
    "Cargá factor, largo, ancho y alto. Usá Descontar para huecos o aberturas. Al guardar la medición se actualiza la cantidad de la partida.",
  ],
  summary: [
    "Resumen económico",
    "Revisá costo directo, gastos, beneficio e impuestos. Los cambios solo se permiten en borrador; al emitir el presupuesto queda bloqueado. Para corregirlo, usá «Volver a En elaboración» en Presupuesto.",
  ],
};
export function helpBox(key, panel = false) {
  const [title, text] = (panel ? panels : pages)[key] || pages.projects;
  return `<aside class="context-help ${panel ? "panel-help" : ""}" aria-label="Ayuda: ${e(title)}"><span aria-hidden="true">ⓘ</span><div><strong>${e(title)}</strong><p>${e(text)}</p></div></aside>`;
}
