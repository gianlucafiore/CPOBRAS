import { e } from "./helpers.js";
import {
  projectPoint,
  unprojectPoint,
  validLocation,
} from "../services/map-coordinates.js";
export function createWorkMap({ document, state, onSave }) {
  const argentina = { lat: -38.4161, lon: -63.6167 },
    model = {
      key: null,
      locationKey: null,
      center: argentina,
      zoom: 4,
      point: null,
      draft: null,
      editing: false,
      error: false,
    };
  let drag = null;
  function configure(key, attributes) {
    const point = validLocation(attributes.latitude, attributes.longitude),
      locationKey = JSON.stringify(point);
    if (key !== model.key || locationKey !== model.locationKey) {
      model.key = key;
      model.locationKey = locationKey;
      model.point = point;
      model.center = point || argentina;
      model.zoom = point ? 14 : 4;
      model.draft = null;
      model.editing = false;
      model.error = false;
    }
  }
  function markup(expanded = false) {
    return `<div class="work-map" data-work-map aria-label="Mapa de ubicación de la obra" role="application" tabindex="0" style="height:${expanded ? "min(62vh,650px)" : "260px"}"></div><div class="map-controls"><button class="btn" data-action="manage-map-zoom-out" aria-label="Alejar mapa">−</button><button class="btn" data-action="manage-map-zoom-in" aria-label="Acercar mapa">+</button><button class="btn" data-action="manage-map-center">${model.point ? "Ver ubicación" : "Ver Argentina"}</button>${!expanded ? '<button class="btn" data-action="manage-map-expand">Ampliar mapa</button>' : ""}${!state.remoteProject ? (model.editing ? '<button class="btn primary" data-action="manage-map-save">Guardar ubicación</button><button class="btn" data-action="manage-map-cancel">Cancelar ubicación</button>' : '<button class="btn" data-action="manage-map-edit">📍 Elegir ubicación</button>') : ""}</div><p class="map-help" role="status">${model.editing ? "Hacé clic para colocar el marcador o arrastrá el pin. Guardá para confirmar." : model.point ? "Ubicación guardada. Arrastrá el fondo para navegar." : "Vista aproximada de Argentina. Activá «Elegir ubicación» para colocar el marcador."}</p><small>© OpenStreetMap contributors · Requiere Internet</small>`;
  }
  function draw() {
    for (const host of document.querySelectorAll("[data-work-map]")) {
      const width = host.clientWidth || 360,
        height = host.clientHeight || 260,
        center = projectPoint(model.center, model.zoom),
        left = center.x - width / 2,
        top = center.y - height / 2,
        limit = 2 ** model.zoom;
      const oldTiles = new Map(
        Array.from(host.querySelectorAll(".map-tile")).map((image) => [
          image.dataset.tileKey,
          image,
        ]),
      );
      let feedback = host.querySelector(".map-load-error");
      if (!feedback) {
        feedback = document.createElement("span");
        feedback.className = "map-load-error";
        feedback.textContent =
          "No se pudo cargar la cartografía. Comprobá la conexión a Internet.";
        feedback.hidden = true;
        host.append(feedback);
      }
      for (
        let x = Math.floor(left / 256);
        x <= Math.floor((left + width) / 256);
        x++
      )
        for (
          let y = Math.max(0, Math.floor(top / 256));
          y <= Math.min(limit - 1, Math.floor((top + height) / 256));
          y++
        ) {
          const key = `${model.zoom}:${x}:${y}`;
          let image = oldTiles.get(key);
          oldTiles.delete(key);
          if (!image) {
            image = document.createElement("img");
            image.className = "map-tile";
            image.dataset.tileKey = key;
            image.alt = "";
            image.draggable = false;
            image.referrerPolicy = "strict-origin-when-cross-origin";
            image.src = `https://tile.openstreetmap.org/${model.zoom}/${((x % limit) + limit) % limit}/${y}.png`;
            image.addEventListener(
              "error",
              () => {
                feedback.hidden = false;
              },
              { once: true },
            );
            image.addEventListener(
              "load",
              () => {
                feedback.hidden = true;
              },
              { once: true },
            );
            host.append(image);
          }
          image.style.cssText = `left:${x * 256 - left}px;top:${y * 256 - top}px;width:256px;height:256px`;
        }
      for (const image of oldTiles.values()) image.remove();
      const point = model.editing ? model.draft : model.point;
      if (point) {
        const p = projectPoint(point, model.zoom);
        let delta = p.x - center.x;
        delta -= Math.round(delta / (256 * limit)) * 256 * limit;
        let marker = host.querySelector("[data-map-pin]");
        if (!marker) {
          marker = document.createElement("button");
          marker.type = "button";
          marker.className = "map-pin";
          marker.dataset.mapPin = "";
          marker.textContent = "📍";
          host.append(marker);
        }
        marker.setAttribute(
          "aria-label",
          "Marcador de ubicación" + (model.editing ? ", arrastrable" : ""),
        );
        marker.style.left = width / 2 + delta + "px";
        marker.style.top = p.y - top + "px";
        marker.title = point.lat.toFixed(6) + ", " + point.lon.toFixed(6);
      } else host.querySelector("[data-map-pin]")?.remove();
      host.classList.toggle("choosing-location", model.editing);
    }
  }
  function pointAt(event, host) {
    const rect = host.getBoundingClientRect(),
      center = projectPoint(model.center, model.zoom);
    return unprojectPoint(
      {
        x: center.x + event.clientX - rect.left - host.clientWidth / 2,
        y: center.y + event.clientY - rect.top - host.clientHeight / 2,
      },
      model.zoom,
    );
  }
  function pointerDown(event) {
    const host = event.target.closest?.("[data-work-map]");
    if (!host || event.button !== 0) return false;
    event.preventDefault();
    drag = {
      host,
      x: event.clientX,
      y: event.clientY,
      center: projectPoint(model.center, model.zoom),
      marker:
        model.editing && Boolean(event.target.closest?.("[data-map-pin]")),
      moved: false,
    };
    return true;
  }
  function pointerMove(event) {
    if (!drag) return false;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    drag.moved ||= Math.hypot(dx, dy) > 4;
    if (drag.marker) model.draft = pointAt(event, drag.host);
    else
      model.center = unprojectPoint(
        { x: drag.center.x - dx, y: drag.center.y - dy },
        model.zoom,
      );
    draw();
    return true;
  }
  function pointerUp(event) {
    if (!drag) return false;
    const old = drag;
    drag = null;
    if (model.editing && !old.marker && !old.moved)
      model.draft = pointAt(event, old.host);
    draw();
    return true;
  }
  async function act(action) {
    if (action === "manage-map-zoom-in")
      model.zoom = Math.min(19, model.zoom + 1);
    if (action === "manage-map-zoom-out")
      model.zoom = Math.max(2, model.zoom - 1);
    if (action === "manage-map-center") {
      model.center = model.point || argentina;
      model.zoom = model.point ? 14 : 4;
    }
    if (action === "manage-map-edit") {
      if (state.remoteProject) throw new Error("Obra externa de solo lectura");
      model.previousDirty = state.pageDirty;
      model.editing = true;
      model.draft = { ...(model.point || model.center) };
      state.pageDirty = true;
    }
    if (action === "manage-map-cancel") {
      model.editing = false;
      model.draft = null;
      state.pageDirty = model.previousDirty || false;
    }
    if (action === "manage-map-save") {
      if (state.remoteProject || !model.editing || !model.draft)
        throw new Error("Seleccioná una ubicación para guardar");
      await onSave(model.draft);
      model.editing = false;
      state.pageDirty = model.previousDirty || false;
    }
  }
  return {
    resetTransient: () => {
      drag = null;
      model.editing = false;
      model.draft = null;
    },
    model,
    configure,
    markup,
    draw,
    act,
    pointerDown,
    pointerMove,
    pointerUp,
    cancel: () => {
      drag = null;
    },
  };
}
