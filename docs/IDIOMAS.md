# Idiomas de CP Obras

CP Obras conserva el español de Argentina como idioma de origen. Inglés, portugués de Brasil y francés tienen catálogos propios en `apps/desktop/src/locales/`. En **Opciones → Apariencia → Idioma** se puede cambiar el idioma de la interfaz y de los documentos que se generen desde ese momento. La preferencia es de la aplicación y se conserva al cambiar de base o reiniciar.

Los nombres y descripciones guardados por los usuarios, junto con los datos del presupuesto, conservan su contenido original. El idioma de los controles propios del sistema operativo y de los mensajes que devuelve el sistema depende de su configuración. Los archivos de intercambio conservan los identificadores que necesitan sus importadores.

## Agregar un idioma

1. Copiá [en.json](../apps/desktop/src/locales/en.json) a un archivo con el código BCP 47 del nuevo idioma. Cambiá `label` al nombre que los usuarios reconocerán en el selector.
2. Traducí los valores de `messages`. Las claves son el mensaje de origen en español. Conservá los parámetros como `{0}`, `{1}` o `{count}`. Podés cambiar su posición para respetar la gramática del idioma.
3. Agregá un módulo como [en.js](../apps/desktop/src/locales/en.js) que exporte el catálogo y registralo en [index.js](../apps/desktop/src/locales/index.js). Aparecerá en Opciones y se cargará desde los archivos locales de la aplicación cuando se elija ese idioma.
4. Ejecutá `node tools/check-locales.mjs` desde la raíz y `npm --prefix apps/desktop test`. Revisá la interfaz, un PDF y una planilla generados en el nuevo idioma.

## Agregar textos

Usá `uiText("…")` para texto plano y `uiHtml("…")` dentro de plantillas HTML. `uiHtml` escapa tanto el mensaje como sus parámetros. No se debe traducir un nombre de obra, un identificador de base de datos, una unidad contractual ni una ruta de archivo.

Ejemplo con un dato ingresado por el usuario:

```js
uiHtml("Obra: {0}", [project.name])
```

Para un contador, usá `uiPlural` con las categorías de `Intl.PluralRules` que necesite el mensaje. Un texto sin traducción usa el mensaje de origen. La comprobación de catálogos detecta mensajes ausentes y parámetros eliminados, agregados o duplicados antes de publicar.

Las traducciones iniciales se prepararon localmente con modelos de [Argos Translate](https://github.com/argosopentech/argos-translate) y se ajustaron con terminología de CP Obras. Los modelos y las herramientas de traducción no forman parte de la aplicación.
