import { Slider } from "@/shared/ui/slider";

export function ParamSlider({ label, value, onChange, min, max, step, fmt }:{ label:string; value:number; onChange:(v:number)=>void; min:number; max:number; step:number; fmt:(v:number)=>string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide w-16 text-muted-foreground">{label}</span>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={v=>onChange(v[0])} className="w-48" />
      <span className="text-xs tabular-nums w-16 text-right">{fmt(value)}</span>
    </div>
  )
}