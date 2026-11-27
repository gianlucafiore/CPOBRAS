import { uiText, uiHtml } from "../services/interface-language.js";
import { e, field } from "./helpers.js";
const has = (person, role) => person.role === role || person.role === "both";
const labels = { client: "cliente", supplier: "proveedor" };
const titles = { client: "Clientes", supplier: "Proveedores" };
const normalizeContact = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const blank = () => ({
  name: "",
  cuit: "",
  code: "",
  email: "",
  phone: "",
  address: "",
});
export function createPersons({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
  loadCollections,
}) {
  const m = { modal: null, parent: null, timer: null, sequence: 0, query: "" };
  const role = () => (state.view === "suppliers" ? "supplier" : "client");
  const entries = (r) =>
    r === "client" ? state.personClients || [] : state.personSuppliers || [];
  const opposite = (r) => (r === "client" ? "supplier" : "client");
  function markup() {
    const r = role();
    return `<main class="feature-page persons-page"><div class="feature-toolbar"><h1>${titles[r]}</h1><button class="btn primary" data-action="person-new">${uiHtml("Nuevo")} ${labels[r]}</button><button class="btn" data-action="person-refresh">${uiHtml("Actualizar contactos")}</button><button class="btn" data-action="person-import">${uiHtml("Importar desde")} ${titles[opposite(r)].toLowerCase()}</button></div><p>${r === "client" ? uiHtml("Personas a las que les presupuestás y realizás obras.") : uiHtml("Personas que te suministran materiales o servicios.")} ${uiHtml("Si ya existe en")} ${titles[opposite(r)].toLowerCase()}${uiHtml(", incorporala para reutilizar sus datos.")}</p><table class="data-grid"><thead><tr><th>${uiHtml("Nombre / razón social")}</th><th>CUIT</th><th>${uiHtml("Teléfono")}</th><th>${uiHtml("Correo")}</th><th></th></tr></thead><tbody>${
      entries(r)
        .filter(p=>p[r+"_active"]!==false)
        .map(
          (p) =>
            `<tr data-searchable="${e((p.name + " " + (p.cuit || "") + " " + p.email).toLowerCase())}"><td><strong>${e(p.name)}</strong>${p.role === "both" ? ` <span class="person-both">${uiHtml("También")} ${labels[opposite(r)]}</span>` : ""}</td><td>${e(p.cuit || "—")}</td><td>${e(p.phone || "—")}</td><td>${e(p.email || "—")}</td><td><select class="person-actions" aria-label="${uiHtml("Acciones de {0}", [p.name])}" data-person-actions data-id="${e(p.id)}" data-role="${r}"><option value="">${uiHtml("Acciones")}</option><option value="person-edit">${uiHtml("Editar")} ${labels[r]}</option><option value="person-deactivate">${uiHtml("Dar de baja")}</option><option value="person-delete">${uiHtml("Eliminar si no fue usado")}</option></select></td></tr>`,
        )
        .join("") ||
      ("<tr><td colspan=\"5\">" + uiHtml("Sin contactos en este apartado.") + "</td></tr>")
    }</tbody></table><details class="inactive-persons"><summary>${titles[r]} ${uiHtml("dados de baja (")}${entries(r).filter(p=>p[r+"_active"]===false).length})</summary><table class="data-grid"><tbody>${entries(r).filter(p=>p[r+"_active"]===false).map(p=>`<tr><td>${e(p.name)}</td><td>${e(p.cuit||"—")}</td><td><button class="btn tiny" data-action="person-reactivate" data-id="${p.id}" data-role="${r}">${uiHtml("Reactivar")}</button></td></tr>`).join("")||("<tr><td>" + uiHtml("Sin contactos dados de baja.") + "</td></tr>")}</tbody></table></details></main>`;
  }
  function matchesMarkup() {
    const dialog = m.modal;
    if (!dialog) return "";
    const list =
      dialog.kind === "import"
        ? entries(opposite(dialog.role))
            .filter((p) => !has(p, dialog.role) && p[opposite(dialog.role)+"_active"]!==false)
            .filter((p) =>
              normalizeContact(
                p.name + " " + (p.cuit || "") + " " + p.email,
              ).includes(normalizeContact(dialog.query)),
            )
            .map((person) => ({
              person,
              reason:
                "Registrado en " + titles[opposite(dialog.role)].toLowerCase(),
            }))
        : dialog.matches;
    return `<div class="person-matches" aria-live="polite">${dialog.kind === "import" ? "" : ("<strong>" + uiHtml("Coincidencias en los contactos existentes") + "</strong>")}${list.length ? list.map(({ person: p, reason }) => `<div class="person-match"><div><b>${e(p.name)}</b><small>${e(reason)}${[p.cuit, p.email, p.phone].filter(Boolean).length ? " · " + e([p.cuit, p.email, p.phone].filter(Boolean).join(" · ")) : ""} · ${p.role === "both" ? uiHtml("Cliente y proveedor") : titles[p.role]}</small></div><button class="btn" type="button" data-action="person-use" data-id="${p.id}">${has(p, dialog.role) ? uiHtml("Usar contacto existente") : uiHtml("Incorporar como {0}", [labels[dialog.role]])}</button></div>`).join("") : dialog.kind === "import" ? ("<p>" + uiHtml("No hay contactos pendientes de incorporar con esta búsqueda.") + "</p>") : ("<p class=\"small-muted\">" + uiHtml("Al escribir nombre, CUIT, correo o teléfono se buscarán posibles coincidencias.") + "</p>")}${dialog.kind !== "import" && list.length ? ("<p class=\"small-muted\">" + uiHtml("Incorporar usa los datos del contacto existente y conserva su otra función. El parecido del nombre no une registros automáticamente.") + "</p>") : ""}</div>`;
  }
  function modalMarkup() {
    if (!m.modal) return "";
    const d = m.modal,
      p = d.values;
    return `<div class="modal-overlay person-overlay"><section class="dialog-shell wide" role="dialog" aria-modal="true" aria-label="${d.kind === "import" ? uiHtml("Importar contactos") : (d.id ? "Editar " : "Nuevo ") + labels[d.role]}"><div class="dialog-header"><h2>${d.kind === "import" ? uiHtml("Importar desde {0}", [titles[opposite(d.role)].toLowerCase()]) : (d.id ? "Editar " : "Nuevo ") + labels[d.role]}</h2><button class="close-dialog" type="button" data-action="person-close" aria-label="${uiHtml("Cerrar contacto")}">×</button></div>${d.kind === "import" ? `<div class="dialog-body">${field(uiText("Buscar contacto para incorporar"), "person-import-query", d.query, 'autocomplete="off"')}<p>${uiHtml("Se agregará la función de")} ${labels[d.role]} ${uiHtml("a la misma persona, conservando sus datos.")}</p><div id="person-match-host">${matchesMarkup()}</div><p class="feature-error" role="alert"></p><button class="btn" data-action="person-new-in-modal">${uiHtml("Crear")} ${labels[d.role]} ${uiHtml("nuevo")}</button></div>` : `<form id="person-form" class="dialog-body"><p>${d.existingRole === "both" ? uiHtml("Esta persona también está en {0}. Los cambios de contacto se verán en ambas vistas.", [titles[opposite(d.role)].toLowerCase()]) : uiHtml("Cargá los datos del {0}. Revisá las coincidencias antes de crear otro registro.", [labels[d.role]])}</p>${field(uiText("Nombre / razón social"), "person-name", p.name, 'required maxlength="500" autocomplete="off"')}<div class="form-grid">${field(uiText("CUIT / identificación"), "person-cuit", p.cuit || "", 'maxlength="50"')}${field(uiText("Código del contacto"), "person-code", p.code, 'maxlength="100"')}${field(uiText("Correo del contacto"), "person-email", p.email, 'maxlength="1000"')}${field(uiText("Teléfono del contacto"), "person-phone", p.phone, 'maxlength="1000"')}</div>${field(uiText("Domicilio del contacto"), "person-address", p.address, 'maxlength="1000"')}<div id="person-match-host">${matchesMarkup()}</div><p class="feature-error" role="alert"></p><div class="dialog-actions"><button class="btn" type="button" data-action="person-close">${uiHtml("Cerrar")}</button><button class="btn primary" type="submit">${d.id ? uiHtml("Guardar contacto") : uiHtml("Crear {0}", [labels[d.role]])}</button></div></form>`}</section></div>`;
  }
  function show() {
    document.querySelector(".person-overlay")?.remove();
    document
      .querySelector("#app")
      .insertAdjacentHTML("beforeend", modalMarkup());
    document.querySelector(".person-overlay input")?.focus();
  }
  function open(kind, r, existing = null) {
    m.sequence++;
    if (m.timer) window.clearTimeout(m.timer);
    m.modal = {
      kind,
      role: r,
      id: existing?.id || null,
      revision: existing?.revision || 0,
      existingRole: existing?.role || r,
      values: existing
        ? Object.fromEntries(
            Object.keys(blank()).map((k) => [k, existing[k] || ""]),
          )
        : blank(),
      matches: [],
      query: "",
      dirty: false,
    };
    show();
  }
  function close(force = false) {
    if (state.busy && !force) return false;
    if (
      !force &&
      m.modal?.dirty &&
      !window.confirm(uiText("¿Descartar los datos del contacto sin guardar?"))
    )
      return false;
    m.sequence++;
    if (m.timer) window.clearTimeout(m.timer);
    m.modal = null;
    document.querySelector(".person-overlay")?.remove();
    if (m.parent) {
      m.parent.form.closest(".dialog-shell").inert = false;
      m.parent = null;
    }
    return true;
  }
  async function accepted(person) {
    if (m.modal) {
      m.modal.id = person.id;
      m.modal.revision = person.revision;
    }
    const parent = m.parent;
    await loadCollections();
    close(true);
    if (parent?.form.isConnected) {
      const form = parent.form;
      if (parent.role === "client") {
        const select = form.querySelector("[name=clientId]");
        select.innerHTML = state.clients
          .filter(c=>state.personClients.find(p=>p.id===c.id)?.client_active!==false)
          .map((p) => `<option value="${p.id}">${e(p.name)}</option>`)
          .join("");
        select.value = person.id;
      } else {
        const selected = new Set(
          [...form.querySelectorAll("[name=supplierIds]:checked")].map(
            (n) => n.value,
          ),
        );
        selected.add(person.id);
        updateProjectSuppliers(form, selected);
      }
      state.modalDirty = true;
    } else {
      render();
    }
  }
  function updateProjectSuppliers(form, selection) {
    const host = form.querySelector(".project-supplier-options");
    const search = form.querySelector("[name=project-supplier-search]");
    if (search) search.value = "";
    if (!host) return;
    host.innerHTML =
      (state.personSuppliers || [])
        .filter(p=>p.supplier_active!==false || selection.has(p.id))
        .map(
          (p) =>
            `<label class="project-supplier-choice" data-supplier-search="${e((p.name + " " + (p.cuit || "")).toLowerCase())}"><input type="checkbox" name="supplierIds" value="${p.id}" ${selection.has(p.id) ? "checked" : ""}>${e(p.name)}${p.cuit ? " · " + e(p.cuit) : ""}</label>`,
        )
        .join("") ||
      ("<p>" + uiHtml("Sin proveedores. Podés crear uno o incorporarlo desde Clientes.") + "</p>");
  }
  async function act(button) {
    const a = button.dataset.action;
    if (!a.startsWith("person-")) return false;
    if (["person-deactivate","person-reactivate","person-delete"].includes(a)) {
      const r=button.dataset.role||role();
      if(a!=="person-reactivate" && !window.confirm(a==="person-delete" ? uiText("¿Eliminar este contacto? Si tiene usos registrados se impedirá la eliminación; podés darlo de baja.") : uiText("¿Dar de baja este contacto para nuevas selecciones? Su historial se conserva.")))return true;
      if(a==="person-delete")await invoke("delete_unused_person",{id:button.dataset.id});
      else await invoke("set_entity_archived",{kind:"person:"+r,id:button.dataset.id,archived:a==="person-deactivate"});
      await loadCollections();render();return true;
    }
    if (a === "person-refresh") {
      await loadCollections();
      render();
      return true;
    }
    if (a === "person-close") {
      close();
      return true;
    }
    if (a === "person-project-new" || a === "person-project-import") {
      const form = document.querySelector("#dialog-form");
      m.parent = { form, role: button.dataset.role };
      form.closest(".dialog-shell").inert = true;
      open(a.endsWith("import") ? "import" : "edit", button.dataset.role);
      return true;
    }
    if (a === "person-new" || a === "person-import") {
      m.parent = null;
      open(a === "person-import" ? "import" : "edit", role());
      return true;
    }
    if (a === "person-new-in-modal") {
      if (
        m.modal.dirty &&
        !window.confirm(
          uiText("¿Descartar los datos cargados y abrir un contacto nuevo?"),
        )
      )
        return true;
      open("edit", m.modal.role);
      return true;
    }
    if (a === "person-edit") {
      m.parent = null;
      open(
        "edit",
        role(),
        entries(role()).find((p) => p.id === button.dataset.id),
      );
      return true;
    }
    if (a === "person-use") {
      const d = m.modal,
        p = [
          ...(state.personClients || []),
          ...(state.personSuppliers || []),
        ].find((p) => p.id === button.dataset.id);
      if (!p) return true;
      const feedback = document.querySelector(".person-overlay .feature-error");
      state.busy = true;
      try {
        const person = has(p, d.role)
          ? p
          : await invoke("add_person_role", {
              id: p.id,
              revision: p.revision,
              role: d.role,
            });
        await accepted(person);
      } catch (error) {
        feedback.textContent = String(error);
      } finally {
        state.busy = false;
      }
      return true;
    }
    return true;
  }
  function input(target) {
    if (target.name === "project-supplier-search") {
      const q = target.value.toLowerCase();
      target
        .closest("form")
        .querySelectorAll("[data-supplier-search]")
        .forEach(
          (row) => (row.hidden = !row.dataset.supplierSearch.includes(q)),
        );
      return;
    }
    if (!m.modal || !target.closest?.(".person-overlay")) return;
    if (target.name === "person-import-query") {
      m.modal.query = target.value;
      document.querySelector("#person-match-host").innerHTML = matchesMarkup();
      return;
    }
    const key = target.name.replace(/^person-/, "");
    if (["name", "cuit", "code", "email", "phone", "address"].includes(key)) {
      m.modal.values[key] = target.value;
      m.modal.dirty = true;
      const seq = ++m.sequence;
      if (m.timer) window.clearTimeout(m.timer);
      m.timer = window.setTimeout(async () => {
        try {
          const matches = await invoke("find_similar_persons", {
            person: m.modal.values,
            excludeId: m.modal.id,
          });
          if (seq !== m.sequence || !m.modal) return;
          m.modal.matches = matches;
          document.querySelector("#person-match-host").innerHTML =
            matchesMarkup();
        } catch (error) {
          if (m.modal)
            document.querySelector(
              ".person-overlay .feature-error",
            ).textContent = String(error);
        }
      }, 250);
    }
  }
  async function submit(form) {
    const values = new FormData(form);
    const d = m.modal;
    if (d)
      for (const key of Object.keys(blank()))
        d.values[key] = String(values.get("person-" + key) || "");
    if (!d || d.kind === "import") return;
    const person = await invoke("save_person", {
      id: d.id,
      revision: d.revision,
      role: d.role,
      person: {
        ...blank(),
        ...Object.fromEntries(
          Object.keys(blank()).map((k) => [
            k,
            String(d.values[k] || "").trim(),
          ]),
        ),
        cuit: String(d.values.cuit || "").trim() || null,
      },
    });
    await accepted(person);
  }
  function keyDown(evt) {
    if (!m.modal) return false;
    if (evt.key === "Escape") {
      evt.preventDefault();
      close();
      return true;
    }
    if (evt.key === "Tab") {
      const all = [
          ...document.querySelectorAll(
            ".person-overlay input,.person-overlay button:not(:disabled)",
          ),
        ],
        first = all[0],
        last = all.at(-1);
      if (evt.shiftKey && document.activeElement === first) {
        evt.preventDefault();
        last?.focus();
      } else if (!evt.shiftKey && document.activeElement === last) {
        evt.preventDefault();
        first?.focus();
      }
      return true;
    }
    return false;
  }
  async function change(target) {
    if(!target.matches?.("[data-person-actions]")||!target.value)return;
    const action=target.value;target.value="";
    await act({dataset:{action,id:target.dataset.id,role:target.dataset.role}});
  }
  return {
    change,
    markup,
    act,
    input,
    submit,
    keyDown,
    close,
    hasModal: () => Boolean(m.modal),
    model: m,
  };
}
