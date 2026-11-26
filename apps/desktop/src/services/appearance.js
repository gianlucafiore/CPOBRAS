export const colorThemes = [
  ["default", "CP Obras (predeterminado)"],
  ["city-light", "City Light"],
  ["city-night", "City Night"],
  ["dracula", "Drácula"],
  ["malva", "Malva"],
  ["contrast", "Alto contraste"],
];

const storageKey = "cpobras:appearance";
export function createAppearance(document, window) {
  let saved;
  try {
    saved = JSON.parse(window.localStorage.getItem(storageKey));
  } catch { /* The default also works with unavailable local storage. */ }
  const preference = {
    theme: colorThemes.some(([theme]) => theme === saved?.theme) ? saved.theme : "default",
    followSystem: saved?.followSystem === true,
  };
  const system = window.matchMedia?.("(prefers-color-scheme: dark)");

  function apply() {
    if (!document.documentElement) return;
    document.documentElement.dataset.colorPalette = preference.followSystem
      ? (system?.matches ? "city-night" : "default")
      : preference.theme;
  }
  system?.addEventListener?.("change", apply);
  apply();

  function change(target) {
    if (target.name === "follow-system-theme") {
      preference.followSystem = target.checked;
      const choices = document.querySelector("[data-theme-choices]");
      if (choices) choices.disabled = preference.followSystem;
    } else if (target.name === "color-theme" && colorThemes.some(([theme]) => theme === target.value)) {
      preference.theme = target.value;
    } else {
      return false;
    }
    apply();
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(preference));
    } catch { /* The choice remains active for this session. */ }
    return true;
  }
  return { preference, change };
}
