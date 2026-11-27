import { uiText, currentInterfaceLanguage } from "./interface-language.js";
import {createPdf} from "./pdf-units.js";
export async function exportSiteBook(invoke, model, entries) {
  const { jsPDF } = await import("jspdf");
  const pdf = createPdf(jsPDF),
    height = pdf.internal.pageSize.getHeight();
  let y = 20;
  const heading = () => {
    pdf.setFontSize(16);
    pdf.text(uiText("Libro de obra"), 14, 16);
    pdf.setFontSize(9);
    pdf.text(uiText("Partes confirmados · {0}", [model.projectName || "Obra"]), 14, 23);
    y = 33;
  };
  heading();
  for (const r of entries) {
    const lines = pdf.splitTextToSize(r.description, 180);
    if (y + 18 > height - 15) {
      pdf.addPage();
      heading();
    }
    pdf.setFont("helvetica", "bold");
    pdf.text(
      r.number + " · " + new Date(r.created_at).toLocaleString(currentInterfaceLanguage()),
      14,
      y,
    );
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(
      uiText("Confirmado: {0}", [new Date(r.confirmed_at).toLocaleString(currentInterfaceLanguage())]),
      14,
      y,
    );
    y += 6;
    pdf.setFontSize(10);
    for (const line of lines) {
      if (y > height - 15) {
        pdf.addPage();
        heading();
      }
      pdf.text(line, 14, y);
      y += 5;
    }
    y += 8;
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.text(`${i} / ${pages}`, 185, height - 7);
  }
  const name = `Libro de obra ${entries[0].number} a ${entries.at(-1).number}.pdf`,
    result = await invoke("save_export_file", {
      name,
      openAfter: true,
      bytes: [...new Uint8Array(pdf.output("arraybuffer"))],
    });
  return result ? result.path + (result.open_error ? " · " + result.open_error : "") : "";
}
