export const defaultLanguage = "es-AR";

// Register a locale here to offer it in Opciones and bundle its catalog as a local chunk.
export const catalogs = {
  [defaultLanguage]: { label: "Español" },
  "pt-BR": {
    label: "Português (Brasil)",
    load: () => import("./pt-BR.js"),
  },
  fr: {
    label: "Français",
    load: () => import("./fr.js"),
  },
  en: {
    label: "English",
    load: () => import("./en.js"),
  },
};
