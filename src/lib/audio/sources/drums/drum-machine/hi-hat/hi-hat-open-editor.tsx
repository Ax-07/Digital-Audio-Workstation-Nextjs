// hi-hat-open-editor.tsx
"use client";

import { useState } from "react";
import { drumMachine } from "@/lib/audio/drum-machine/drum-machine";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DrumWavePreview } from "../DrumWavePreview";
import { renderHatArray } from "./hi-hat";
import Knob from "@/components/daw/controls/knob";
import { cn } from "@/lib/utils";
import type { HatParams } from "@/lib/audio/sources/drums/drum-machine/types";

type Props = { trackId: string; className?: string };

export function OpenHiHatEditorModule({ trackId, className }: Props) {
  const [hat, setHat] = useState<HatParams>(() => drumMachine.getTrackPreset(trackId).hhOpen);

  const update = (patch: Partial<HatParams>) => {
    setHat((h) => ({ ...h, ...patch }));
    drumMachine.setTrackPreset(trackId, { hhOpen: patch });
  };

  const preview = async () => {
    const eng = AudioEngine.ensure();
    await eng.init();
    const ctx = eng.context;
    const when = (ctx?.currentTime ?? 0) + 0.02;
    // ✅ on joue l’open hat
    drumMachine.playSound("hhOpen", 120, when, trackId);
  };

  if (!hat) return null;

  const attackMs = hat.ampAttackMs ?? (hat.ampAttackSec ? hat.ampAttackSec * 1000 : 2);
  const decayMs = hat.ampDecayMs ?? (hat.ampDecaySec ? hat.ampDecaySec * 1000 : 350); // plus long par défaut

  return (
    <Card className={cn("flex flex-col gap-4 p-4 overflow-hidden", className)}>
      <div className="flex items-center justify-between">
        <div className="font-semibold leading-none">Open Hi-Hat</div>
        <Button variant="default" size="sm" onClick={preview}>
          Preview
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex gap-3 p-0">
          {/* même UI que le closed, tu peux adapter les ranges si tu veux */}
          {/* Tone & Noise */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Tone & Noise</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Level"
                value={hat.level ?? 0.8}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ level: v })}
              />
              <Knob
                label="Noise dur ms"
                value={(hat.noiseDurSec ?? 0.35) * 1000}
                min={50}
                max={800}
                step={5}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ noiseDurSec: v / 1000 })}
              />
              <Knob
                label="Noise level"
                value={hat.noiseLevel ?? 1}
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
                value={hat.toneMix ?? 0.35}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ toneMix: v })}
              />
              <Knob
                label="Detune (cents)"
                value={hat.partialsDetune ?? 0}
                min={-200}
                max={200}
                step={1}
                display={(v) => Math.round(v) + " ct"}
                onChange={(v) => update({ partialsDetune: v })}
              />
              <Knob
                label="Drive"
                value={hat.drive ?? 1.1}
                min={1}
                max={3}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ drive: v })}
              />
              <Knob
                label="HP Noise Hz"
                value={hat.hpFreqHz ?? 7000}
                min={2000}
                max={14000}
                step={100}
                display={(v) => Math.round(v) + " Hz"}
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
                max={20}
                step={1}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ ampAttackMs: v, ampAttackSec: undefined })}
              />
              <Knob
                label="Decay ms"
                value={decayMs}
                min={150}
                max={1000}
                step={10}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ ampDecayMs: v, ampDecaySec: undefined })}
              />
            </div>
          </div>
        </div>

        <div className="min-w-[260px] flex-1">
          <DrumWavePreview<HatParams>
            title="Open Hi-Hat Preview"
            params={hat}
            render={renderHatArray}
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

export default OpenHiHatEditorModule;
