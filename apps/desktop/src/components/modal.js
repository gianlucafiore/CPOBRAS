import { resourcePicker } from "./resource-picker.js";
import { money, numeric, sumDecimals, absoluteDecimal } from "../decimal.js";
import {
  e,
  dateToday,
  kindName,
  kindBadge,
  field,
  select,
  btn,
} from "./helpers.js";

export function createModalRenderer({
  state,
  currentProject,
  currentEstimate,
  currentLine,
  editable,
  projectName,
  clientName,
  locked,
}) {
  function modalMarkup() {
    const modal = state.modal;
    const kind = modal.kind,
      item = modal.record || {};
    let title = "",
      body = "",
      wide = false;
    const projectOptions = state.clients.filter(c=>c.id===item.client_id || state.personClients.find(p=>p.id===c.id)?.client_active!==false).map((c) => [c.id, c.name]);
    const sectionOptions = [
      ["", "Sin rubro"],
      ...state.sections.map((s) => [s.id, s.code + " · " + s.title]),
    ];
    if (kind === "acu-pattern") {
      title="Guardar como patrón de ACU";
      body=`<p class="modal-help">Guardá esta composición en la biblioteca de ACU para usarla desde «＋ Desde ACU» en cualquier presupuesto. Conserva los insumos y rendimientos por unidad; no incluye la cantidad total de esta partida. La partida original se conserva.</p>${field("Código del patrón","code","",'required maxlength="100"')}${field("Descripción","description",item.description,'required maxlength="500"')}<p>Unidad: ${e(item.unit)}</p>`;
    } else if (kind === "backups") {
      title = "Copias de seguridad";
      wide=true;
      const settings=state.backupSettings||{}, when=(value)=>value?e(new Date(value*1000).toLocaleString("es-AR")):"Todavía no se hizo una copia";
      body = `<p>Usá <strong>Elegir carpeta</strong> para seleccionar dónde guardar tus copias. Si está sincronizada con tu nube, tu programa de sincronización se encarga de subir las copias.</p>
      ${field("Carpeta de respaldos","backupDirectory",settings.directory||"",'required autocomplete="off"')}<button type="button" class="btn" data-action="choose-backup-folder">Elegir carpeta…</button>
      <label class="backup-enabled"><input type="checkbox" name="backupEnabled" ${settings.enabled?"checked":""}> Crear copias automáticas mientras CPOBRAS esté abierto</label>
      ${select("Frecuencia","backupInterval",[[15,"Cada 15 minutos"],[60,"Cada hora"],[240,"Cada 4 horas"],[1440,"Cada día"]],settings.interval_minutes||60)}
      <p class="modal-help">Guardá para aplicar. Al activar, se crea la primera copia dentro de un minuto si no hay una reciente. Al volver a abrir el programa se recupera la programación pendiente. No se borran copias anteriores.</p>
      <button type="submit" class="btn primary">Guardar configuración</button>
      <div class="backup-status"><strong>Última copia completada: ${when(settings.last_success)}</strong>${settings.last_file?`<p>${e(settings.last_file)}</p>`:""}${settings.last_error?`<p class="backup-error" role="status">Último intento: ${e(settings.last_error)}. Se volverá a intentar automáticamente si la programación está activa.</p>`:""}<p>La sincronización con la nube depende de tu aplicación externa. CPOBRAS confirma el archivo local, no su subida.</p></div>
      <div class="backup-actions"><button type="button" class="btn" data-action="create-backup">Crear copia ahora</button><button type="button" class="btn" data-action="open-backup-folder">Abrir carpeta</button><button type="button" class="btn" data-action="refresh-backups">Actualizar estado</button><button type="button" class="btn" data-action="verify-database">Verificar integridad</button></div>
      <h3>Copias disponibles</h3><p class="modal-help">Se muestran la carpeta elegida y las copias del directorio interno anterior. Restaurar guarda primero una copia preventiva. Si cambiás a otra carpeta externa, las copias anteriores quedan allí.</p>
      ${state.backupListError?`<p class="backup-error" role="status">${e(state.backupListError)}</p>`:""}
      <div class="backup-list">${state.backups.map(copy=>`<div><strong>${e(new Date(copy.created_at*1000).toLocaleString("es-AR"))}</strong> · ${e((copy.bytes/1024/1024).toFixed(2))} MB <button type="button" class="btn" data-action="restore-backup" data-id="${e(copy.id)}">Restaurar</button><small>${e(copy.name||copy.id)}<br>${e(copy.directory||settings.directory||"")}</small></div>`).join("")||"<p>No hay copias disponibles en estas carpetas.</p>"}</div>`;
    } else if (kind === "client") {
      title = "Nuevo cliente";
      body =
        field("Nombre / razón social", "clientName", "", "required autofocus") +
        field("CUIT (opcional)", "cuit");
    } else if (kind === "project") {
      title = item.id ? "Editar obra" : "Nueva obra";
      body =
        field("Nombre de la obra", "projectName", item.name, "required") +
        select(
          "Organización de la obra",
          "organizationId",
          state.organizations
            .filter((o) =>
              item.organization_locked
                ? o.id === item.organization_id
                : o.ownership === "own" || o.id === item.organization_id,
            )
            .map((o) => [
              o.id,
              o.name + (o.is_default ? " · Predeterminada" : ""),
            ]),
          item.organization_id ||
            state.organizations.find((o) => o.is_default)?.id,
        ) +
        (item.organization_locked
          ? '<p class="modal-help">La organización se conserva porque la obra ya tiene presupuestos.</p>'
          : "") +
        select(
          "Cliente / comitente",
          "clientId",
          projectOptions,
          item.client_id,
        ) +
        `<div class="project-person-actions"><button type="button" class="btn" data-action="person-project-new" data-role="client">＋ Crear cliente</button><button type="button" class="btn" data-action="person-project-import" data-role="client">Importar desde Proveedores</button></div><fieldset class="project-suppliers"><legend>Proveedores vinculados a la obra</legend><input name="project-supplier-search" placeholder="Buscar proveedor" autocomplete="off"><div class="project-supplier-options">${(state.personSuppliers || []).filter(p=>p.supplier_active!==false || item.supplier_ids?.includes(p.id)).map((p) => `<label class="project-supplier-choice" data-supplier-search="${e((p.name + " " + (p.cuit || "")).toLowerCase())}"><input type="checkbox" name="supplierIds" value="${p.id}" ${item.supplier_ids?.includes(p.id) ? "checked" : ""}>${e(p.name)}${p.cuit ? " · " + e(p.cuit) : ""}</label>`).join("") || "<p>Sin proveedores vinculados todavía.</p>"}</div><div class="project-person-actions"><button type="button" class="btn" data-action="person-project-new" data-role="supplier">＋ Crear proveedor</button><button type="button" class="btn" data-action="person-project-import" data-role="supplier">Importar desde Clientes</button></div></fieldset>` +
        select(
          "Moneda base",
          "currency",
          [
            ["ARS", "Pesos argentinos (ARS)"],
            ["USD", "Dólares (USD)"],
          ],
          item.currency === "Usd" || item.currency === "USD" ? "USD" : "ARS",
        );
    } else if (kind === "estimate") {
      title = "Nuevo presupuesto";
      body = field(
        "Nombre o versión",
        "title",
        "Presupuesto inicial",
        "required",
      );
    } else if (kind === "section") {
      title = item.id ? "Editar rubro" : "Agregar rubro / subrubro";
      body =
        select("Rubro de biblioteca (opcional)", "library-trade", [
          ["", "Carga manual"],
          ...state.trades.map((trade) => [
            trade.id,
            trade.code + " · " + trade.name,
          ]),
        ]) +
        field(
          "Código",
          "code",
          item.code || "",
          "required",
        ) +
        field("Nombre del rubro", "title", item.title, "required") +
        select(
          "Depende de",
          "parentId",
          sectionOptions.filter(([id]) => id !== item.id),
          item.parent_id || "",
        ) +
        field(
          "Orden",
          "position",
          item.position ?? state.sections.length,
          'type="number" min="0" required',
        );
    } else if (kind === "line") {
      title = item.id ? "Editar partida" : "Agregar partida";
      body =
        field("Descripción", "description", item.description, "required") +
        `<div class="form-grid three">${field("Unidad", "unit", item.unit || "m²", "required")}${field("Cantidad", "quantity", item.quantity ?? 1, 'type="number" min="0" step="any" required')}${field("Precio unitario", "unitCost", item.unit_cost ?? 0, 'type="number" min="0" step="any" required')}</div>` +
        select(
          "Rubro",
          "sectionId",
          sectionOptions,
          state.assignments[item.id] || state.selectedSectionId || "",
        ) +
        (item.analysis_id
          ? `<p class="modal-help">Si cambiás manualmente el precio o la unidad, esta partida pasa a precio manual. Su composición anterior se conserva sin alterar otras partidas.</p>`
          : "");
    } else if (kind === "from-acu") {
      title = "Insertar partida desde ACU";
      body =
        (!state.analyses.length
          ? `<p class="modal-help">Todavía no hay ACU guardados. Creá uno en la pestaña ACU, o cerrá esta ventana y asigná insumos directamente a una partida existente.</p>`
          : "") +
        select(
          "Análisis de costos",
          "analysisId",
          state.analyses.map((a) => [
            a.id,
            a.code + " · " + a.description + " — ARS " + money(a.unit_cost),
          ]),
        ) +
        field(
          "Cantidad",
          "quantity",
          1,
          'type="number" min="0" step="any" required',
        ) +
        select("Rubro", "sectionId", sectionOptions);
    } else if (kind === "resource") {
      const editing = Boolean(item.id);
      title = editing ? "Editar insumo" : "Agregar insumo";
      body =
        field("Código", "code", item.code || "", editing ? "required" : 'placeholder="Automático"') +
        field(
          "Descripción",
          "description",
          item.description || "",
          "required",
        ) +
        `<div class="form-grid">${field("Unidad", "unit", item.unit || "", "required")}
      ${select(
        "Tipo",
        "kind",
        [
          ["material", "Material"],
          ["labor", "Mano de obra"],
          ["equipment", "Equipo"],
          ["subcontract", "Subcontrato"],
        ],
        item.kind,
      )}</div>` +
        (editing
          ? select(
              "Estado",
              "active",
              [
                ["true", "Activo"],
                ["false", "Inactivo"],
              ],
              String(item.active !== false),
            ) +
            `<p class="modal-help">Cambiar los datos del insumo no modifica los precios históricos ni los análisis ya guardados.</p>`
          : field(
              "Precio inicial (ARS)",
              "price",
              item.price ?? "",
              'type="number" min="0" step="any" placeholder="Sin precio"',
            ) +
            field(
              "Fecha del precio",
              "effectiveDate",
              dateToday(),
              'type="date" required',
            ) +
            field("Fuente / proveedor", "source", "Carga manual") + '<p class="modal-help">Si todavía no conocés el precio, dejalo vacío. Podés registrarlo después desde la biblioteca.</p>');
    } else if (kind === "price") {
      title = "Registrar precio";
      body =
        `<p class="modal-help">${e(state.resources.find((r) => r.id === item.id)?.description)}</p>` +
        field(
          "Precio",
          "amount",
          "",
          'type="number" min="0" step="any" required',
        ) +
        select("Moneda", "currency", [
          ["ARS", "ARS"],
          ["USD", "USD"],
        ]) +
        field(
          "Fecha de vigencia",
          "effectiveDate",
          dateToday(),
          'type="date" required',
        ) +
        field("Fuente / proveedor", "source", "Cotización manual");
    } else if (kind === "line-resources") {
      title =
        item.componentIndex >= 0
          ? "Editar insumo de la partida"
          : "Agregar insumo a la partida";
      const row = state.acuComponents[0] || {};
      body = `<p class="modal-help"><strong>${e(item.description)}</strong> · Consumo por ${e(item.unit)}. El precio de este insumo se usa en todas las partidas de este presupuesto. Al guardar se recalculan las que lo usan y se conservan sus rendimientos.</p><div class="component-row single-component">${resourcePicker(state.resources, row.resourceId, 0)}<div class="form-grid">${field("Rendimiento / unidad", "quantity", row.quantity ?? 1, 'type="number" min="0" step="any" required')}${field("Precio unitario " + (currentEstimate()?.currency || "ARS"), "unitPrice", row.unitPrice ?? "", 'type="number" min="0" step="any" required')}</div></div><p class="modal-help">La composición completa se ve en el panel de la partida. Podés abrir cada insumo con doble clic o con Editar.</p>`;
    } else if (kind === "analysis") {
      const editing = Boolean(item.id);
      title = editing
        ? "Editar análisis de costo unitario"
        : "Crear análisis de costo unitario";
      wide = true;
      body =
        `<div class="acu-editor-sticky" aria-label="Datos y composición del ACU"><div class="form-grid three">
      ${field("Código ACU", "code", item.code || "", editing ? "required" : 'placeholder="Automático al guardar"')}
      ${field("Descripción", "description", item.description || "", "required")}
      ${field("Unidad de la partida", "unit", item.unit || "m²", "required")}
    </div>
    ` +
        `<div class="form-subhead">COMPOSICIÓN DEL ACU
      <button class="btn tiny" type="button" data-action="add-component">＋ Agregar insumo</button>
    </div></div>
    <div class="component-editor" id="component-editor">
      ${state.acuComponents
        .map(
          (row, index) => `<div class="form-grid component-row">
        ${resourcePicker(state.resources, row.resourceId, index)}
        ${field("Rendimiento / unidad", "quantity", row.quantity ?? 1, 'type="number" min="0" step="any" required')}
        ${field("Precio unitario ARS", "unitPrice", row.unitPrice ?? state.resources.find((r) => r.id === row.resourceId)?.price ?? "", 'type="number" min="0" step="any" required')}
        <button type="button" class="tiny-danger" data-action="remove-component" data-index="${index}" aria-label="Quitar componente">×</button>
      </div>`,
        )
        .join("")}
    </div>
    ${!state.resources.length ? `<p class="modal-help">Buscá un insumo y elegí «Agregar» para crearlo sin salir de esta ventana.</p>` : ""}<p class="modal-help">Podés modificar rendimientos, insumos y precios de este ACU. La edición no cambia los presupuestos anteriores. Para trasladar los nuevos costos a un borrador, utilizá «Actualizar precios ACU».</p>`;
    } else if (kind === "reprice") {
      title = "Actualizar precios del ACU";
      body =
        `<p class="modal-help">Se recalculará ${e(state.analyses.find((a) => a.id === item.id)?.description)} con las cotizaciones vigentes a la fecha indicada. Los presupuestos anteriores NO cambian.</p>` +
        field(
          "Precios vigentes al",
          "effectiveDate",
          dateToday(),
          'type="date" required',
        );
    } else if (kind === "takeoff") {
      title = item.id ? "Editar medición" : "Nueva medición";
      wide = true;
      body =
        field("Descripción de la medición", "note", item.note || "Medición") +
        `<div class="form-grid three">${field("Factor", "factor", item.factor ?? 1, 'type="number" min="0" step="any" required')}${field("Largo", "length", item.length ?? 1, 'type="number" min="0" step="any" required')}${field("Ancho", "width", item.width ?? 1, 'type="number" min="0" step="any" required')}${field("Alto", "height", item.height ?? 1, 'type="number" min="0" step="any" required')}${select(
          "Operación",
          "sign",
          [
            ["1", "Sumar"],
            ["-1", "Descontar"],
          ],
          item.sign ?? 1,
        )}${field("Orden", "position", item.position ?? state.takeoffs.length, 'type="number" min="0" required')}</div>`;
    } else if (kind === "rates") {
      title = "Gastos generales, utilidad e impuestos";
      body = `<div class="form-grid">${field("Gastos generales %", "generalExpensesPercent", state.rates?.general_expenses_percent ?? 0, 'type="number" min="0" step="any" required')}
    ${field("Gastos financieros %", "financialExpensesPercent", state.rates?.financial_expenses_percent ?? 0, 'type="number" min="0" step="any" required')}${field("Beneficio %", "profitPercent", state.rates?.profit_percent ?? 0, 'type="number" min="0" step="any" required')}
    ${field("Descuento %", "discountPercent", state.rates?.discount_percent ?? 0, 'type="number" min="0" max="100" step="any" required')}
    ${field("Impuestos %", "taxPercent", state.rates?.tax_percent ?? 0, 'type="number" min="0" step="any" required')}</div>`;
    } else if (kind === "comparison") {
      title = "Comparar versiones";
      body = select(
        "Comparar presupuesto actual contra",
        "baselineId",
        state.estimates
          .filter((s) => s.id !== state.estimateId)
          .map((s) => [s.id, s.title]),
      );
    } else if (kind === "contracting") {
      title = "Ejecución propia vs. subcontrato";
      body =
        `<p class="modal-help">Compará los recursos del ACU con el precio que te cotiza un subcontratista.</p>` +
        select(
          "ACU de ejecución propia",
          "analysisId",
          state.analyses.map((a) => [a.id, a.code + " · " + a.description]),
          currentLine()?.analysis_id,
        ) +
        field(
          "Cantidad de obra",
          "quantity",
          currentLine()?.quantity || 1,
          'type="number" min="0" step="any" required',
        ) +
        field(
          "Costo adicional propio por unidad",
          "ownExtraPerUnit",
          0,
          'type="number" min="0" step="any" required',
        ) +
        field(
          "Precio unitario del subcontrato",
          "subcontractPricePerUnit",
          0,
          'type="number" min="0" step="any" required',
        );
    } else if (kind === "comparison-result") {
      title = "Diferencias entre presupuestos";
      wide = true;
      const d = state.comparison;
      body = `<div class="compare-cards"><span>ORIGINAL<b>${money(d.baseline_total)}</b></span><span>REVISADO<b>${money(d.revised_total)}</b></span><span>DIFERENCIA<b>${money(d.difference)}</b></span></div>
      <div class="comparison-scroll"><table class="mini-table"><thead><tr><th>PARTIDA</th><th>UND.</th><th class="number">ORIGINAL</th><th class="number">REVISADO</th><th class="number">DIFERENCIA</th></tr></thead><tbody>
      ${d.lines.map((l) => `<tr><td>${e(l.description)}</td><td>${e(l.unit)}</td><td class="number">${money(l.baseline_cost)}</td><td class="number">${money(l.revised_cost)}</td><td class="number">${money(l.difference)}</td></tr>`).join("")}</tbody></table></div>`;
    } else if (kind === "contracting-result") {
      title = "Alternativas de ejecución";
      const d = state.costComparison;
      body = `<div class="compare-cards"><span>EJECUCIÓN PROPIA<b>${money(d.own_total)}</b></span><span>SUBCONTRATO<b>${money(d.subcontract_total)}</b></span><span>DIFERENCIA<b>${money(d.difference_total)}</b></span></div><p class="modal-help">Diferencia positiva: el subcontrato es más caro. Valores calculados para ${numeric(d.quantity)} unidades, en ARS.</p>`;
    }
    const result = kind === "backups" || kind.endsWith("-result"),
      save =
        kind === "comparison"
          ? "Comparar"
          : kind === "contracting"
            ? "Calcular"
            : "Guardar";
    return `<div class="modal-overlay"><div class="dialog-shell ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${e(title)}">
    <div class="dialog-header"><h2>${e(title)}</h2><button type="button" class="close-dialog" data-action="close-modal" aria-label="Cerrar">×</button></div>
    <form id="dialog-form" class="dialog-body" data-kind="${kind}">
      ${body}<p class="modal-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="btn" data-action="close-modal">Cerrar</button>${!result ? `<button type="submit" class="btn primary" ${kind === "from-acu" && !state.analyses.length ? "disabled" : ""}>${save}</button>` : ""}</div>
    </form></div></div>`;
  }

  return modalMarkup;
}
