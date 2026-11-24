import type { MapBlock } from "../../types";
import { mapSettings, overviewSvg } from "./geometry";

export default function MapView({ block }: { block: MapBlock }) {
  const map = mapSettings(block);
  return <figure style={{margin:0}}>
    <div className="sb-editor-map" style={{height: map.height}} dangerouslySetInnerHTML={{__html:overviewSvg(map,block.id)}} />
    <figcaption>{map.label || "Местоположение"} · {map.lat.toFixed(5)}, {map.lon.toFixed(5)}</figcaption>
  </figure>;
}
