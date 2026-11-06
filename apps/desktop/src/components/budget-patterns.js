import { e, field, select } from "./helpers.js";
import { money, numeric } from "../decimal.js";
export function createBudgetPatterns({
  invoke,
  state,
  editable,
  render,
  loadEstimate,
  document,
  window,
}) {
  const m = {
    active: false,
    kind: "project",
    projectId: "",
    estimates: [],
    estimateId: "",
    templates: [],
    templateId: "",
    snapshot: null,
    lines: new Set(),
    sections: new Set(),
    prices: false,
    parentId: "",
    name: "",
    query: "",
    dirty: false,
    busy: false,
    error: "",
    feedback: "",
    collapsed: new Set(),
    focus: null,
  };
  const source = () => ({
    estimate_id: m.kind === "project" ? m.estimateId : null,
    template_id: m.kind === "template" ? m.templateId : null,
  });
  const selection = () => ({
    line_ids: [...m.lines],
    section_ids: [...m.sections],
  });
  function ancestors(section) {
    const result = [];
    let next = section;
    const visited = new Set();
    while (next && !visited.has(next)) {
      visited.add(next);
      result.push(next);
      next = m.snapshot.sections.find((s) => s.id === next)?.parent_id;
    }
    return result;
  }
  function descendantSections(id) {
    const result = new Set([id]);
    let size = -1;
    while (size !== result.size) {
      size = result.size;
      for (const s of m.snapshot.sections)
        if (result.has(s.parent_id)) result.add(s.id);
    }
    return result;
  }
  function memberLines(id) {
    const ids = descendantSections(id),
      assigned = new Map(m.snapshot.assignments);
    return m.snapshot.lines.filter((l) => ids.has(assigned.get(l.id)));
  }
  function members(id) {
    const sections = descendantSections(id),
      lines = memberLines(id),
      empty = [...sections].filter(
        (s) =>
          !memberLines(s).length &&
          !m.snapshot.sections.some((child) => child.parent_id === s),
      );
    return [
      ...lines.map((l) => ["line", l.id]),
      ...empty.map((s) => ["section", s]),
    ];
  }
  function checkState(id) {
    const all = members(id),
      n = all.filter(([kind, id]) =>
        (kind === "line" ? m.lines : m.sections).has(id),
      ).length;
    return {
      checked: all.length > 0 && n === all.length,
      partial: n > 0 && n < all.length,
    };
  }
  function selectedCount() {
    return m.snapshot?.lines.filter((l) => m.lines.has(l.id)).length || 0;
  }
  async function loadSource() {
    m.snapshot = null;
    m.lines.clear();
    m.sections.clear();
    m.collapsed.clear();
    m.query = "";
    if (
      (m.kind === "project" && m.estimateId) ||
      (m.kind === "template" && m.templateId)
    )
      m.snapshot = await invoke("get_pattern_document", { source: source() });
  }
  async function loadProject() {
    m.estimates = m.projectId
      ? await invoke("list_project_estimates", { projectId: m.projectId })
      : [];
    m.estimateId = m.estimates[0]?.id || "";
    await loadSource();
  }
  function canDiscard() {
    return (
      !m.dirty ||
      window.confirm(
        "Cambiar o cerrar descarta la selección del patrón que todavía no guardaste ni incorporaste. ¿Continuar?",
      )
    );
  }
  function close() {
    if (m.busy || !canDiscard()) return;
    m.active = false;
    m.dirty = false;
    render();
  }
  function redraw() {
    const input = document.activeElement;
    if (input?.matches?.('[name="pattern-search"],[name="pattern-name"]'))
      m.focus = { name: input.name, start: input.selectionStart };
    else if (input?.dataset?.patternNode)
      m.focus = { node: input.dataset.patternNode };
    render();
  }
  function tree() {
    const d = m.snapshot;
    if (!d)
      return "<p>No hay presupuestos o patrones disponibles en este origen.</p>";
    const assignment = new Map(d.assignments),
      q = m.query.trim().toLocaleLowerCase("es");
    const visibleLines = new Set(
        d.lines
          .filter(
            (l) =>
              !q ||
              (l.description + " " + l.unit)
                .toLocaleLowerCase("es")
                .includes(q),
          )
          .map((l) => l.id),
      ),
      visibleSections = new Set();
    for (const s of d.sections)
      if (!q || (s.code + " " + s.title).toLocaleLowerCase("es").includes(q)) {
        for (const id of descendantSections(s.id)) visibleSections.add(id);
        for (const l of memberLines(s.id)) visibleLines.add(l.id);
      }
    for (const l of d.lines)
      if (visibleLines.has(l.id))
        for (const id of ancestors(assignment.get(l.id)))
          visibleSections.add(id);
    for (const id of [...visibleSections])
      for (const parent of ancestors(id)) visibleSections.add(parent);
    const lineNode = (l) =>
      `<li role="treeitem" aria-selected="${m.lines.has(l.id)}" class="pattern-line"><label><input type="checkbox" data-pattern-node="line:${l.id}" data-pattern-line="${l.id}" aria-label="Partida ${e(l.description)}" ${m.lines.has(l.id) ? "checked" : ""}><span>${e(l.description)}</span></label><small>${numeric(l.quantity)} ${e(l.unit)}${m.prices ? " · " + money(l.unit_cost_snapshot) : ""}</small></li>`;
    const sectionNode = (s, depth = 0) => {
      if (depth > 100) return "";
      const status = checkState(s.id),
        collapsed = m.collapsed.has(s.id) && !q;
      return `<li role="treeitem" aria-expanded="${!collapsed}" aria-selected="${status.checked}" class="pattern-section"><div><button type="button" class="pattern-disclosure" data-action="pattern-toggle" data-id="${s.id}" aria-label="${collapsed ? "Expandir" : "Contraer"} ${e(s.title)}">${collapsed ? "▸" : "▾"}</button><label><input type="checkbox" data-pattern-node="section:${s.id}" data-pattern-section="${s.id}" aria-label="Rubro ${e(s.title)}" ${status.checked ? "checked" : ""} data-partial="${status.partial}"><strong>${e(s.code + " · " + s.title)}</strong></label></div>${
        collapsed
          ? ""
          : `<ul role="group">${d.sections
              .filter(
                (child) =>
                  child.parent_id === s.id && visibleSections.has(child.id),
              )
              .sort((a, b) => a.position - b.position)
              .map((child) => sectionNode(child, depth + 1))
              .join("")}${d.lines
              .filter(
                (l) => assignment.get(l.id) === s.id && visibleLines.has(l.id),
              )
              .map(lineNode)
              .join("")}</ul>`
      }</li>`;
    };
    return `<ul role="tree" aria-label="Rubros y partidas de origen" class="pattern-tree">${d.sections
      .filter((s) => !s.parent_id && visibleSections.has(s.id))
      .sort((a, b) => a.position - b.position)
      .map((s) => sectionNode(s))
      .join("")}${d.lines
      .filter((l) => !assignment.has(l.id) && visibleLines.has(l.id))
      .map(lineNode)
      .join(
        "",
      )}</ul>${!d.sections.length && !d.lines.length ? "<p>El origen está vacío.</p>" : ""}`;
  }
  function markup() {
    if (!m.active) return "";
    return `<div class="modal-overlay patterns-overlay"><section class="dialog-shell wide pattern-dialog" role="dialog" aria-modal="true" aria-label="Patrones de cómputo"><div class="dialog-header"><h2>Patrones de cómputo</h2><button type="button" class="close-dialog" data-action="pattern-close" aria-label="Cerrar patrones" ${m.busy ? "disabled" : ""}>×</button></div><div class="dialog-body" ${m.busy ? "inert" : ""}><p class="modal-help">Elegí rubros completos o partidas individuales. Se agregan al presupuesto abierto, con sus metrados y fórmulas. Las partidas sueltas conservan su jerarquía de rubros. El origen y lo que ya tenés cargado se conservan.</p><div class="form-grid">${select(
      "Origen del patrón",
      "pattern-kind",
      [
        ["project", "Obras y presupuestos"],
        ["template", "Patrones guardados"],
      ],
      m.kind,
    )}${
      m.kind === "project"
        ? select(
            "Obra de origen",
            "pattern-project",
            state.projects.map((p) => [p.id, p.name]),
            m.projectId,
          )
        : select(
            "Patrón guardado",
            "pattern-template",
            m.templates.map((t) => [t.id, t.name]),
            m.templateId,
          )
    }</div>${
      m.kind === "project"
        ? select(
            "Presupuesto de origen",
            "pattern-estimate",
            m.estimates.map((e) => [
              e.id,
              e.title + (e.issued ? " · Emitido" : " · Borrador"),
            ]),
            m.estimateId,
          )
        : ""
    }<div class="pattern-controls">${field("Buscar rubros o partidas", "pattern-search", m.query)}<button class="btn" type="button" data-action="pattern-all">Seleccionar todo</button><button class="btn" type="button" data-action="pattern-none">Limpiar selección</button></div><div class="pattern-tree-scroll">${tree()}</div><div class="pattern-summary" role="status">${selectedCount()} partidas seleccionadas · ${m.sections.size} rubros marcados</div><div class="form-grid">${select(
      "Precios al incorporar",
      "pattern-prices",
      [
        ["false", "Solo cantidades, sin precios"],
        ["true", "Traer precios del origen"],
      ],
      String(m.prices),
    )}${select("Ubicación de destino", "pattern-parent", [["", "Al final del presupuesto"], ...state.sections.map((s) => [s.id, s.code + " · " + s.title])], m.parentId)}</div><p class="modal-help">Sin precios: las partidas quedan con precio cero y sin ACU. Con precios: si un insumo ya existe en el destino, se usa el precio único de ese presupuesto. Los gastos e impuestos del destino se conservan.</p><div class="pattern-save">${field("Nombre del patrón", "pattern-name", m.name, 'maxlength="500"')}<button type="button" class="btn" data-action="pattern-save">Guardar selección como patrón</button></div><p class="modal-error" role="alert">${e(m.error)}</p>${m.feedback ? `<p role="status">${e(m.feedback)}</p>` : ""}</div><div class="dialog-actions pattern-actions"><button type="button" class="btn" data-action="pattern-close">Cerrar</button><button type="button" class="btn primary" data-action="pattern-apply" ${!editable() ? "disabled" : ""}>Incorporar selección</button></div></section></div>`;
  }
  function afterRender() {
    if (!m.active) return;
    document
      .querySelectorAll("[data-pattern-section]")
      .forEach((el) => (el.indeterminate = el.dataset.partial === "true"));
    if (m.focus) {
      const el = m.focus.node
        ? document.querySelector(`[data-pattern-node="${m.focus.node}"]`)
        : document.querySelector(`[name="${m.focus.name}"]`);
      el?.focus();
      if (m.focus.start != null)
        el?.setSelectionRange?.(m.focus.start, m.focus.start);
      m.focus = null;
    }
  }
  async function act(button) {
    const action = button.dataset.action;
    if (action === "open-patterns") {
      if (!state.estimateId) throw new Error("Abrí un presupuesto primero");
      m.busy = true;
      state.busy = true;
      m.active = true;
      m.dirty = false;
      m.error = "";
      m.feedback = "";
      m.name = "";
      m.parentId = state.selectedSectionId || "";
      m.projectId =
        state.projects.find((p) => p.id !== state.projectId)?.id ||
        state.projectId;
      m.kind = "project";
      try {
        m.templates = await invoke("list_budget_templates");
        await loadProject();
      } catch (error) {
        m.error = String(error);
      } finally {
        m.busy = false;
        state.busy = false;
        render();
      }
      return;
    }
    if (!action.startsWith("pattern-")) return false;
    if (m.busy) return true;
    m.error = "";
    if (action === "pattern-close") {
      close();
      return true;
    }
    if (action === "pattern-toggle") {
      if (m.collapsed.has(button.dataset.id))
        m.collapsed.delete(button.dataset.id);
      else m.collapsed.add(button.dataset.id);
      redraw();
      return true;
    }
    if (action === "pattern-all") {
      for (const l of m.snapshot?.lines || []) m.lines.add(l.id);
      for (const s of m.snapshot?.sections || []) m.sections.add(s.id);
      m.dirty = true;
      redraw();
      return true;
    }
    if (action === "pattern-none") {
      m.lines.clear();
      m.sections.clear();
      m.dirty = true;
      redraw();
      return true;
    }
    if (["pattern-save", "pattern-apply"].includes(action)) {
      m.busy = true;
      const body = document.querySelector(".pattern-dialog .dialog-body");
      if (body) body.inert = true;
      try {
        if (!m.snapshot || (!m.lines.size && !m.sections.size))
          throw new Error("Seleccioná al menos un rubro o partida");
        if (action === "pattern-save") {
          if (!m.name.trim()) throw new Error("Ingresá el nombre del patrón");
          await invoke("save_budget_pattern", {
            source: source(),
            selection: selection(),
            name: m.name.trim(),
            includePrices: m.prices,
          });
          m.templates = await invoke("list_budget_templates");
          m.feedback = "Patrón guardado en la biblioteca";
          m.dirty = false;
        } else {
          if (!editable())
            throw new Error("El presupuesto emitido no se modifica");
          const result = await invoke("apply_budget_pattern", {
            destinationId: state.estimateId,
            source: source(),
            selection: selection(),
            includePrices: m.prices,
            parentId: m.parentId || null,
          });
          m.active = false;
          m.dirty = false;
          state.selectedLineId = result.line_ids[0] || state.selectedLineId;
          await loadEstimate();
          state.message = `Se incorporaron ${result.line_ids.length} partidas y ${result.section_ids.length} rubros`;
        }
      } catch (error) {
        m.error = String(error);
      } finally {
        m.busy = false;
        render();
      }
      return true;
    }
  }
  async function change(target) {
    if (!m.active || m.busy) return;
    const name = target.name;
    m.error = "";
    m.feedback = "";
    if (
      [
        "pattern-kind",
        "pattern-project",
        "pattern-template",
        "pattern-estimate",
      ].includes(name)
    ) {
      if (!canDiscard()) {
        render();
        return;
      }
      const value = target.value;
      m.dirty = false;
      m.busy = true;
      const body = document.querySelector(".pattern-dialog .dialog-body");
      if (body) body.inert = true;
      try {
        if (name === "pattern-kind") {
          m.kind = value;
          if (m.kind === "template") {
            m.templateId = m.templates[0]?.id || "";
            await loadSource();
          } else await loadProject();
        }
        if (name === "pattern-project") {
          m.projectId = value;
          await loadProject();
        }
        if (name === "pattern-template") {
          m.templateId = value;
          await loadSource();
        }
        if (name === "pattern-estimate") {
          m.estimateId = value;
          await loadSource();
        }
      } catch (error) {
        m.error = String(error);
      } finally {
        m.busy = false;
        render();
      }
      return;
    }
    if (target.dataset.patternLine) {
      const id = target.dataset.patternLine;
      if (target.checked) m.lines.add(id);
      else {
        m.lines.delete(id);
        const assigned = new Map(m.snapshot.assignments).get(id);
        for (const s of ancestors(assigned)) m.sections.delete(s);
      }
      m.dirty = true;
      redraw();
      return;
    }
    if (target.dataset.patternSection) {
      const ids = descendantSections(target.dataset.patternSection);
      for (const id of ids)
        if (target.checked) m.sections.add(id);
        else m.sections.delete(id);
      for (const l of memberLines(target.dataset.patternSection))
        if (target.checked) m.lines.add(l.id);
        else m.lines.delete(l.id);
      if (!target.checked)
        for (const id of ancestors(target.dataset.patternSection))
          m.sections.delete(id);
      m.dirty = true;
      redraw();
      return;
    }
    if (name === "pattern-prices") {
      m.prices = target.value === "true";
      m.dirty = true;
      redraw();
    }
    if (name === "pattern-parent") {
      m.parentId = target.value;
      m.dirty = true;
    }
  }
  function input(target) {
    if (!m.active) return;
    if (target.name === "pattern-name") {
      m.name = target.value;
      m.dirty = true;
    }
    if (target.name === "pattern-search") {
      m.query = target.value;
      redraw();
    }
  }
  function keyDown(evt) {
    if (!m.active) return false;
    if (evt.key === "Escape") {
      evt.preventDefault();
      close();
      return true;
    }
    if (evt.key === "Tab") {
      const nodes = [
          ...document.querySelectorAll(
            ".pattern-dialog button:not([disabled]),.pattern-dialog input,.pattern-dialog select",
          ),
        ],
        i = nodes.indexOf(document.activeElement);
      if (
        (evt.shiftKey && i === 0) ||
        (!evt.shiftKey && i === nodes.length - 1)
      ) {
        evt.preventDefault();
        nodes[evt.shiftKey ? nodes.length - 1 : 0]?.focus();
      }
      return true;
    }
    return false;
  }
  return { act, change, input, keyDown, markup, afterRender, model: m };
}
