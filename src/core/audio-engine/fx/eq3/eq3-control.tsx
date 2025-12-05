import React from "react";
import { ParamSlider } from "../paramSlider";

export function Eq3Controls({ index, update, initial }: { index: number; update: (i:number,p:Record<string,unknown>)=>void; initial?: { lowGain:number; midGain:number; highGain:number; lowFreq:number; midFreq:number; midQ:number; highFreq:number } }) {
  const [low, setLow] = React.useState(initial?.lowGain ?? 0)
  const [lowF, setLowF] = React.useState(initial?.lowFreq ?? 200)
  const [mid, setMid] = React.useState(initial?.midGain ?? 0)
  const [midF, setMidF] = React.useState(initial?.midFreq ?? 1000)
  const [midQ, setMidQ] = React.useState(initial?.midQ ?? 0.9)
  const [high, setHigh] = React.useState(initial?.highGain ?? 0)
  const [highF, setHighF] = React.useState(initial?.highFreq ?? 8000)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Low" min={-18} max={18} step={0.5} value={low} fmt={v=>v.toFixed(1)+" dB"} onChange={v=>{setLow(v);update(index,{lowGain:v})}} />
      <ParamSlider label="Low F" min={20} max={1000} step={5} value={lowF} fmt={v=>`${Math.round(v)} Hz`} onChange={v=>{setLowF(v);update(index,{lowFreq:v})}} />
      <ParamSlider label="Mid" min={-18} max={18} step={0.5} value={mid} fmt={v=>v.toFixed(1)+" dB"} onChange={v=>{setMid(v);update(index,{midGain:v})}} />
      <ParamSlider label="Mid F" min={100} max={6000} step={10} value={midF} fmt={v=>`${Math.round(v)} Hz`} onChange={v=>{setMidF(v);update(index,{midFreq:v})}} />
      <ParamSlider label="Mid Q" min={0.4} max={4} step={0.1} value={midQ} fmt={v=>v.toFixed(1)} onChange={v=>{setMidQ(v);update(index,{midQ:v})}} />
      <ParamSlider label="High" min={-18} max={18} step={0.5} value={high} fmt={v=>v.toFixed(1)+" dB"} onChange={v=>{setHigh(v);update(index,{highGain:v})}} />
      <ParamSlider label="High F" min={1000} max={20000} step={50} value={highF} fmt={v=>`${Math.round(v)} Hz`} onChange={v=>{setHighF(v);update(index,{highFreq:v})}} />
    </div>
  )
}