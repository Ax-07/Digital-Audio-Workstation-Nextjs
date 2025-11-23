import React from "react";
import { ParamSlider } from "../paramSlider";

export function LimiterControls({ index, update, initial }: { index: number; update: (i:number,p:Record<string,unknown>)=>void; initial?: { ceiling:number; release:number; preGain:number } }) {
  const [threshold, setThreshold] = React.useState(-1)
  const [ratio, setRatio] = React.useState(20)
  const [attack, setAttack] = React.useState(0.003)
  const [release, setRelease] = React.useState(initial?.release ?? 0.05)
  const [preGain, setPreGain] = React.useState(initial?.preGain ?? 0)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Thresh" min={-24} max={0} step={0.5} value={threshold} fmt={v=>`${v.toFixed(1)} dB`} onChange={v=>{setThreshold(v);update(index,{threshold:v})}} />
      <ParamSlider label="Ratio" min={10} max={20} step={1} value={ratio} fmt={v=>v.toFixed(0)} onChange={v=>{setRatio(v);update(index,{ratio:v})}} />
      <ParamSlider label="Attack" min={0.0005} max={0.01} step={0.0005} value={attack} fmt={v=>v.toFixed(3)+" s"} onChange={v=>{setAttack(v);update(index,{attack:v})}} />
      <ParamSlider label="Release" min={0.01} max={0.2} step={0.005} value={release} fmt={v=>v.toFixed(3)+" s"} onChange={v=>{setRelease(v);update(index,{release:v})}} />
      <ParamSlider label="PreGain" min={-12} max={12} step={0.5} value={preGain} fmt={v=>`${v.toFixed(1)} dB`} onChange={v=>{setPreGain(v);update(index,{preGain:v})}} />
    </div>
  )
}