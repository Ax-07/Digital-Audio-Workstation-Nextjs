import React from "react";
import { ParamSlider } from "../paramSlider";

export function ReverbControls({ index, update, initial }: { index: number; update: (i:number,p:Record<string,unknown>)=>void; initial?: { duration:number; decay:number; wet:number } }) {
  const [duration, setDuration] = React.useState(initial?.duration ?? 2.0)
  const [decay, setDecay] = React.useState(initial?.decay ?? 2.0)
  const [wet, setWet] = React.useState(initial?.wet ?? 1)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Duration" min={0.2} max={10} step={0.1} value={duration} fmt={v=>v.toFixed(1)+"s"} onChange={v=>{setDuration(v);update(index,{duration:v})}} />
      <ParamSlider label="Decay" min={0.5} max={6} step={0.1} value={decay} fmt={v=>v.toFixed(1)} onChange={v=>{setDecay(v);update(index,{decay:v})}} />
      <ParamSlider label="Wet" min={0} max={1} step={0.01} value={wet} fmt={v=>Math.round(v*100)+"%"} onChange={v=>{setWet(v);update(index,{wet:v})}} />
    </div>
  )
}