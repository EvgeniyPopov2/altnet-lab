import { asRecord, oneOf } from "../../../../core/records";
// Контуры суши Natural Earth 1:110m (public domain), координаты в градусах.
// https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/
import land from "./landPaths.json";

export function mapSettings(value: unknown) {
  const v = asRecord(value);
  const n = (key: string, min: number, max: number, fallback: number) => {
    const x = v[key];
    return typeof x === "number" && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : fallback;
  };
  const theme = v.mapTheme ?? v.style;
  return {
    lat: n("lat", -90, 90, 0),
    lon: n("lon", -180, 180, 0),
    zoom: Math.round(n("zoom", 1, 20, 12)),
    height: n("height", 100, 1000, 280),
    label: typeof v.label === "string" ? v.label : "",
    mapTheme: oneOf(theme, ["light", "dark", "auto"]) ? theme : "auto",
    detailMap: v.detailMap === true,
  };
}

export function mapUrls(settings: ReturnType<typeof mapSettings>) {
  const { lat, lon, zoom } = settings;
  // Рамка OpenStreetMap использует Web Mercator. Маркер хранит исходную широту.
  const mercatorLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const halfLon = 360 / 2 ** (zoom + 1);
  const halfLat = (halfLon * Math.cos((mercatorLat * Math.PI) / 180)) / 1.8;
  const bounds = [
    lon - halfLon,
    Math.max(-85.0511, mercatorLat - halfLat),
    lon + halfLon,
    Math.min(85.0511, mercatorLat + halfLat),
  ];
  const query = new URLSearchParams({
    bbox: bounds.map((v) => v.toFixed(6)).join(","),
    layer: "mapnik",
    marker: lat + "," + lon,
  });
  return {
    link: "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lon + "#map=" + zoom + "/" + lat + "/" + lon,
    embed: "https://www.openstreetmap.org/export/embed.html?" + query.toString(),
  };
}

export function overviewSvg(settings: ReturnType<typeof mapSettings>, identifier: string): string {
  const id = "sb-map-land-" + identifier.replace(/[^A-Za-z0-9_-]/g, "");
  const { lat, lon, zoom } = settings;
  const x = lon + 180,
    y = 90 - lat;
  const span = 360 / (1 + Math.min(zoom - 1, 10) * 0.55),
    height = span / 2;
  const top = Math.min(180 - height, Math.max(0, y - height / 2));
  const r = span / 64,
    water = settings.mapTheme === "dark" ? "#202f46" : "#d9eaf4",
    ground = settings.mapTheme === "dark" ? "#647d85" : "#b3c7af";
  return (
    '<svg role="img" aria-label="Метка на обзорной карте" xmlns="http://www.w3.org/2000/svg" viewBox="' +
    [x - span / 2, top, span, height].join(" ") +
    '" preserveAspectRatio="xMidYMid meet">' +
    '<defs><path id="' +
    id +
    '" d="' +
    land.join(" ") +
    '"/></defs><rect x="-360" width="1080" height="180" fill="' +
    water +
    '"/>' +
    [-360, 0, 360]
      .map((offset) => '<use href="#' + id + '" transform="translate(' + offset + ' 0)" fill="' + ground + '"/>')
      .join("") +
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="' +
    r +
    '" fill="#6549bd" stroke="#fff" stroke-width="' +
    r / 3 +
    '"/></svg>'
  );
}
