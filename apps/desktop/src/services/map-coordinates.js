export function projectPoint({ lat, lon }, zoom) {
  const size = 256 * 2 ** zoom,
    sin = Math.sin(
      (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180,
    );
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}
export function unprojectPoint({ x, y }, zoom) {
  const size = 256 * 2 ** zoom;
  return {
    lat: Math.max(
      -85.0511,
      Math.min(
        85.0511,
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI,
      ),
    ),
    lon: (((((x / size) * 360) % 360) + 360) % 360) - 180,
  };
}
export function validLocation(lat, lon) {
  if (
    lat == null ||
    lon == null ||
    String(lat).trim() === "" ||
    String(lon).trim() === ""
  )
    return null;
  const point = { lat: Number(lat), lon: Number(lon) };
  return Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 85.0511 &&
    Math.abs(point.lon) <= 180
    ? point
    : null;
}
