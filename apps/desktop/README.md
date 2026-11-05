# CPOBRAS Desktop (Tauri 2)

Los [comandos de instalación, compilación, arranque y pruebas](../../README.md)
se mantienen en el README principal.

Desde este directorio:

```bash
npm ci
npm run tauri dev
```

Para compilar el frontend y el escritorio:

```bash
npm run build
npm run tauri build -- --no-bundle
```

La interfaz permite gestionar presupuestos, metrados, ACU, directorios de
organización, listas de precios, conversiones explícitas y planificación con Gantt.
La persistencia es SQLite local, dentro del directorio de datos de la aplicación.
La base nunca se comparte por una carpeta de red.

`workspace.js` solo arranca la aplicación; `app.js` coordina sus servicios,
componentes, acciones y estado. Los comandos nativos están agrupados en
`src-tauri/src/commands/`. `src-tauri/permissions/workspace.toml` declara las
operaciones que puede invocar exclusivamente la ventana principal local.

Los roles cargados en Organización definen responsabilidades de trabajo. Esta
versión local no implementa inicio de sesión ni aislamiento entre usuarios del
mismo equipo; la autenticación colaborativa corresponde a una etapa posterior.
