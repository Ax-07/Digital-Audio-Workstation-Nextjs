import React from "react";
import { ParamSlider } from "../paramSlider";

export function AutoFilterControls({ index, update, initial }: { index:number; update:(i:number,p:Record<string,unknown>)=>void; initial?: { rate:number; depth:number; minFreq:number; maxFreq:number } }) {
  const [rate, setRate] = React.useState(initial?.rate ?? 1)
  const [depth, setDepth] = React.useState(initial?.depth ?? 0.8)
  const [minF, setMinF] = React.useState(initial?.minFreq ?? 200)
  const [maxF, setMaxF] = React.useState(initial?.maxFreq ?? 8000)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Rate" min={0.1} max={20} step={0.1} value={rate} fmt={v=>v.toFixed(1)+" Hz"} onChange={v=>{setRate(v);update(index,{rate:v})}} />
      <ParamSlider label="Depth" min={0} max={1} step={0.01} value={depth} fmt={v=>`${Math.round(v*100)}%`} onChange={v=>{setDepth(v);update(index,{depth:v})}} />
      <ParamSlider label="Min F" min={20} max={1000} step={5} value={minF} fmt={v=>`${Math.round(v)} Hz`} onChange={v=>{setMinF(v);update(index,{minFreq:v})}} />
      <ParamSlider label="Max F" min={500} max={20000} step={50} value={maxF} fmt={v=>`${Math.round(v)} Hz`} onChange={v=>{setMaxF(v);update(index,{maxFreq:v})}} />
    </div>
  )
}