import React from "react";
import { ParamSlider } from "../paramSlider";

export function DelayControls({ index, update, initial }: { index: number; update: (i:number,p:Record<string,unknown>)=>void; initial?: { time:number; feedback:number; wet:number } }) {
  const [time, setTime] = React.useState(initial?.time ?? 0.3)
  const [feedback, setFeedback] = React.useState(initial?.feedback ?? 0.35)
  const [wet, setWet] = React.useState(initial?.wet ?? 1)
  return (
    <div className="flex flex-col gap-1">
      <ParamSlider label="Time" min={0} max={2} step={0.01} value={time} fmt={v=>v.toFixed(2)+"s"} onChange={v=>{setTime(v);update(index,{time:v})}} />
      <ParamSlider label="Feedback" min={0} max={0.95} step={0.01} value={feedback} fmt={v=>Math.round(v*100)+"%"} onChange={v=>{setFeedback(v);update(index,{feedback:v})}} />
      <ParamSlider label="Wet" min={0} max={1} step={0.01} value={wet} fmt={v=>Math.round(v*100)+"%"} onChange={v=>{setWet(v);update(index,{wet:v})}} />
    </div>
  )
}