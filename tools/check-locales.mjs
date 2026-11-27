import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogs, defaultLanguage } from "../apps/desktop/src/locales/index.js";

const root = fileURLToPath(new URL("../apps/desktop/src/", import.meta.url));
const required = new Set();
for (const relative of readdirSync(root, {recursive: true})) {
  if (!relative.endsWith(".js") || relative.includes(".generated.")) continue;
  const source = readFileSync(resolve(root, relative), "utf8");
  for (const match of source.matchAll(/\b(?:uiText|uiHtml)\(\s*("(?:[^"\\]|\\.)*")/g)) {
    required.add(JSON.parse(match[1]));
  }
}

const placeholder = /\{([a-z_][\w-]*|\d+)\}/gi;
const signature = text => [...text.matchAll(placeholder)].map(match => match[1]).sort().join("|");
const errors = [];
for (const [locale, entry] of Object.entries(catalogs)) {
  if (locale === defaultLanguage) continue;
  const { default: {label, messages} } = await entry.load();
  if (label !== entry.label) errors.push(`${locale}: el nombre no coincide con el registro`);
  if (!label || !messages) {
    errors.push(`${locale}: falta el nombre o el catálogo`);
    continue;
  }
  for (const key of required) {
    if (!Object.hasOwn(messages, key)) errors.push(`${locale}: falta ${key}`);
  }
  for (const [key, translation] of Object.entries(messages)) {
    if (typeof translation !== "string" || !translation.trim()) {
      errors.push(`${locale}: traducción vacía para ${key}`);
    } else if (signature(key) !== signature(translation)) {
      errors.push(`${locale}: los parámetros de ${key} cambiaron`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Catálogos verificados: ${required.size} mensajes explícitos y ${Object.keys(catalogs).length} idiomas.`);
}
