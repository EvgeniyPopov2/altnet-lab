import type { MapBlock } from "../../types";

function osmLink(lat: number, lon: number, zoom: number) {
  const z = Math.min(20, Math.max(1, Math.floor(zoom || 12)));
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${z}/${lat}/${lon}`;
  return url;
}

export default function MapView({ block }: { block: MapBlock }) {
  const { lat, lon, zoom = 12, label, style = "auto" } = block;
  const bg = style === "dark" ? "bg-[#0b1022]" : style === "light" ? "bg-[#e6e9f4] text-[#0b1022]" : "bg-[#0f1630]";
  return (
    <div role="img" aria-label="Карта (заглушка)" className={`rounded-2xl border border-[#1f2751] p-3 grid gap-2 ${bg}`}>
      <div className="text-sm font-semibold text-[#e6e9f4]">{label || "Метка"}</div>
      <div className="text-xs text-[#c9d0e9]">Широта: {lat.toFixed(6)}; Долгота: {lon.toFixed(6)}; Зум: {zoom}</div>
      <a className="inline-block w-max px-2 py-1 rounded bg-[#101735] border border-[#1f2751] text-[#e6e9f4] hover:bg-[#121b3f]"
         href={osmLink(lat, lon, zoom)} target="_blank" rel="noopener noreferrer nofollow">
        Открыть в OpenStreetMap
      </a>
    </div>
  );
}
