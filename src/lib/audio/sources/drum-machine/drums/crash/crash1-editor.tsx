"use client";

import { useState } from "react";
import { drumMachine } from "@/lib/audio/drum-machine/drum-machine";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DrumWavePreview } from "../DrumWavePreview";
import Knob from "@/components/daw/controls/knob";
import { cn } from "@/lib/utils";
import type { HatParams } from "@/lib/audio/sources/drums/drum-machine/types";
import { renderCrash1Array } from "./crash-dsp";

type Props = { trackId: string; className?: string };

export function Crash1EditorModule({ trackId, className }: Props) {
  const [crash, setCrash] = useState<HatParams>(
    () => drumMachine.getTrackPreset(trackId).crash1,
  );

  const update = (patch: Partial<HatParams>) => {
    setCrash((c) => ({ ...c, ...patch }));
    drumMachine.setTrackPreset(trackId, { crash1: patch });
  };

  const preview = async () => {
    const eng = AudioEngine.ensure();
    await eng.init();
    const ctx = eng.context;
    const when = (ctx?.currentTime ?? 0) + 0.02;
    drumMachine.playSound("crash1", 120, when, trackId);
  };

  if (!crash) return null;

  const attackMs = crash.ampAttackMs ?? (crash.ampAttackSec ? crash.ampAttackSec * 1000 : 3);
  const decayMs = crash.ampDecayMs ?? (crash.ampDecaySec ? crash.ampDecaySec * 1000 : 900);

  return (
    <Card className={cn("flex flex-col gap-4 p-4 overflow-hidden", className)}>
      <div className="flex items-center justify-between">
        <div className="font-semibold leading-none">Crash 1</div>
        <Button variant="default" size="sm" onClick={preview}>
          Preview
        </Button>
      </div>

      <div className="flex gap-4">
        {/* Paramètres */}
        <div className="flex gap-3 p-0 flex-wrap max-w-[860px]">
          {/* Tone & Noise */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Tone & Noise</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Level"
                value={crash.level ?? 0.9}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ level: v })}
              />
              <Knob
                label="Noise dur ms"
                value={(crash.noiseDurSec ?? 0.5) * 1000}
                min={50}
                max={2000}
                step={10}
                display={(v) => `${Math.round(v)} ms`}
                onChange={(v) => update({ noiseDurSec: v / 1000 })}
              />
              <Knob
                label="Noise level"
                value={crash.noiseLevel ?? 0.9}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ noiseLevel: v })}
              />
            </div>
          </div>

          {/* Partials */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Partials</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Tone mix"
                value={crash.toneMix ?? 0.6}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ toneMix: v })}
              />
              <Knob
                label="Detune (cents)"
                value={crash.partialsDetune ?? 3}
                min={-200}
                max={200}
                step={1}
                display={(v) => `${Math.round(v)} ct`}
                onChange={(v) => update({ partialsDetune: v })}
              />
              <Knob
                label="Drive"
                value={crash.drive ?? 1.4}
                min={1}
                max={4}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ drive: v })}
              />
              <Knob
                label="HP Noise Hz"
                value={crash.hpFreqHz ?? 6000}
                min={1000}
                max={16000}
                step={100}
                display={(v) => `${Math.round(v)} Hz`}
                onChange={(v) => update({ hpFreqHz: v })}
              />
            </div>
          </div>

          {/* Envelope */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Envelope</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Attack ms"
                value={attackMs}
                min={0}
                max={40}
                step={1}
                display={(v) => `${Math.round(v)} ms`}
                onChange={(v) => update({ ampAttackMs: v, ampAttackSec: undefined })}
              />
              <Knob
                label="Decay ms"
                value={decayMs}
                min={200}
                max={4000}
                step={10}
                display={(v) => `${Math.round(v)} ms`}
                onChange={(v) => update({ ampDecayMs: v, ampDecaySec: undefined })}
              />
            </div>
          </div>
        </div>

        {/* Preview offline */}
        <div className="min-w-[260px] flex-1">
          <DrumWavePreview<HatParams>
            title="Crash 1 Preview"
            params={crash}
            render={renderCrash1Array}
            durationMs={2000}
            sampleRate={48000}
            allowPlay
            className="h-full w-full"
          />
        </div>
      </div>
    </Card>
  );
}

export default Crash1EditorModule;
