import {e} from './helpers.js';
import metadata from '../../package.json' with {type:'json'};
export function optionsMarkup(state) {
  return `<section class="list-page"><div class="list-top"><h1>Opciones</h1><button class="btn" data-action="navigate" data-view="projects">Volver a Inicio</button></div><section class="project-card"><h2>Base de datos</h2>${state.database ? `<p class="database-menu-path" title="${e(state.database.path)}">Base activa · ${e(state.database.name)}</p><p>${e(state.database.path)}</p><div class="heading-actions"><button class="btn" data-action="database-new">Nueva base de datos…</button><button class="btn" data-action="database-open">Abrir base de datos…</button></div>` : '<p>Base de datos local.</p>'}</section><section class="project-card"><h2>Acerca de…</h2><p><strong>CPOBRAS</strong> · Estudio de costos y gestión de obras</p><p>Versión ${e(metadata.version)}</p><p>Autor: Gianluca Fiore</p><p>Año: 2026</p></section></section>`;
}
