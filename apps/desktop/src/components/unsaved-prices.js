// Product dialog: resolves navigation only after the user chooses how to handle prices.
export function askUnsavedPrices({ document, onSave }) {
  return new Promise((resolve) => {
    const previous = document.activeElement,
      overlay = document.createElement("div");
    overlay.className = "modal-overlay unsaved-prices-overlay";
    overlay.innerHTML =
      '<section class="dialog-shell" role="dialog" aria-modal="true" aria-label="Precios sin guardar"><div class="dialog-header"><h2>Precios sin guardar</h2></div><div class="compact-editor-body"><p>Hay precios o condiciones de proveedores que todavía no guardaste.</p><p data-save-error class="feature-error" role="alert"></p></div><div class="dialog-actions"><button class="btn primary" data-choice="save">Guardar y continuar</button><button class="btn" data-choice="discard">Descartar</button><button class="btn" data-choice="cancel">Cancelar</button></div></section>';
    const finish = (choice) => {
      overlay.remove();
      if (choice === "cancel") previous?.focus?.();
      resolve(choice);
    };
    overlay.addEventListener("click", async (event) => {
      const b = event.target.closest("[data-choice]");
      if (!b || overlay.dataset.saving) return;
      const choice = b.dataset.choice;
      if (choice !== "save") {
        finish(choice);
        return;
      }
      overlay.dataset.saving = "yes";
      overlay.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        await onSave();
        finish("save");
      } catch (error) {
        overlay.querySelector("[data-save-error]").textContent = String(error);
        delete overlay.dataset.saving;
        overlay.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!overlay.dataset.saving) finish("cancel");
      }
      if (event.key === "Tab") {
        const buttons = [...overlay.querySelectorAll("button:not(:disabled)")],
          i = buttons.indexOf(document.activeElement);
        event.preventDefault();
        event.stopPropagation();
        buttons[
          (i + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
      }
    });
    document.body.append(overlay);
    overlay.querySelector('[data-choice="save"]').focus();
  });
}
