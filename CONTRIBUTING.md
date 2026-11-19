# Contribuir a CP Obras

Podés aportar ejemplos de uso, correcciones de documentación, reportes de
errores o cambios de código.

## Reportes y propuestas

Buscá primero en [Issues](https://github.com/gianlucafiore/CPOBRAS/issues).
Para un error, incluí la versión de CP Obras, el sistema operativo, los pasos
para reproducirlo y el resultado que esperabas. Si adjuntás un ejemplo,
usá datos ficticios para mantener privados los presupuestos, clientes y claves.
Para una mejora, describí qué tarea querés resolver y cómo la realizás hoy.

## Cambios de código o documentación

1. Hacé un fork, clonalo y creá una rama desde `main`.
2. Para la aplicación de escritorio, seguí los [requisitos y comandos del README](README.md#instalar-dependencias).
3. Ejecutá las [comprobaciones pertinentes](README.md#pruebas-y-comprobaciones)
   y anotá qué pudiste verificar.
4. Abrí un pull request contra `main`. Describí el cambio, cómo lo probaste
   y, si modifica la interfaz, adjuntá capturas.

El sitio público vive en `site/`. Para probarlo desde la raíz del repositorio,
ejecutá `python3 -m http.server 8000 --directory site` y abrí
[http://localhost:8000](http://localhost:8000).
