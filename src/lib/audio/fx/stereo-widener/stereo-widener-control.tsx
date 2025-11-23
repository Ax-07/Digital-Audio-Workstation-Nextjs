import { Slider } from "@/components/ui/slider";
import React from "react";

export function StereoWidenerControls({ index, update, initial }: { index:number; update:(i:number,p:Record<string,unknown>)=>void; initial?: { width:number } }) {
  const [width, setWidth] = React.useState(initial?.width ?? 1)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide w-16 text-muted-foreground">Width</span>
      <Slider value={[width]} min={0} max={2} step={0.01} onValueChange={v=>{setWidth(v[0]);update(index,{width:v[0]})}} className="w-48" />
      <span className="text-xs tabular-nums w-16 text-right">{width.toFixed(2)}</span>
    </div>
  )
}