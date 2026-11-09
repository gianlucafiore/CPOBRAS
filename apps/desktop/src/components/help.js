import { e } from "./helpers.js";
const pages = {
  organizations: [
    "Organizaciones",
    "Elegí una organización propia o consultá una externa de solo lectura. Sus datos públicos, logotipo y directorios están dentro de la misma ficha. La predeterminada se preselecciona solo al crear obras nuevas.",
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
    "Gestión de obra: materiales, subcontrataciones, libro y finanzas",
    "La obra abierta se conserva en todas las pestañas. Cada apartado muestra sus propias tareas; en Finanzas, «Consultar al» define la fecha de los informes. Usá las pestañas para recorrer cada etapa y registrar documentos vinculados. El tablero reúne esta obra y los informes se exportan a Excel o PDF.",
  ],
  projects: [
    "Obras y presupuestos",
    "Inicio reúne los datos base y las obras. Abrí una obra para trabajar con sus presupuestos. Elegí su cliente al crearla, o creá uno desde esa misma ventana. Clientes y Proveedores se administran desde Inicio.",
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
  acu: [
    "Composición de la partida",
    "Acá ves los insumos por unidad y el precio calculado. «Agregar insumo» abre un formulario individual. Doble clic o Editar para cambiar un insumo. Su precio se comparte en este presupuesto; cada partida conserva su rendimiento.",
  ],
  resources: [
    "Insumos del presupuesto",
    "Esta lista reúne solo los insumos usados por las partidas del presupuesto actual. Seleccioná una partida y pulsá Asignar para reutilizar uno. Con «Agregar insumo» podés buscar otros en la biblioteca. Ajustá su consumo por unidad y precio en el formulario.",
  ],
  takeoffs: [
    "Metrados",
    "Cargá factor, largo, ancho y alto. Usá Descontar para huecos o aberturas; «Aplicar cantidad medida» lleva el resultado a la partida seleccionada.",
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
