import React from "react";
import { ParamSlider } from "../paramSlider";

export function ChorusControls({ index, update, initial }: { index:number; update:(i:number,p:Record<string,unknown>)=>void; initial?: { rate:number; depth:number; delay:number; mix:number } }) {
  const [rate, setRate] = React.useState(initial?.rate ?? 0.8)
  const [depth, setDepth] = React.useState(initial?.depth ?? 8)
  const [delay, setDelay] = React.useState(initial?.delay ?? 20)
  const [mix, setMix] = React.useState(initial?.mix ?? 0.5)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Rate" min={0.1} max={5} step={0.1} value={rate} fmt={v=>v.toFixed(1)+" Hz"} onChange={v=>{setRate(v);update(index,{rate:v})}} />
      <ParamSlider label="Depth" min={1} max={20} step={1} value={depth} fmt={v=>`${Math.round(v)} ms`} onChange={v=>{setDepth(v);update(index,{depth:v})}} />
      <ParamSlider label="Delay" min={5} max={30} step={1} value={delay} fmt={v=>`${Math.round(v)} ms`} onChange={v=>{setDelay(v);update(index,{delay:v})}} />
      <ParamSlider label="Mix" min={0} max={1} step={0.01} value={mix} fmt={v=>`${Math.round(v*100)}%`} onChange={v=>{setMix(v);update(index,{mix:v})}} />
    </div>
  )
}