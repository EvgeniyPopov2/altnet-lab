import { useState } from "react";
import { Link2, RotateCcw, Unlink2 } from "lucide-react";
import { sides } from "../../boxDimensions";
import { blockBorderKeys } from "../../blockBorders";
import { useClassStyle } from "../../styleClassesContext";
import type { Block, Device, StyleLayer } from "../../types";
import type { BlockPatch } from "../patch";

export default function BlockBorders({block,device,onPatch}:{block:Block;device:Device;onPatch:(patch:BlockPatch)=>void}) {
  const layer=block.styleByBp?.[device] ?? {};
  const resolved=useClassStyle(block,device);
  const [linked,setLinked]=useState(() => !blockBorderKeys.some(key => resolved[key] !== undefined));
  function edit(fields:string[], value?:number) {
    onPatch(latest=>{
      const layers=latest.styleByBp ?? {}, next:StyleLayer={...layers[device]};
      for (const key of fields) { if (value===undefined) delete next[key]; else next[key]=value; }
      return {styleByBp:{...layers,[device]:next}};
    });
  }
  return <fieldset className="sb-four-control">
    <legend>Толщина рамки по сторонам, px</legend>
    <div className="sb-four-tools">
      <button type="button" aria-label="Стороны рамки — связать" aria-pressed={linked} onClick={()=>setLinked(!linked)}>{linked?<Link2 size={14}/>:<Unlink2 size={14}/>}</button>
      <button type="button" aria-label="Стороны рамки — сбросить" onClick={()=>edit(blockBorderKeys)}><RotateCcw size={13}/></button>
    </div>
    <div className="sb-four-fields">{sides.map(([,side,label],index)=><label key={side}>
      <span>{label}</span><input aria-label={"Рамка блока — "+label.toLowerCase()} type="number" min={0} max={512} step="any"
        value={layer[blockBorderKeys[index]] ?? ""} placeholder={String(resolved[blockBorderKeys[index]] ?? resolved.bw ?? 0)}
        onChange={event=>{const value=event.target.valueAsNumber;if (!event.target.value || Number.isFinite(value))
          edit(linked?blockBorderKeys:[blockBorderKeys[index]],event.target.value ? Math.max(0,Math.min(512,value)) : undefined);}}/>
    </label>)}</div>
  </fieldset>;
}
