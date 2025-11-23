import React from "react";
import { ParamSlider } from "../paramSlider";

export function CompressorControls({ index, update, initial }: { index: number; update: (i:number,p:Record<string,unknown>)=>void; initial?: { threshold:number; ratio:number; attack:number; release:number; knee:number; makeup:number } }) {
  const [threshold, setThreshold] = React.useState(initial?.threshold ?? -24)
  const [ratio, setRatio] = React.useState(initial?.ratio ?? 4)
  const [attack, setAttack] = React.useState(initial?.attack ?? 0.01)
  const [release, setRelease] = React.useState(initial?.release ?? 0.1)
  const [knee, setKnee] = React.useState(initial?.knee ?? 30)
  const [makeup, setMakeup] = React.useState(initial?.makeup ?? 0)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Thresh" min={-60} max={0} step={1} value={threshold} fmt={v=>`${Math.round(v)} dB`} onChange={v=>{setThreshold(v);update(index,{threshold:v})}} />
      <ParamSlider label="Ratio" min={1} max={20} step={0.5} value={ratio} fmt={v=>v.toFixed(1)} onChange={v=>{setRatio(v);update(index,{ratio:v})}} />
      <ParamSlider label="Attack" min={0.001} max={0.2} step={0.001} value={attack} fmt={v=>v.toFixed(3)+" s"} onChange={v=>{setAttack(v);update(index,{attack:v})}} />
      <ParamSlider label="Release" min={0.01} max={1} step={0.01} value={release} fmt={v=>v.toFixed(2)+" s"} onChange={v=>{setRelease(v);update(index,{release:v})}} />
      <ParamSlider label="Knee" min={0} max={40} step={1} value={knee} fmt={v=>`${Math.round(v)} dB`} onChange={v=>{setKnee(v);update(index,{knee:v})}} />
      <ParamSlider label="Makeup" min={-12} max={12} step={0.5} value={makeup} fmt={v=>`${v.toFixed(1)} dB`} onChange={v=>{setMakeup(v);update(index,{makeup:v})}} />
    </div>
  )
}