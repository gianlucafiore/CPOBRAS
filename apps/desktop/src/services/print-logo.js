export function logoUrl(bytes = []) {
  if (!bytes.length) return "";
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.slice(i, i + 8192));
  return "data:image/png;base64," + btoa(text);
}
export async function normalizeLogo(file) {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 3_000_000)
    throw new Error("Elegí un PNG o JPEG de hasta 3 MB");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 640 / bitmap.width, 640 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob || blob.size > 512_000)
      throw new Error("El logotipo procesado supera 512 KB");
    return [...new Uint8Array(await blob.arrayBuffer())];
  } finally {
    bitmap.close();
  }
}
