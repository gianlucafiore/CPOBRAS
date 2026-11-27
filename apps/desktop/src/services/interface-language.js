import { catalogs, defaultLanguage } from "../locales/index.js";

export const languages = Object.entries(catalogs).map(([code, { label }]) => [code, label]);
export const currentInterfaceLanguage = () =>
  globalThis.document?.documentElement?.lang || defaultLanguage;

const loadedCatalogs = new Map();
const pendingCatalogs = new Map();

export async function loadInterfaceLanguage(language) {
  if (language === defaultLanguage || loadedCatalogs.has(language)) return;
  const loader = Object.hasOwn(catalogs, language) && catalogs[language].load;
  if (!loader) return;
  if (!pendingCatalogs.has(language)) {
    const request = loader().then(({default: catalog}) => {
      loadedCatalogs.set(language, catalog.messages);
    }).finally(() => pendingCatalogs.delete(language));
    pendingCatalogs.set(language, request);
  }
  await pendingCatalogs.get(language);
}

const placeholder = /\{([a-z_][\w-]*|\d+)\}/gi;
const htmlCharacters = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function interfaceText(language, message, params) {
  if (message == null) return "";
  const catalog = loadedCatalogs.get(language);
  const translation = catalog && Object.hasOwn(catalog, message) ? catalog[message] : message;
  const translated = translation === message
    ? message
    : (message.match(/^\s*/)?.[0] || "") + translation.trim() + (message.match(/\s*$/)?.[0] || "");
  return params ? translated.replace(placeholder, (token, key) =>
    Object.hasOwn(params, key) ? String(params[key] ?? "") : token
  ) : translated;
}

export const uiText = (message, params) =>
  interfaceText(currentInterfaceLanguage(), message, params);

export const uiHtml = (message, params) =>
  String(uiText(message, params)).replace(/[&<>"']/g, character => htmlCharacters[character]);

// Translate only known error messages. Keep arbitrary OS errors and user data intact.
export function localizedError(error, language = currentInterfaceLanguage()) {
  const message = error instanceof Error ? error.message : String(error);
  const translated = interfaceText(language, message);
  if (translated !== message) return translated;
  const invalidValue = /^invalid value: ([\s\S]*)$/.exec(message);
  if (invalidValue && language !== defaultLanguage) {
    const detail = interfaceText(language, invalidValue[1]);
    return interfaceText(language, "Valor inválido: {0}", [detail]);
  }
  return error;
}

export function uiPlural(count, forms, params = {}) {
  const language = currentInterfaceLanguage();
  const category = new Intl.PluralRules(language).select(count);
  return interfaceText(language, forms[category] || forms.other, {count, ...params});
}

export function dialogLocalization(language, command, args) {
  if (language === defaultLanguage) return args;
  const t = message => interfaceText(language, message);
  const titles = {
    choose_backup_folder: "Elegir carpeta de respaldos",
    save_export_file: "Guardar documento",
    add_project_attachment: "Agregar archivo al legajo de la obra",
  };
  if (command === "switch_database") {
    const title = args?.create ? t("Nueva base de datos de CPOBRAS")
      : args?.importCopy ? t("Importar base de datos de CPOBRAS") : t("Abrir base de datos de CPOBRAS");
    return { ...args, dialogTitle: title, sqliteFilter: t("Bases SQLite"), allFilesFilter: t("Todos los archivos") };
  }
  if (!Object.hasOwn(titles, command)) return args;
  return {
    ...args,
    dialogTitle: t(titles[command]),
    ...(command === "add_project_attachment" ? { documentFilter: t("Documentos y planos") } : {}),
  };
}

const dateFormatters = new Map();
export function displayDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso;
  const language = currentInterfaceLanguage();
  if (language === defaultLanguage) return iso.split("-").reverse().join("/");
  if (!dateFormatters.has(language)) dateFormatters.set(language,
    new Intl.DateTimeFormat(language, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }));
  return dateFormatters.get(language).format(new Date(iso + "T00:00:00Z"));
}

export function createInterfaceLanguage(document, window) {
  const storageKey = "cpobras:interface-language";
  function apply(language) {
    if (document.documentElement) document.documentElement.lang = language;
  }
  let language = defaultLanguage, saved = defaultLanguage, selection = 0;
  try {
    const preference = window.localStorage.getItem(storageKey);
    if (Object.hasOwn(catalogs, preference)) saved = preference;
  } catch { /* Use the default for this session. */ }
  apply(language);
  async function activate(value, remember) {
    if (!Object.hasOwn(catalogs, value)) return false;
    const version = ++selection;
    try {
      await loadInterfaceLanguage(value);
    } catch {
      return false;
    }
    if (version !== selection) return false;
    language = value;
    apply(language);
    if (remember) {
      try { window.localStorage.setItem(storageKey, language); }
      catch { /* Retain the choice for this session. */ }
    }
    return true;
  }
  return {
    get current() { return language; },
    ready: activate(saved, false),
    select: value => activate(value, true),
  };
}
