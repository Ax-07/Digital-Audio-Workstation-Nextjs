"use client";

import { memo, useCallback, useEffect } from "react";
import { useSynthStore } from "@/features/daw/state/synth.store";
import { SimpleSynthParams } from "@/core/audio-engine/sources/synth/simple-synth";
import { ensureMidiTrack } from "@/core/audio-engine/sources/midi-track";
import { Slider } from "@/shared/ui/slider";
import { GenericEnvelopeEditor } from "../controls/GenericEnvelope";

type Props = { trackId: string };

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-3 py-1">
    <div className="w-24 text-[10px] uppercase tracking-widest text-neutral-400">{label}</div>
    <div className="flex-1">{children}</div>
  </div>
);

const Num = ({ value }: { value: number }) => (
  <span className="w-10 text-right text-xs tabular-nums text-neutral-300">{Math.round(value)}</span>
);

const WaveSelect = ({ value, onChange }: { value: OscillatorType; onChange: (v: OscillatorType) => void }) => (
  <select
    className="h-6 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200"
    value={value}
    onChange={(e) => onChange(e.target.value as OscillatorType)}
  >
    <option value="sine">Sine</option>
    <option value="triangle">Triangle</option>
    <option value="sawtooth">Saw</option>
    <option value="square">Square</option>
  </select>
);

const SimpleSynthPanelComponent = ({ trackId }: Props) => {
  const params = useSynthStore((s) => s.getParams(trackId));
  const setParams = useSynthStore((s) => s.setParams);

  const set = useCallback(
    (p: Partial<SimpleSynthParams>) => setParams(trackId, p),
    [setParams, trackId]
  );
  // ampEnv est garanti par le store (DEFAULT) → pas de fallback local
  // 🔗 BRIDAGE UI → AUDIO
  useEffect(() => {
    const mt = ensureMidiTrack(trackId);
    mt.configureSynth(params);
  }, [trackId, params]);

  return (
    <div className="rounded-sm border border-neutral-700 bg-neutral-850 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-neutral-400">SimpleSynth</div>
        {/* future: preset dropdown / reset button */}
      </div>

      {/* Ligne 1 : waveform + detune */}
      <div className="mb-3 flex items-center gap-4">
        <Row label="Waveform">
          <WaveSelect value={params.waveform} onChange={(v) => set({ waveform: v })} />
        </Row>
        <Row label="Detune (ct)">
          <div className="flex flex-1 items-center gap-2">
            <Slider
              value={[params.detuneCents]}
              onValueChange={(v) => set({ detuneCents: v[0] })}
              min={-1200}
              max={1200}
              step={1}
            />
            <Num value={params.detuneCents} />
          </div>
        </Row>
      </div>

      {/* Enveloppes de modulation (multiples) */}
      <div className="mt-2 space-y-3">
        {(params.envs ?? []).map((mod, idx) => (
          <div
            key={mod.id ?? idx}
            className="rounded-md border border-neutral-700 p-2"
          >
            <div className="mb-2 flex items-center justify-between">
              <input
                className="h-6 w-28 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-[10px] text-neutral-200"
                value={mod.name ?? `Env ${idx + 1}`}
                onChange={(e) => {
                  const next = (params.envs ?? []).slice();
                  next[idx] = { ...mod, name: e.target.value };
                  set({ envs: next });
                }}
                placeholder="Nom"
              />
              <div className="flex items-center gap-2">
                <button
                  className="rounded-sm border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-800"
                  onClick={() => {
                    const next = (params.envs ?? []).slice();
                    next[idx] = { ...mod, enabled: !(mod.enabled !== false) };
                    set({ envs: next });
                  }}
                >
                  {mod.enabled !== false ? "On" : "Off"}
                </button>
                <button
                  className="rounded-sm border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-800"
                  onClick={() => {
                    const next = (params.envs ?? []).slice();
                    next.splice(idx, 1);
                    set({ envs: next });
                  }}
                >
                  Remove
                </button>
                <button
                  className="rounded-sm border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-800"
                  onClick={() => {
                    const next = (params.envs ?? []).slice();
                    const copy = { ...mod, id: `${mod.id}-copy-${Date.now()}` };
                    next.splice(idx + 1, 0, copy);
                    set({ envs: next });
                  }}
                >
                  Duplicate
                </button>
                {/* Drag handle removed */}
              </div>
            </div>
            <GenericEnvelopeEditor
              envelope={mod.envelope}
              onChange={(env) => {
                const next = (params.envs ?? []).slice();
                next[idx] = { ...mod, envelope: env };
                set({ envs: next });
              }}
              targets={[
                { value: "amp", label: "Amplitude" },
                { value: "detune", label: "Detune" },
              ]}
              target={mod.target}
              onTargetChange={(t) => {
                const next = (params.envs ?? []).slice();
                next[idx] = { ...mod, target: t as "amp" | "detune" };
                set({ envs: next });
              }}
            />
            {mod.target === "detune" && (
              <div className="mt-2">
                <Row label="Depth (ct)">
                  <div className="flex flex-1 items-center gap-2">
                    <Slider
                      value={[mod.depthCents ?? 0]}
                      onValueChange={(v) => {
                        const next = (params.envs ?? []).slice();
                        next[idx] = { ...mod, depthCents: v[0] };
                        set({ envs: next });
                      }}
                      min={-1200}
                      max={1200}
                      step={1}
                    />
                    <Num value={mod.depthCents ?? 0} />
                  </div>
                </Row>
              </div>
            )}
          </div>
        ))}
        <button
          className="rounded-sm border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          onClick={() => {
            const next = (params.envs ?? []).slice();
            next.push({
              id: `env-${Date.now()}`,
              target: "amp",
              enabled: true,
              name: `Env ${next.length + 1}`,
              envelope: {
                totalMs: 500,
                points: [
                  { t: 0, value: 0, curve: "linear" },
                  { t: 0.1, value: 1, curve: "linear" },
                  { t: 0.9, value: 1, curve: "linear" },
                  { t: 1, value: 0, curve: "linear" },
                ],
              },
            });
            set({ envs: next });
          }}
        >
          + Add Envelope
        </button>
      </div>

      {/* Ancien éditeur ADSR/DAHDSR retiré au profit de la liste ci-dessus */}
    </div>
  );
};

export const SimpleSynthPanel = memo(SimpleSynthPanelComponent);
