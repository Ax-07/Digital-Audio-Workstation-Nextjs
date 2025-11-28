"use client";
import { useState } from "react";
import { drumMachine } from "@/lib/audio/drum-machine/drum-machine";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { Card } from "@/components/ui/card";
// label not needed (using Knob labels)
import { Button } from "@/components/ui/button";
import { SnareParams } from "../types";
import { DrumWavePreview } from "../DrumWavePreview";
import { renderSnareArray } from "./snare";
import Knob from "@/components/daw/controls/knob";
import { cn } from "@/lib/utils";

type Props = { trackId: string; className?: string };

export function SnareEditorModule({ trackId, className }: Props) {
  const [snare, setSnare] = useState<SnareParams>(() => drumMachine.getTrackPreset(trackId).snare);

  const update = (patch: Partial<SnareParams>) => {
    setSnare((s) => ({ ...s, ...patch }));
    drumMachine.setTrackPreset(trackId, { snare: patch });
  };

  const preview = async () => {
    const eng = AudioEngine.ensure();
    await eng.init();
    const ctx = eng.context;
    const when = (ctx?.currentTime ?? 0) + 0.02;
    drumMachine.playSound("snare", 110, when, trackId);
  };

  if (!snare) return null;

  const attackMs = snare.ampAttackMs ?? (snare.ampAttackSec ? snare.ampAttackSec * 1000 : 3);
  const decayMs = snare.ampDecayMs ?? (snare.ampDecaySec ? snare.ampDecaySec * 1000 : 180);

  return (
    <Card className={cn("flex flex-col gap-4 p-4 overflow-hidden", className)}>
      <div className="flex items-center justify-between">
        <div className="font-semibold">Snare</div>
        <Button variant="default" size="sm" onClick={preview}>
          Preview
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex gap-3 p-0">
          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Body</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Level"
                value={snare.level ?? 0.9}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ level: v })}
              />
              <Knob
                label="Noise mix"
                value={snare.noiseMix ?? 0.8}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ noiseMix: v })}
              />
              <Knob
                label="Body Freq"
                value={snare.bodyFreqHz ?? 200}
                min={120}
                max={400}
                step={1}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ bodyFreqHz: v })}
              />
              <Knob
                label="Drive"
                value={snare.drive ?? 1}
                min={1}
                max={2}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ drive: v })}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Filter</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="BP Freq"
                value={snare.bpFreqHz ?? 1800}
                min={500}
                max={4000}
                step={1}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ bpFreqHz: v })}
              />
              <Knob
                label="BP Q"
                value={snare.bpQ ?? 0.8}
                min={0.5}
                max={10}
                step={0.1}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ bpQ: v })}
              />
              <Knob
                label="HP Hz"
                value={snare.hpFreqHz ?? 700}
                min={200}
                max={2000}
                step={1}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ hpFreqHz: v })}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Envelope</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Attack ms"
                value={attackMs}
                min={1}
                max={30}
                step={1}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ ampAttackMs: v, ampAttackSec: undefined })}
              />
              <Knob
                label="Decay ms"
                value={decayMs}
                min={60}
                max={600}
                step={1}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ ampDecayMs: v, ampDecaySec: undefined })}
              />
            </div>
          </div>
        </div>

        <div className="min-w-[260px] flex-1">
          <DrumWavePreview<SnareParams>
            title="Snare Preview"
            params={snare}
            render={renderSnareArray}
            durationMs={400}
            sampleRate={48000}
            allowPlay
            className="h-full w-full"
          />
        </div>
      </div>
    </Card>
  );
}

export default SnareEditorModule;
