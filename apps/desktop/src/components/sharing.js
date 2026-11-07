import { e, field, select } from "./helpers.js";
import { money, numeric, multiplyDecimals } from "../decimal.js";
import { operationNames } from "./operations.js";
const when = (t) =>
  t ? new Date(t * 1000).toLocaleString("es-AR") : "Todavía sin conexión";
const table = (heads, rows) =>
  `<div class="sharing-scroll"><table class="data-grid"><thead><tr>${heads.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${heads.length}">Sin registros.</td></tr>`}</tbody></table></div>`;
const cells = (values) =>
  `<tr>${values.map((v) => `<td>${e(v ?? "")}</td>`).join("")}</tr>`;
export function createSharing({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
  loadCollections,
}) {
  const m = {
    status: { shares: [], subscriptions: [], enabled: false },
    invitation: "",
    copyMessage: "",
    view: null,
    id: null,
    tab: "budget",
    estimateId: null,
    error: "",
  };
  function budget() {
    return (
      m.view?.data?.budgets?.find((b) => b.estimate.id === m.estimateId) ||
      m.view?.data?.budgets?.[0]
    );
  }
  function overview() {
    const s = m.status;
    return `<main class="feature-page sharing-page"><div class="feature-toolbar"><h1>Vinculación P2P</h1><button class="btn" data-action="share-refresh">Actualizar estado</button><button class="btn" data-action="share-sync">Buscar cambios</button><button class="btn" data-action="share-toggle">${s.enabled ? "Pausar conexiones" : "Activar conexiones"}</button></div>
  <p>Compartí una obra por Internet con un observador de solo lectura. Los dos equipos deben tener CPOBRAS abierto para recibir cambios. Si el propietario está desconectado, sigue disponible la última copia recibida.</p>
  <p><strong>Conexiones ${s.enabled ? "activas" : "pausadas"}</strong> · Actualización automática cada 30 segundos. La conexión está cifrada y permite vincular equipos de redes distintas.</p>${s.network_error ? `<p class="feature-error" role="status">${e(s.network_error)}</p>` : ""}
  <div class="sharing-columns"><section class="feature-editor"><h2>Compartir una obra propia</h2><form id="p2p-invite-form">${select(
    "Obra para compartir",
    "shareProject",
    (state.projects || [])
      .filter((p) => !p.read_only)
      .map((p) => [p.id, p.name]),
  )}${field("Nombre del observador", "shareLabel", "", 'required maxlength="200" placeholder="Ej.: Arquitecta María"')}<p>La invitación sirve para un equipo. Se vincula al primer equipo que la utiliza; podés revocar su acceso en cualquier momento.</p><button class="btn primary" type="submit" ${(state.projects || []).some((p) => !p.read_only) ? "" : "disabled"}>Crear invitación</button><p class="feature-error" role="alert"></p></form>
  ${m.invitation ? `<div class="sharing-invitation"><label>Invitación para enviar<textarea readonly id="p2p-invitation" rows="4">${e(m.invitation)}</textarea></label><button class="btn" data-action="share-copy">Copiar invitación</button><span class="sharing-copy-status" role="status">${e(m.copyMessage)}</span><button class="btn" data-action="share-clear-invitation">Ocultar invitación</button><p>Enviásela al observador por tu medio habitual. Da acceso a los costos, presupuestos, planificación, gestión y datos de esta obra.</p></div>` : ""}</section>
  <section class="feature-editor"><h2>Recibir una obra</h2><form id="p2p-join-form"><label>Invitación del propietario<textarea name="invitation" required maxlength="16000" rows="5" placeholder="Pegá aquí la invitación que recibiste"></textarea></label><p>La obra se guarda como una copia externa de solo lectura. Tus obras y contactos propios se conservan.</p><button class="btn primary" type="submit">Vincular obra</button><p class="feature-error" role="alert"></p></form></section></div>
  <h2>Obras que compartís</h2>${table(
    ["Obra", "Observador", "Acceso", "Última consulta", ""],
    s.shares.map(
      (g) =>
        `<tr><td>${e(state.projects.find((p) => p.id === g.project_id)?.name || "Obra")}</td><td>${e(g.label)}${g.peer ? `<small class="sharing-peer">Equipo ${e(g.peer.slice(0, 12))}…</small>` : ""}</td><td>${g.revoked ? "Revocado" : g.peer ? "Vinculado · Solo lectura" : "Invitación pendiente"}</td><td>${e(when(g.last_seen))}</td><td>${g.revoked ? "" : `<button class="btn" data-action="share-revoke" data-id="${g.id}">Revocar acceso</button>`}</td></tr>`,
    ),
  )}
  <h2>Obras recibidas</h2>${table(
    ["Obra", "Estado", "Última versión recibida", ""],
    s.subscriptions.map(
      (s) =>
        `<tr><td>${e(s.name)} <span class="person-both">Externa · Solo lectura</span></td><td>${s.revoked ? "Acceso revocado" : s.error ? e(s.error) : s.last_checked ? "Al día en la última consulta" : "Pendiente de recibir"}<small class="sharing-peer">Última comprobación: ${e(when(s.last_checked))}</small></td><td>${e(when(s.last_sync))}</td><td><button class="btn primary" data-action="share-open" data-id="${s.id}" ${s.has_snapshot ? "" : "disabled"}>Abrir copia</button> <button class="btn" data-action="share-forget" data-id="${s.id}">Desvincular</button></td></tr>`,
    ),
  )}
  <p>Revocar impide nuevas actualizaciones; el observador conserva lo que ya recibió. Esta función no sube una copia permanente a un servidor: si ambos están desconectados, no hay una versión nueva disponible.</p><p class="feature-error" role="alert">${e(m.error)}</p></main>`;
  }
  function viewer() {
    const v = m.view,
      d = v.data,
      b = budget(),
      doc = b?.document;
    const header = `<div class="feature-toolbar"><button class="btn" data-action="share-back">← Vinculaciones</button><h1>${e(d.project.name)}</h1><span class="person-both">Externa · Solo lectura</span><button class="btn" data-action="share-sync">Buscar cambios</button></div><p>Propietario: <strong>${e(d.organization.name)}</strong> · Copia recibida: ${e(when(v.received_at))}</p>${v.revoked || v.error ? `<p class="context-help">${v.revoked ? "El propietario revocó el acceso. Se conserva esta última copia." : e(v.error)}</p>` : ""}<div class="feature-tabs">${[
      ["budget", "Presupuesto"],
      ["price", "Determinación de precio"],
      ["management", "Gestión de obra"],
      ["planning", "Planificación"],
      ["organization", "Datos de obra y organización"],
    ]
      .map(
        ([id, title]) =>
          `<button class="btn ${m.tab === id ? "primary" : ""}" data-action="share-tab" data-tab="${id}" aria-current="${m.tab === id ? "page" : "false"}">${title}</button>`,
      )
      .join("")}</div>`;
    let content = "";
    if (["budget", "price"].includes(m.tab)) {
      content = select(
        "Presupuesto de la copia",
        "shared-estimate",
        (d.budgets || []).map((b) => [
          b.estimate.id,
          b.estimate.title + (b.estimate.issued ? " · Emitido" : " · Borrador"),
        ]),
        b?.estimate.id,
      );
      if (!b) content += "<p>Esta obra todavía no tiene presupuestos.</p>";
      else if (m.tab === "price") {
        const p = b.pricing;
        content += `<h2>Determinación de precio</h2><p>Costo directo: <strong>${money(p.direct)}</strong> · Total: <strong>${p.calculation ? money(p.calculation.breakdown.total) : "Pendiente de cálculo"}</strong></p>${p.calculation_error ? `<p>${e(p.calculation_error)}</p>` : ""}`;
        content += table(
          ["Concepto", "Estado", "Importe"],
          (p.calculation?.rows || []).map((r) =>
            cells([
              r.label,
              r.enabled ? "Activo" : "Desactivado",
              money(r.amount),
            ]),
          ),
        );
        content += (p.definition?.rows || [])
          .filter((r) => r.items?.length)
          .map(
            (r) =>
              `<details><summary>${e(r.label)} · Detalle</summary>${table(
                ["Descripción", "Cantidad", "Precio", "Participación"],
                r.items.map((i) =>
                  cells([
                    i.description || i.label,
                    i.quantity,
                    i.unit_price,
                    i.participation_percent,
                  ]),
                ),
              )}</details>`,
          )
          .join("");
      } else {
        const assignment = new Map(doc.assignments || []);
        const rows = [];
        function lines(section) {
          return doc.lines
            .filter((l) => (assignment.get(l.id) || null) === section)
            .map((l) => {
              const analysis = doc.line_analyses?.find(
                  (a) => a.id === l.analysis_id,
                ),
                takeoffs =
                  doc.takeoffs?.filter((t) => t.line_id === l.id) || [];
              return `<tr><td>${e(l.description)}${
                analysis || takeoffs.length
                  ? `<details><summary>Composición y cómputo</summary>${
                      analysis
                        ? table(
                            ["Insumo", "Rendimiento", "Precio"],
                            (analysis.components || []).map((c) =>
                              cells([
                                c.description || c.resource_id,
                                numeric(c.quantity_per_unit),
                                money(c.unit_price),
                              ]),
                            ),
                          )
                        : ""
                    }${
                      takeoffs.length
                        ? table(
                            ["Descripción", "Factor", "Largo", "Ancho", "Alto"],
                            takeoffs.map((t) =>
                              cells([
                                t.note,
                                t.factor,
                                t.length,
                                t.width,
                                t.height,
                              ]),
                            ),
                          )
                        : ""
                    }</details>`
                  : ""
              }</td><td>${e(l.unit)}</td><td>${numeric(l.quantity)}</td><td>${money(l.unit_cost_snapshot)}</td><td>${money(multiplyDecimals(l.quantity, l.unit_cost_snapshot))}</td></tr>`;
            });
        }
        const visited = new Set();
        function section(s, depth) {
          if (visited.has(s.id) || depth > 30) return;
          visited.add(s.id);
          rows.push(
            `<tr class="sharing-rubro"><td colspan="5" style="padding-left:${10 + depth * 15}px">${e(s.code)} · ${e(s.title)}</td></tr>`,
          );
          rows.push(...lines(s.id));
          doc.sections
            .filter((c) => c.parent_id === s.id)
            .forEach((c) => section(c, depth + 1));
        }
        doc.sections.filter((s) => !s.parent_id).forEach((s) => section(s, 0));
        rows.push(...lines(null));
        content +=
          `<p>Moneda: ${e(b.estimate.currency)} · Costo directo: <strong>${money(b.pricing.direct)}</strong> · Precio total: <strong>${b.pricing.calculation ? money(b.pricing.calculation.breakdown.total) : "Pendiente"}</strong></p>` +
          table(
            [
              "Descripción",
              "Unidad",
              "Cantidad",
              "Precio de costo",
              "Parcial de costo",
            ],
            rows,
          );
      }
    } else if (m.tab === "planning") {
      const schedule = d.schedule?.Ok || {},
        tasks = d.planning?.plan?.tasks || [];
      content = "<h2>Planificación</h2>";
      content += table(
        ["Tarea", "Inicio", "Fin", "Duración", "Avance"],
        tasks.map((t) => {
          const s = schedule.tasks?.find((s) => s.id === t.id);
          return cells([
            t.name,
            s?.start,
            s?.finish,
            t.duration_days,
            `${numeric(t.actual_progress)} %`,
          ]);
        }),
      );
      content +=
        "<h3>Líneas base</h3>" +
        table(
          ["Nombre", "Fecha", "Finalización"],
          (d.baselines || []).map((b) =>
            cells([b.name, b.as_of, b.schedule?.finish]),
          ),
        );
    } else if (m.tab === "management") {
      const partners = d.parties || [];
      content = "<h2>Documentos de gestión</h2>";
      content += table(
        ["Fecha", "Documento", "Número", "Contraparte", "Importe"],
        d.operations.map(
          (o) =>
            `<tr><td>${e(o.date)}</td><td>${e(operationNames[o.kind] || "Documento")}<details><summary>Ver detalle</summary><p>${e(o.notes)}</p><p>${e(o.terms)}</p><p>${e(o.incidents)}</p>${table(
              ["Descripción", "Cantidad", "Precio"],
              o.lines.map((l) =>
                cells([
                  l.description,
                  numeric(l.quantity),
                  money(l.unit_price),
                ]),
              ),
            )}</details></td><td>${e(o.number)}</td><td>${e(partners.find((p) => p?.id === o.partner_id)?.name || d.client?.name || "")}</td><td>${e(o.currency)} ${money(o.amount)}</td></tr>`,
        ),
      );
      content +=
        "<h3>Existencias</h3>" +
        table(
          ["Depósito", "Recurso", "Cantidad", "Valor"],
          d.stock.map((s) =>
            cells([
              d.warehouses.find((w) => w.id === s.warehouse_id)?.name,
              d.resources?.find((r) => r?.id === s.resource_id)?.description ||
                "Insumo",
              numeric(s.quantity),
              `${s.currency} ${money(s.value)}`,
            ]),
          ),
        );
    } else {
      const p = d.organization.profile;
      const labels = {
        tax_id: "CUIT",
        address: "Domicilio",
        phone: "Teléfono",
        email: "Correo",
        website: "Sitio web",
        professional_name: "Profesional",
        qualification: "Matrícula / título",
      };
      const logo = p.logo_png?.length
        ? `<img class="sharing-logo" alt="Logotipo de la organización propietaria" src="data:image/png;base64,${window.btoa(Array.from(p.logo_png, (b) => String.fromCharCode(b)).join(""))}">`
        : "";
      content = `<h2>${e(d.organization.name)} <span class="person-both">Externa · Solo lectura</span></h2>${logo}<p>${e(p.company_name)} · ${e(p.trade_name)}</p><dl>${Object.entries(
        labels,
      )
        .filter(([k]) => p[k])
        .map(([k, label]) => `<dt>${label}</dt><dd>${e(p[k])}</dd>`)
        .join(
          "",
        )}</dl><h3>Obra</h3><p>${e(d.project.name)} · Cliente: ${e(d.client?.name)} · ${e(d.project.currency)}</p><h3>Proveedores vinculados</h3>${table(
        ["Nombre", "CUIT", "Contacto"],
        (d.suppliers || [])
          .filter(Boolean)
          .map((p) =>
            cells([
              p.name,
              p.cuit,
              [p.phone, p.email].filter(Boolean).join(" · "),
            ]),
          ),
      )}<h3>Fichas de la obra</h3>${table(
        ["Nombre", "Código"],
        d.records.map((r) => cells([r.name, r.code])),
      )}`;
    }
    return `<main class="feature-page sharing-page">${header}<section class="sharing-view">${content}</section><p class="feature-error" role="alert">${e(m.error)}</p></main>`;
  }
  function markup() {
    return m.view ? viewer() : overview();
  }
  async function refresh() {
    m.status = await invoke("p2p_status");
    if (m.id) m.view = await invoke("p2p_read", { id: m.id });
  }
  async function act(button) {
    const a = button.dataset.action;
    if (a !== "open-sharing" && !a.startsWith("share-")) return false;
    if (a === "share-copy") {
      const t = document.querySelector("#p2p-invitation");
      t.select();
      try {
        if (window.navigator?.clipboard)
          await window.navigator.clipboard.writeText(t.value);
        else if (!document.execCommand("copy")) throw Error();
        m.copyMessage = "Invitación copiada";
      } catch {
        m.copyMessage = "Seleccioná el texto y copialo con Ctrl+C";
      }
      const feedback = document.querySelector(".sharing-copy-status");
      if (feedback) feedback.textContent = m.copyMessage;
      return true;
    }
    if (a === "share-tab") {
      m.tab = button.dataset.tab;
      render();
      return true;
    }
    if (a === "share-back") {
      m.view = null;
      m.id = null;
      render();
      return true;
    }
    if (state.busy) return true;
    if (state.pageDirty) {
      if (
        !window.confirm("¿Descartar los datos sin guardar de esta vinculación?")
      )
        return true;
      state.pageDirty = false;
    }
    if (a === "share-clear-invitation") {
      m.invitation = "";
      render();
      return true;
    }
    state.busy = true;
    m.error = "";
    try {
      if (a === "open-sharing") {
        await refresh();
        state.view = "sharing";
      }
      if (["share-refresh", "share-sync"].includes(a)) {
        if (a === "share-sync") await invoke("p2p_sync");
        await refresh();
        await loadCollections();
      }
      if (a === "share-toggle") {
        await invoke("p2p_enable", { enabled: !m.status.enabled });
        await refresh();
      }
      if (a === "share-open") {
        m.id = button.dataset.id;
        m.view = await invoke("p2p_read", { id: m.id });
        m.tab = "budget";
        m.estimateId = null;
      }
      if (
        a === "share-revoke" &&
        window.confirm(
          "¿Revocar el acceso? No recibirá más actualizaciones, pero conserva las copias que ya obtuvo.",
        )
      ) {
        await invoke("p2p_revoke", { id: button.dataset.id });
        await refresh();
      }
      if (
        a === "share-forget" &&
        window.confirm(
          "¿Desvincular esta obra y eliminar su copia de este equipo?",
        )
      ) {
        await invoke("p2p_forget", { id: button.dataset.id });
        await refresh();
      }
    } catch (error) {
      m.error = String(error);
    } finally {
      state.busy = false;
      render();
    }
    return true;
  }
  async function submit(form) {
    const data = new FormData(form);
    m.error = "";
    if (form.id === "p2p-invite-form") {
      const result = await invoke("p2p_invite", {
        projectId: String(data.get("shareProject")),
        label: String(data.get("shareLabel") || "").trim(),
      });
      m.invitation = result.invitation;
      m.copyMessage = "";
    } else
      await invoke("p2p_join", {
        invitation: String(data.get("invitation") || "").trim(),
      });
    state.pageDirty = false;
    await refresh();
    await loadCollections();
    render();
  }
  function change(target) {
    if (target.name === "shared-estimate") {
      m.estimateId = target.value;
      render();
    }
  }
  if (window.setInterval)
    window.setInterval(async () => {
      if (
        state.view !== "sharing" ||
        state.busy ||
        state.pageDirty ||
        m.invitation
      )
        return;
      try {
        await refresh();
        render();
      } catch {
        /* Preserve the visible cached copy. */
      }
    }, 30000);
  return { markup, act, submit, change, model: m };
}
