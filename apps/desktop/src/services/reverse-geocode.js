import { validLocation } from "./map-coordinates.js";
const cache = new Map();
let lastRequest = 0,
  queue = Promise.resolve();
export function reverseGeocode(point, fetcher = globalThis.fetch) {
  if (!validLocation(point.lat, point.lon))
    return Promise.reject(new Error("Coordenadas inválidas"));
  const key = point.lat.toFixed(6) + "," + point.lon.toFixed(6);
  if (cache.has(key)) return cache.get(key);
  const request = queue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.search = new URLSearchParams({
        format: "jsonv2",
        lat: point.lat.toFixed(6),
        lon: point.lon.toFixed(6),
        addressdetails: "1",
        zoom: "18",
        "accept-language": "es",
      }).toString();
      const response = await fetcher(url.toString(), {
        signal: controller.signal,
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("No se pudo consultar la dirección");
      const data = await response.json(),
        a = data.address;
      if (!a || data.error)
        throw new Error("No se encontró una dirección para ese punto");
      const locality =
          a.city || a.town || a.village || a.municipality || a.hamlet || "",
        province = a.state || a.region || "",
        address =
          [a.road || a.pedestrian || a.residential || "", a.house_number || ""]
            .filter(Boolean)
            .join(" ") ||
          [a.neighbourhood, a.suburb].filter(Boolean).join(", ") ||
          locality ||
          data.display_name;
      if (typeof address !== "string" || !address)
        throw new Error("Dirección incompleta");
      return {
        address: address.slice(0, 1000),
        locality: String(locality).slice(0, 500),
        province: String(province).slice(0, 500),
      };
    } finally {
      clearTimeout(timer);
    }
  });
  cache.set(key, request);
  queue = request.catch(() => {});
  request.catch(() => cache.delete(key));
  return request;
}
