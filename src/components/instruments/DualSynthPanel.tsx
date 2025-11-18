"use client";

import { memo, useCallback } from "react";
import { useDualSynthStore } from "@/lib/stores/dual-synth.store";
import { GenericEnvelopeEditor } from "../fx/GenericEnvelope";
import { Slider } from "../ui/slider";

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

const DualSynthPanelComponent = ({ trackId }: Props) => {
  const params = useDualSynthStore((s) => s.getParams(trackId));
  const setParams = useDualSynthStore((s) => s.setParams);
  const set = useCallback(
    (p: Partial<import("@/lib/audio/sources/dual-osc-synth").DualSynthParams>) => setParams(trackId, p),
    [setParams, trackId]
  );

  return (
    <div className="rounded-sm border border-neutral-700 bg-neutral-850 p-2">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-neutral-400">Dual Osc Synth</div>
      <div className="space-y-1">
        <Row label="Wave A">
          <WaveSelect value={params.waveformA} onChange={(v) => set({ waveformA: v })} />
        </Row>
        <Row label="Wave B">
          <WaveSelect value={params.waveformB} onChange={(v) => set({ waveformB: v })} />
        </Row>
        <Row label="Mix (B)">
          <input type="range" min={0} max={1} step={0.01} value={params.mix} onChange={(e) => set({ mix: Number(e.target.value) })} className="w-full" />
          <span className="w-10 text-right text-xs tabular-nums text-neutral-300">{params.mix.toFixed(2)}</span>
        </Row>
        <Row label="Detune (ct)">
          <input type="range" min={-1200} max={1200} step={1} value={params.detuneCents} onChange={(e) => set({ detuneCents: Number(e.target.value) })} className="w-full" />
          <Num value={params.detuneCents} />
        </Row>
        {/* Ancienne depth liée à envTarget retirée: gérée par chaque enveloppe detune */}
      </div>
      {/* Multi-enveloppes */}
      <div className="mt-3 space-y-3">
        {(params.envs ?? []).map((mod, idx) => (
          <div
            key={mod.id ?? idx}
            className="rounded-md border border-neutral-700 p-2"
          >
            <div className="mb-2 grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-2">
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
              <input
                className="h-6 w-24 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-[10px] text-neutral-200"
                value={mod.group ?? ""}
                onChange={(e) => {
                  const next = (params.envs ?? []).slice();
                  next[idx] = { ...mod, group: e.target.value } as any;
                  set({ envs: next });
                }}
                placeholder="Group"
              />
              <input
                className="h-6 w-28 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-[10px] text-neutral-200"
                value={mod.macro ?? ""}
                onChange={(e) => {
                  const next = (params.envs ?? []).slice();
                  next[idx] = { ...mod, macro: e.target.value } as any;
                  set({ envs: next });
                }}
                placeholder="Macro"
              />
              <div className="col-start-4 col-end-7 ml-auto flex items-center gap-2">
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
                { value: "detune", label: "Detune B (legacy)" },
                { value: "detuneA", label: "Detune A" },
                { value: "detuneB", label: "Detune B" },
                { value: "mix", label: "Mix A/B" },
              ]}
              target={mod.target}
              onTargetChange={(t) => {
                const next = (params.envs ?? []).slice();
                next[idx] = { ...mod, target: t as any };
                set({ envs: next });
              }}
            />
            {(mod.target === "detune" || mod.target === "detuneA" || mod.target === "detuneB") && (
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
            {mod.target === "mix" && (
              <div className="mt-2">
                <Row label="Depth (mix)">
                  <div className="flex flex-1 items-center gap-2">
                    <Slider
                      value={[Number((mod as any).depthMix ?? 0)]}
                      onValueChange={(v) => {
                        const next = (params.envs ?? []).slice();
                        next[idx] = { ...mod, depthMix: v[0] } as any;
                        set({ envs: next });
                      }}
                      min={-1}
                      max={1}
                      step={0.01}
                    />
                    <span className="w-10 text-right text-xs tabular-nums text-neutral-300">{((mod as any).depthMix ?? 0).toFixed(2)}</span>
                  </div>
                </Row>
              </div>
            )}
          </div>
        ))}
        <button
          className="rounded-sm border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-800"
          onClick={() => {
            const next = (params.envs ?? []).slice();
            next.push({
              id: `env-${Date.now()}`,
              target: "amp",
              enabled: true,
              name: `Env ${next.length + 1}`,
              depthCents: 0,
                depthMix: 0,
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
    </div>
  );
};

export const DualSynthPanel = memo(DualSynthPanelComponent);
