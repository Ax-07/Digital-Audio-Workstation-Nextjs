import React from "react";
import { ParamSlider } from "../paramSlider";

export function DistortionControls({ index, update, initial }: { index:number; update:(i:number,p:Record<string,unknown>)=>void; initial?: { drive:number; tone:number; wet:number } }) {
  const [drive, setDrive] = React.useState(initial?.drive ?? 0.5)
  const [tone, setTone] = React.useState(initial?.tone ?? 8000)
  const [wet, setWet] = React.useState(initial?.wet ?? 0.5)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Drive" min={0} max={1} step={0.01} value={drive} fmt={v=>`${Math.round(v*100)}%`} onChange={v=>{setDrive(v);update(index,{drive:v})}} />
      <ParamSlider label="Tone" min={500} max={20000} step={50} value={tone} fmt={v=>`${Math.round(v)} Hz`} onChange={v=>{setTone(v);update(index,{tone:v})}} />
      <ParamSlider label="Wet" min={0} max={1} step={0.01} value={wet} fmt={v=>`${Math.round(v*100)}%`} onChange={v=>{setWet(v);update(index,{wet:v})}} />
    </div>
  )
}