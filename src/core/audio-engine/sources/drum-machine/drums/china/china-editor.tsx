"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { renderChinaArray } from "./china-dsp";
import { HatParams } from "../../types";
import { drumMachine } from "../../drum-machine";
import { DrumWavePreview } from "../../DrumWavePreview";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import Knob from "@/features/daw/ui/controls/knob";
import { AudioEngine } from "@/core/audio-engine/core/audio-engine";

type Props = { trackId: string; className?: string };

export function ChinaEditorModule({ trackId, className }: Props) {
  const [china, setChina] = useState<HatParams>(
    () => drumMachine.getTrackPreset(trackId).china
  );

  const update = (patch: Partial<HatParams>) => {
    setChina((h) => ({ ...h, ...patch }));
    // Patch typé, sans any
    drumMachine.setTrackPreset(trackId, { china: patch });
  };

  const preview = async () => {
    const eng = AudioEngine.ensure();
    await eng.init();
    const ctx = eng.context;
    const when = (ctx?.currentTime ?? 0) + 0.02;
    drumMachine.playSound("china", 120, when, trackId);
  };

  if (!china) return null;

  const attackMs =
    china.ampAttackMs ?? (china.ampAttackSec ? china.ampAttackSec * 1000 : 3);
  const decayMs =
    china.ampDecayMs ?? (china.ampDecaySec ? china.ampDecaySec * 1000 : 700);

  return (
    <Card className={cn("flex flex-col gap-4 p-4 overflow-hidden", className)}>
      <div className="flex items-center justify-between">
        <div className="font-semibold leading-none">China</div>
        <Button variant="default" size="sm" onClick={preview}>
          Preview
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex gap-3 p-0">
          {/* Tone / Noise */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">
                Tone & Noise
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Level"
                value={china.level ?? 0.95}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ level: v })}
              />
              <Knob
                label="Noise dur ms"
                value={(china.noiseDurSec ?? 0.45) * 1000}
                min={50}
                max={1500}
                step={5}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) => update({ noiseDurSec: v / 1000 })}
              />
              <Knob
                label="Noise level"
                value={china.noiseLevel ?? 0.9}
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
              <span className="font-medium uppercase tracking-wide">
                Partials
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Tone mix"
                value={china.toneMix ?? 0.7}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ toneMix: v })}
              />
              <Knob
                label="Detune (cents)"
                value={china.partialsDetune ?? 10}
                min={-300}
                max={300}
                step={1}
                display={(v) => Math.round(v) + " ct"}
                onChange={(v) => update({ partialsDetune: v })}
              />
              <Knob
                label="Drive"
                value={china.drive ?? 1.6}
                min={1}
                max={3}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ drive: v })}
              />
              <Knob
                label="HP Noise Hz"
                value={china.hpFreqHz ?? 5000}
                min={1000}
                max={16000}
                step={100}
                display={(v) => Math.round(v) + " Hz"}
                onChange={(v) => update({ hpFreqHz: v })}
              />
            </div>
          </div>

          {/* Envelope */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">
                Envelope
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Knob
                label="Attack ms"
                value={attackMs}
                min={0}
                max={30}
                step={1}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) =>
                  update({ ampAttackMs: v, ampAttackSec: undefined })
                }
              />
              <Knob
                label="Decay ms"
                value={decayMs}
                min={200}
                max={2000}
                step={10}
                display={(v) => Math.round(v) + " ms"}
                onChange={(v) =>
                  update({ ampDecayMs: v, ampDecaySec: undefined })
                }
              />
            </div>
          </div>
        </div>

        {/* Waveform preview */}
        <div className="min-w-[260px] flex-1">
          <DrumWavePreview<HatParams>
            title="China Preview"
            params={china}
            render={renderChinaArray}
            durationMs={900}
            sampleRate={48000}
            allowPlay
            className="h-full w-full"
          />
        </div>
      </div>
    </Card>
  );
}

export default ChinaEditorModule;
