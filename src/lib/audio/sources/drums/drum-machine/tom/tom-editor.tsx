// tom-editor.tsx
"use client";

import { useState } from "react";
import { drumMachine, DrumInstrument } from "@/lib/audio/drum-machine/drum-machine";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DrumWavePreview } from "../DrumWavePreview";
import Knob from "@/components/daw/controls/knob";
import { cn } from "@/lib/utils";
import type { DrumPreset, TomParams, TomStyle } from "../types";
import { renderTomArray } from "./tom-dsp";

type Props = {
  trackId: string;
  /** "low" | "mid" | "high" | "floor" */
  style: TomStyle;
  /** "tomLow" | "tomMid" | "tomHigh" | "tomFloor" */
  instrument: DrumInstrument;
  label: string;
  className?: string;
};

export function TomEditorModule({ trackId, style, instrument, label, className }: Props) {
  const [tom, setTom] = useState<TomParams>(() => {
    const preset: DrumPreset = drumMachine.getTrackPreset(trackId);
    const initial = preset.toms?.[style];
    return {
      style,
      ...(initial ?? {}),
    };
  });

  const update = (patch: Partial<TomParams>) => {
    setTom((t) => ({ ...t, ...patch }));

    // Patch typé : on modifie toms[style]
    drumMachine.setTrackPreset(trackId, {
      toms: {
        [style]: {
          ...patch,
          style,
        },
      },
    });
  };

  const preview = async () => {
    const eng = AudioEngine.ensure();
    await eng.init();
    const ctx = eng.context;
    const when = (ctx?.currentTime ?? 0) + 0.02;

    // instrument est déjà un DrumInstrument ("tomLow" / "tomMid" / ...)
    drumMachine.playSound(instrument, 110, when, trackId);
  };

  if (!tom) return null;

  const attackMs = tom.ampAttackMs ?? (tom.ampAttackSec ? tom.ampAttackSec * 1000 : 3);
  const decayMs = tom.ampDecayMs ?? (tom.ampDecaySec ? tom.ampDecaySec * 1000 : 450);

  return (
    <Card className={cn("flex flex-col gap-4 p-4 overflow-hidden", className)}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="font-semibold leading-none">{label}</div>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Tom • {style}
          </span>
        </div>
        <Button variant="default" size="sm" onClick={preview}>
          Preview
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex gap-3 p-0 flex-wrap max-w-[860px]">
          {/* BODY / PITCH */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Body / Pitch</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Level"
                value={tom.level ?? 0.9}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ level: v })}
              />
              <Knob
                label="Body Hz"
                value={tom.bodyFreqHz ?? (style === "floor" ? 80 : style === "low" ? 110 : style === "mid" ? 160 : 220)}
                min={50}
                max={400}
                step={1}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ bodyFreqHz: v })}
              />
              <Knob
                label="Start Hz"
                value={tom.pitchStartHz ?? (tom.bodyFreqHz ?? 160) * 1.3}
                min={40}
                max={600}
                step={1}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ pitchStartHz: v })}
              />
              <Knob
                label="End Hz"
                value={tom.pitchEndHz ?? tom.bodyFreqHz ?? 160}
                min={40}
                max={400}
                step={1}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ pitchEndHz: v })}
              />
              <Knob
                label="Sweep ms"
                value={tom.sweepMs ?? 60}
                min={5}
                max={200}
                step={1}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ sweepMs: v })}
              />
              <Knob
                label="Sweep curve"
                value={tom.sweepCurve ?? 0.3}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ sweepCurve: v })}
              />
            </div>
          </div>

          {/* NOISE / ATTACK */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Noise / Attack</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Noise mix"
                value={tom.noiseMix ?? 0.15}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ noiseMix: v })}
              />
              <Knob
                label="Noise Decay"
                value={tom.noiseDecayMs ?? 200}
                min={10}
                max={800}
                step={5}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ noiseDecayMs: v })}
              />
              <Knob
                label="Noise HP Hz"
                value={tom.noiseHpHz ?? 1800}
                min={500}
                max={8000}
                step={50}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ noiseHpHz: v })}
              />
              <Knob
                label="Drive"
                value={tom.drive ?? 1.4}
                min={1}
                max={3}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ drive: v })}
              />
            </div>
          </div>

          {/* ENVELOPE */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[180px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Envelope</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Attack ms"
                value={attackMs}
                min={0}
                max={30}
                step={1}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ ampAttackMs: v, ampAttackSec: undefined })}
              />
              <Knob
                label="Decay ms"
                value={decayMs}
                min={100}
                max={2000}
                step={10}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ ampDecayMs: v, ampDecaySec: undefined })}
              />
            </div>
          </div>

          {/* FILTER */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[180px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Filter</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="HP Hz"
                value={tom.hpFreqHz ?? 40}
                min={20}
                max={200}
                step={1}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ hpFreqHz: v })}
              />
            </div>
          </div>
        </div>

        <div className="min-w-[260px] flex-1">
          <DrumWavePreview<TomParams>
            title={`${label} Preview`}
            params={tom}
            render={renderTomArray}
            durationMs={600}
            sampleRate={48000}
            allowPlay
            className="h-full w-full"
          />
        </div>
      </div>
    </Card>
  );
}

export default TomEditorModule;
