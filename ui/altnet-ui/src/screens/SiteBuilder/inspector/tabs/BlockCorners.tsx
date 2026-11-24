import { useState } from "react";
import { Link2, RotateCcw, Unlink2 } from "lucide-react";
import { corners } from "../../corners";
import { blockCornerKeys } from "../../blockCorners";
import { useClassStyle } from "../../styleClassesContext";
import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";

export default function BlockCorners({block,device,onPatch}:{block:Block;device:Device;onPatch:(patch:BlockPatch)=>void}) {
  const layer=block.styleByBp?.[device] ?? {};
  const resolved=useClassStyle(block,device);
  const [linked,setLinked]=useState(() => !blockCornerKeys.some(key => resolved[key] !== undefined));
  const unit=resolved.blockCornerUnit === "%" ? "%" : "px";
  function edit(fields:string[], value?:string|number) {
    onPatch(latest=>{
      const layers=latest.styleByBp ?? {}, next:StyleLayer={...layers[device]};
      for (const key of fields) { if (value===undefined) delete next[key]; else next[key]=value; }
      return {styleByBp:{...layers,[device]:next}};
    });
  }
  return <fieldset className="sb-four-control">
    <legend>Углы блока</legend>
    <div className="sb-four-tools">
      <button type="button" aria-label="Углы блока — связать" aria-pressed={linked} onClick={()=>setLinked(!linked)}>{linked?<Link2 size={14}/>:<Unlink2 size={14}/>}</button>
      <select aria-label="Углы блока — единица" value={layer.blockCornerUnit ?? ""} onChange={event=>edit(["blockCornerUnit"],event.target.value || undefined)}>
        <option value="">Авто ({unit})</option><option value="px">px</option><option value="%">%</option>
      </select>
      <button type="button" aria-label="Углы блока — сбросить" onClick={()=>edit([...blockCornerKeys,"blockCornerUnit"])}><RotateCcw size={13}/></button>
    </div>
    <div className="sb-four-fields">{corners.map(([corner,label],index)=><label key={corner}>
      <span>{label}</span><input aria-label={"Угол блока — "+label.toLowerCase()} type="number" min={0} max={512} step="any"
        value={layer[blockCornerKeys[index]] ?? ""}
        placeholder={String(resolved[blockCornerKeys[index]] ?? (unit === "px" ? resolved.br : undefined) ?? 0)}
        onChange={event=>{const value=event.target.valueAsNumber;if (!event.target.value || Number.isFinite(value))
          edit(linked?blockCornerKeys:[blockCornerKeys[index]],event.target.value ? Math.max(0,Math.min(512,value)) : undefined);}}/>
    </label>)}</div>
  </fieldset>;
}
