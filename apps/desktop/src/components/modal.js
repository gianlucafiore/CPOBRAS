import { uiText, uiHtml, currentInterfaceLanguage } from "../services/interface-language.js";
import {dailyOutputField} from "./resource-productivity.js";
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
  acuPickerMarkup,
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
      ["", uiText("Sin rubro")],
      ...state.sections.map((s) => [s.id, s.code + " · " + s.title]),
    ];
    if (kind === "acu-pattern") {
      title="Guardar como patrón de ACU";
      body=`<p class="modal-help">${uiHtml("Guardá esta composición en la biblioteca de ACU para usarla desde «＋ Desde ACU» en cualquier presupuesto. Conserva los insumos y rendimientos por unidad; no incluye la cantidad total de esta partida. La partida original se conserva.")}</p>${field(uiText("Código del patrón"),"code","",'required maxlength="100"')}${field(uiText("Descripción"),"description",item.description,'required maxlength="500"')}<p>${uiHtml("Unidad: {0}", [item.unit])}</p>`;
    } else if (kind === "backups") {
      title = "Copias de seguridad";
      wide=true;
      const settings=state.backupSettings||{}, when=(value)=>value?e(new Date(value*1000).toLocaleString(currentInterfaceLanguage())):"Todavía no se hizo una copia";
      body = `<p>${uiHtml("Usá")} <strong>${uiHtml("Elegir carpeta")}</strong> ${uiHtml("para seleccionar dónde guardar tus copias. Si está sincronizada con tu nube, tu programa de sincronización se encarga de subir las copias.")}</p>
      ${field(uiText("Carpeta de respaldos"),"backupDirectory",settings.directory||"",'required autocomplete="off"')}<button type="button" class="btn" data-action="choose-backup-folder">${uiHtml("Elegir carpeta…")}</button>
      <label class="backup-enabled"><input type="checkbox" name="backupEnabled" ${settings.enabled?"checked":""}> ${uiHtml("Crear copias automáticas mientras CPOBRAS esté abierto")}</label>
      ${select(uiText("Frecuencia"),"backupInterval",[[15,uiText("Cada 15 minutos")],[60,uiText("Cada hora")],[240,uiText("Cada 4 horas")],[1440,uiText("Cada día")]],settings.interval_minutes||60)}
      <p class="modal-help">${uiHtml("Guardá para aplicar. Al activar, se crea la primera copia dentro de un minuto si no hay una reciente. Al volver a abrir el programa se recupera la programación pendiente. No se borran copias anteriores.")}</p>
      <button type="submit" class="btn primary">${uiHtml("Guardar configuración")}</button>
      <div class="backup-status"><strong>${uiHtml("Última copia completada:")} ${when(settings.last_success)}</strong>${settings.last_file?`<p>${e(settings.last_file)}</p>`:""}${settings.last_error?`<p class="backup-error" role="status">${uiHtml("Último intento: {0}. Se volverá a intentar automáticamente si la programación está activa.", [settings.last_error])}</p>`:""}<p>${uiHtml("La sincronización con la nube depende de tu aplicación externa. CPOBRAS confirma el archivo local, no su subida.")}</p></div>
      <div class="backup-actions"><button type="button" class="btn" data-action="create-backup">${uiHtml("Crear copia ahora")}</button><button type="button" class="btn" data-action="open-backup-folder">${uiHtml("Abrir carpeta")}</button><button type="button" class="btn" data-action="refresh-backups">${uiHtml("Actualizar estado")}</button><button type="button" class="btn" data-action="verify-database">${uiHtml("Verificar integridad")}</button></div>
      <h3>${uiHtml("Copias disponibles")}</h3><p class="modal-help">${uiHtml("Se muestran la carpeta elegida y las copias del directorio interno anterior. Restaurar guarda primero una copia preventiva. Si cambiás a otra carpeta externa, las copias anteriores quedan allí.")}</p>
      ${state.backupListError?`<p class="backup-error" role="status">${e(state.backupListError)}</p>`:""}
      ${state.backupRestoreId?`<section class="backup-restore-confirm" role="alert" aria-label="${uiHtml("Confirmar restauración")}"><h3>${uiHtml("¿Restaurar esta copia?")}</h3><p>${e(state.backups.find(copy=>copy.id===state.backupRestoreId)?.name||state.backupRestoreId)}</p><p>${uiHtml("Se guardará antes una copia del estado actual. Los cambios posteriores a la copia elegida dejarán de estar activos.")}</p><button type="button" class="btn primary" data-action="confirm-restore-backup" data-id="${e(state.backupRestoreId)}">${uiHtml("Sí, restaurar esta copia")}</button><button type="button" class="btn" data-action="cancel-restore-backup">${uiHtml("Cancelar restauración")}</button></section>`:""}
      <div class="backup-list">${state.backups.map(copy=>`<div><strong>${e(new Date(copy.created_at*1000).toLocaleString(currentInterfaceLanguage()))}</strong> ${uiHtml("· {0} MB", [(copy.bytes/1024/1024).toFixed(2)])} <button type="button" class="btn" data-action="restore-backup" data-id="${e(copy.id)}">${uiHtml("Restaurar")}</button><small>${e(copy.name||copy.id)}<br>${e(copy.directory||settings.directory||"")}</small></div>`).join("")||("<p>" + uiHtml("No hay copias disponibles en estas carpetas.") + "</p>")}</div>`;
    } else if (kind === "client") {
      title = "Nuevo cliente";
      body =
        field(uiText("Nombre / razón social"), "clientName", "", "required autofocus") +
        field(uiText("CUIT (opcional)"), "cuit");
    } else if (kind === "project") {
      title = item.id ? "Editar obra" : "Nueva obra";
      body =
        field(uiText("Nombre de la obra"), "projectName", item.name, "required") +
        select(
          uiText("Organización de la obra"),
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
          ? ("<p class=\"modal-help\">" + uiHtml("La organización se conserva porque la obra ya tiene presupuestos.") + "</p>")
          : "") +
        select(
          uiText("Cliente / comitente"),
          "clientId",
          projectOptions,
          item.client_id,
        ) +
        `<div class="project-person-actions"><button type="button" class="btn" data-action="person-project-new" data-role="client">${uiHtml("＋ Crear cliente")}</button><button type="button" class="btn" data-action="person-project-import" data-role="client">${uiHtml("Importar desde Proveedores")}</button></div>${item.id ? `<fieldset class="project-suppliers"><legend>${uiHtml("Proveedores vinculados a la obra")}</legend><input name="project-supplier-search" placeholder="${uiHtml("Buscar proveedor")}" autocomplete="off"><div class="project-supplier-options">${(state.personSuppliers || []).filter(p=>p.supplier_active!==false || item.supplier_ids?.includes(p.id)).map((p) => `<label class="project-supplier-choice" data-supplier-search="${e((p.name + " " + (p.cuit || "")).toLowerCase())}"><input type="checkbox" name="supplierIds" value="${p.id}" ${item.supplier_ids?.includes(p.id) ? "checked" : ""}>${e(p.name)}${p.cuit ? " · " + e(p.cuit) : ""}</label>`).join("") || ("<p>" + uiHtml("Sin proveedores vinculados todavía.") + "</p>")}</div><div class="project-person-actions"><button type="button" class="btn" data-action="person-project-new" data-role="supplier">${uiHtml("＋ Crear proveedor")}</button><button type="button" class="btn" data-action="person-project-import" data-role="supplier">${uiHtml("Importar desde Clientes")}</button></div></fieldset>` : ""}` +
        select(
          uiText("Moneda base"),
          "currency",
          [
            ["ARS", uiText("Pesos argentinos (ARS)")],
            ["USD", uiText("Dólares (USD)")],
          ],
          item.currency === "Usd" || item.currency === "USD" ? "USD" : "ARS",
        );
    } else if (kind === "estimate") {
      title = "Nuevo presupuesto";
      body = field(
        uiText("Nombre o versión"),
        "title",
        "Presupuesto inicial",
        "required",
      );
    } else if (kind === "section") {
      title = item.id ? "Editar rubro" : "Agregar rubro / subrubro";
      body =
        select(uiText("Rubro de biblioteca (opcional)"), "library-trade", [
          ["", uiText("Carga manual")],
          ...state.trades.map((trade) => [
            trade.id,
            trade.code + " · " + trade.name,
          ]),
        ]) +
        field(
          uiText("Código"),
          "code",
          item.code || "",
          "required",
        ) +
        field(uiText("Nombre del rubro"), "title", item.title, "required") +
        select(
          uiText("Depende de"),
          "parentId",
          sectionOptions.filter(([id]) => id !== item.id),
          item.parent_id || "",
        ) +
        field(
          uiText("Orden"),
          "position",
          item.position ?? state.sections.length,
          'type="number" min="0" required',
        );
    } else if (kind === "line") {
      title = item.id ? "Editar partida" : "Agregar partida";
      body =
        field(uiText("Descripción"), "description", item.description, "required") +
        `<div class="form-grid three">${field(uiText("Unidad"), "unit", item.unit || "m²", "required")}${field(uiText("Cantidad"), "quantity", item.quantity ?? 1, 'type="number" min="0" step="any" required')}${field(uiText("Precio unitario"), "unitCost", item.unit_cost ?? 0, 'type="number" min="0" step="any" required')}</div>` +
        select(
          uiText("Rubro"),
          "sectionId",
          sectionOptions,
          state.assignments[item.id] || state.selectedSectionId || "",
        ) +
        (item.analysis_id
          ? `<p class="modal-help">${uiHtml("Si cambiás manualmente el precio o la unidad, esta partida pasa a precio manual. Su composición anterior se conserva sin alterar otras partidas.")}</p>`
          : "");
    } else if (kind === "from-acu") {
      title = "Insertar partida desde ACU";
      wide = true;
      body = acuPickerMarkup() + select(uiText("Rubro"), "sectionId", sectionOptions, state.modal.sectionId ?? state.selectedSectionId ?? "") + `<p class="modal-help">${uiHtml("La partida se agrega con cantidad cero. Asignale la cantidad editando la partida.")}</p>`;
    } else if (kind === "resource") {
      const editing = Boolean(item.id);
      title = editing ? "Editar insumo" : "Agregar insumo";
      body =
        field(uiText("Código"), "code", item.code || "", editing ? "required" : 'placeholder="Automático"') +
        field(
          uiText("Descripción"),
          "description",
          item.description || "",
          "required",
        ) +
        `<div class="form-grid">${field(uiText("Unidad"), "unit", item.unit || "", "required")}
      ${select(
        uiText("Tipo"),
        "kind",
        [
          ["material", uiText("Material")],
          ["labor", uiText("Mano de obra")],
          ["equipment", uiText("Equipo")],
          ["subcontract", uiText("Subcontrato")],
        ],
        item.kind,
      )}</div>` + dailyOutputField(item.unit,item.daily_output) +
        (editing
          ? select(
              uiText("Estado"),
              "active",
              [
                ["true", uiText("Activo")],
                ["false", uiText("Inactivo")],
              ],
              String(item.active !== false),
            ) +
            `<p class="modal-help">${uiHtml("Cambiar los datos del insumo no modifica los precios históricos ni los análisis ya guardados.")}</p>`
          : field(
              uiText("Precio inicial (ARS)"),
              "price",
              item.price ?? "",
              ("type=\"number\" min=\"0\" step=\"any\" placeholder=\"" + uiHtml("Sin precio") + "\""),
            ) +
            field(
              uiText("Fecha del precio"),
              "effectiveDate",
              dateToday(),
              'type="date" required',
            ) +
            field(uiText("Fuente / proveedor"), "source", "Carga manual") + ("<p class=\"modal-help\">" + uiHtml("Si todavía no conocés el precio, dejalo vacío. Podés registrarlo después desde la biblioteca.") + "</p>"));
    } else if (kind === "price") {
      title = "Registrar precio";
      body =
        `<p class="modal-help">${e(state.resources.find((r) => r.id === item.id)?.description)}</p>` +
        field(
          uiText("Precio"),
          "amount",
          "",
          'type="number" min="0" step="any" required',
        ) +
        select(uiText("Moneda"), "currency", [
          ["ARS", "ARS"],
          ["USD", "USD"],
        ]) +
        field(
          uiText("Fecha de vigencia"),
          "effectiveDate",
          dateToday(),
          'type="date" required',
        ) +
        field(uiText("Fuente / proveedor"), "source", "Cotización manual");
    } else if (kind === "line-resources") {
      title =
        item.componentIndex >= 0
          ? "Editar insumo de la partida"
          : "Agregar insumo a la partida";
      const row = state.acuComponents[0] || {};
      body = `<p class="modal-help"><strong>${e(item.description)}</strong> ${uiHtml("· Consumo por {0}. El precio de este insumo se usa en todas las partidas de este presupuesto. Al guardar se recalculan las que lo usan y se conservan sus rendimientos.", [item.unit])}</p><div class="component-row single-component">${resourcePicker(state.resources, row.resourceId, 0)}<div class="form-grid">${field(uiText("Consumo por unidad de partida"), "quantity", row.quantity ?? 1, 'type="number" min="0" step="any" required')}${field("Precio unitario " + (currentEstimate()?.currency || "ARS"), "unitPrice", row.unitPrice ?? "", `type="number" min="0" step="any" ${row.pricePending ? `placeholder="${uiHtml("Pendiente de cotizar")}"` : "required"}`)}${dailyOutputField(state.resources.find(r=>r.id===row.resourceId)?.unit,item.componentIndex>=0?(row.dailyOutput??''):(row.dailyOutput??state.resources.find(r=>r.id===row.resourceId)?.daily_output))}</div><p class="modal-help">${uiHtml("El rendimiento diario se expresa en la unidad del insumo. Si la biblioteca está vacía, el primer valor guardado desde un presupuesto se conservará como referencia. Cada presupuesto puede usar su propio valor.")}</p></div><p class="modal-help">${uiHtml("La composición completa se ve en el panel de la partida. Podés abrir cada insumo con doble clic o con Editar.")}</p>`;
    } else if (kind === "analysis") {
      const editing = Boolean(item.id);
      title = editing
        ? "Editar análisis de costo unitario"
        : "Crear análisis de costo unitario";
      wide = true;
      body =
        `<div class="analysis-dialog-heading"><div class="form-grid three">
      ${field(uiText("Código ACU"), "code", item.code || "", editing ? "required" : 'placeholder="Automático si se deja vacío"')}
      ${field(uiText("Descripción"), "description", item.description || "", "required")}
      ${field(uiText("Unidad de la partida"), "unit", item.unit || "m²", "required")}
    </div>
    ` +
        `${item.aiWarnings?.length ? `<p class="modal-help">${uiHtml("Pendiente de revisar:")} ${item.aiWarnings.map(e).join(" · ")}</p>` : ""}
    <div class="form-subhead">${uiHtml("COMPOSICIÓN DEL ACU")}
      <button class="btn tiny" type="button" data-action="add-component">${uiHtml("＋ Agregar insumo")}</button>
    </div>
    </div>
    <div class="analysis-dialog-content">
    <div class="component-editor" id="component-editor">
      ${state.acuComponents
        .map(
          (row, index) => `<div class="form-grid component-row">
        ${resourcePicker(state.resources, row.resourceId, index)}
        ${field(uiText("Rendimiento / unidad"), "quantity", row.quantity ?? 1, 'type="number" min="0" step="any" required')}
        ${field(uiText("Precio unitario ARS"), "unitPrice", row.unitPrice ?? state.resources.find((r) => r.id === row.resourceId)?.price ?? "", 'type="number" min="0" step="any" required')}
        <button type="button" class="tiny-danger" data-action="remove-component" data-index="${index}" aria-label="${uiHtml("Quitar componente")}">×</button>
      </div>`,
        )
        .join("")}
    </div>
    ${!state.resources.length ? `<p class="modal-help">${uiHtml("Buscá un insumo y elegí «Agregar» para crearlo sin salir de esta ventana.")}</p>` : ""}<p class="modal-help">${uiHtml("Podés modificar rendimientos, insumos y precios de este ACU. La edición no cambia los presupuestos anteriores. Para trasladar los nuevos costos a un borrador, utilizá «Actualizar precios ACU».")}</p></div>`;
    } else if (kind === "reprice") {
      title = "Actualizar precios del ACU";
      body =
        `<p class="modal-help">${uiHtml("Se recalculará {0} con las cotizaciones vigentes a la fecha indicada. Los presupuestos anteriores NO cambian.", [state.analyses.find((a) => a.id === item.id)?.description])}</p>` +
        field(
          uiText("Precios vigentes al"),
          "effectiveDate",
          dateToday(),
          'type="date" required',
        );
    } else if (kind === "takeoff") {
      title = item.id ? "Editar medición" : "Nueva medición";
      wide = true;
      body =
        field(uiText("Descripción de la medición"), "note", item.note || "Medición") +
        `<div class="form-grid three">${field(uiText("Factor"), "factor", item.factor ?? 1, 'type="number" min="0" step="any" required')}${field(uiText("Largo"), "length", item.length ?? 1, 'type="number" min="0" step="any" required')}${field(uiText("Ancho"), "width", item.width ?? 1, 'type="number" min="0" step="any" required')}${field(uiText("Alto"), "height", item.height ?? 1, 'type="number" min="0" step="any" required')}${select(
          uiText("Operación"),
          "sign",
          [
            ["1", uiText("Sumar")],
            ["-1", uiText("Descontar")],
          ],
          item.sign ?? 1,
        )}${field(uiText("Orden"), "position", item.position ?? state.takeoffs.length, 'type="number" min="0" required')}</div>`;
    } else if (kind === "rates") {
      title = "Gastos generales, utilidad e impuestos";
      body = `<div class="form-grid">${field(uiText("Gastos generales %"), "generalExpensesPercent", state.rates?.general_expenses_percent ?? 0, 'type="number" min="0" step="any" required')}
    ${field(uiText("Gastos financieros %"), "financialExpensesPercent", state.rates?.financial_expenses_percent ?? 0, 'type="number" min="0" step="any" required')}${field(uiText("Beneficio %"), "profitPercent", state.rates?.profit_percent ?? 0, 'type="number" min="0" step="any" required')}
    ${field(uiText("Descuento %"), "discountPercent", state.rates?.discount_percent ?? 0, 'type="number" min="0" max="100" step="any" required')}
    ${field(uiText("Impuestos %"), "taxPercent", state.rates?.tax_percent ?? 0, 'type="number" min="0" step="any" required')}</div>`;
    } else if (kind === "comparison") {
      title = "Comparar versiones";
      body = select(
        uiText("Comparar presupuesto actual contra"),
        "baselineId",
        state.estimates
          .filter((s) => s.id !== state.estimateId)
          .map((s) => [s.id, s.title]),
      );
    } else if (kind === "contracting") {
      title = "Ejecución propia vs. subcontrato";
      body =
        `<p class="modal-help">${uiHtml("Compará los recursos del ACU con el precio que te cotiza un subcontratista.")}</p>` +
        select(
          uiText("ACU de ejecución propia"),
          "analysisId",
          state.analyses.map((a) => [a.id, a.code + " · " + a.description]),
          currentLine()?.analysis_id,
        ) +
        field(
          uiText("Cantidad de obra"),
          "quantity",
          currentLine()?.quantity || 1,
          'type="number" min="0" step="any" required',
        ) +
        field(
          uiText("Costo adicional propio por unidad"),
          "ownExtraPerUnit",
          0,
          'type="number" min="0" step="any" required',
        ) +
        field(
          uiText("Precio unitario del subcontrato"),
          "subcontractPricePerUnit",
          0,
          'type="number" min="0" step="any" required',
        );
    } else if (kind === "comparison-result") {
      title = "Diferencias entre presupuestos";
      wide = true;
      const d = state.comparison;
      body = `<div class="compare-cards"><span>${uiHtml("ORIGINAL")}<b>${money(d.baseline_total)}</b></span><span>${uiHtml("REVISADO")}<b>${money(d.revised_total)}</b></span><span>${uiHtml("DIFERENCIA")}<b>${money(d.difference)}</b></span></div>
      <div class="comparison-scroll"><table class="mini-table"><thead><tr><th>${uiHtml("PARTIDA")}</th><th>${uiHtml("UND.")}</th><th class="number">${uiHtml("ORIGINAL")}</th><th class="number">${uiHtml("REVISADO")}</th><th class="number">${uiHtml("DIFERENCIA")}</th></tr></thead><tbody>
      ${d.lines.map((l) => `<tr><td>${e(l.description)}</td><td>${e(l.unit)}</td><td class="number">${money(l.baseline_cost)}</td><td class="number">${money(l.revised_cost)}</td><td class="number">${money(l.difference)}</td></tr>`).join("")}</tbody></table></div>`;
    } else if (kind === "contracting-result") {
      title = "Alternativas de ejecución";
      const d = state.costComparison;
      body = `<div class="compare-cards"><span>${uiHtml("EJECUCIÓN PROPIA")}<b>${money(d.own_total)}</b></span><span>${uiHtml("SUBCONTRATO")}<b>${money(d.subcontract_total)}</b></span><span>${uiHtml("DIFERENCIA")}<b>${money(d.difference_total)}</b></span></div><p class="modal-help">${uiHtml("Diferencia positiva: el subcontrato es más caro. Valores calculados para {0} unidades, en ARS.", [numeric(d.quantity)])}</p>`;
    }
    const result = kind === "backups" || kind.endsWith("-result"),
      save =
        kind === "from-acu" ? "Agregar" : kind === "comparison"
          ? "Comparar"
          : kind === "contracting"
            ? "Calcular"
            : "Guardar";
    const analysis = kind === "analysis";
    const error = `<p class="modal-error" role="alert"></p>`;
    return `<div class="modal-overlay"><div class="dialog-shell ${wide ? "wide" : ""}${analysis ? " analysis-dialog" : ""}" role="dialog" aria-modal="true" aria-label="${uiHtml(title)}">
    <div class="dialog-header"><h2>${uiHtml(title)}</h2><button type="button" class="close-dialog" data-action="close-modal" aria-label="${uiHtml("Cerrar")}">×</button></div>
    <form id="dialog-form" class="dialog-body" data-kind="${kind}">
      ${body}${error}
      <div class="dialog-actions"><button type="button" class="btn" data-action="close-modal">${uiHtml("Cerrar")}</button>${!result ? `<button type="submit" class="btn primary" ${kind === "from-acu" && !state.modal.pickerReady ? "disabled" : ""}>${save}</button>` : ""}</div>
    </form></div></div>`;
  }

  return modalMarkup;
}
