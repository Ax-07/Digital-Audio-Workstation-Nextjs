import React from "react";
import { ParamSlider } from "../paramSlider";

export function TremoloControls({ index, update, initial }: { index: number; update: (i:number,p:Record<string,unknown>)=>void; initial?: { rate:number; depth:number } }) {
  const [rate, setRate] = React.useState(initial?.rate ?? 4)
  const [depth, setDepth] = React.useState(initial?.depth ?? 0.5)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Rate" min={0.1} max={20} step={0.1} value={rate} fmt={v=>v.toFixed(1)+" Hz"} onChange={v=>{setRate(v);update(index,{rate:v})}} />
      <ParamSlider label="Depth" min={0} max={1} step={0.01} value={depth} fmt={v=>`${Math.round(v*100)}%`} onChange={v=>{setDepth(v);update(index,{depth:v})}} />
    </div>
  )
}
