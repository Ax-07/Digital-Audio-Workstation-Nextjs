"use client";

import { memo, useMemo, useState } from "react";
import { useProjectStore } from "@/lib/stores/project.store";
import type { FxDecl, TrackDecl } from "@/lib/audio/types";

const FX_TYPES = [
  { id: "gain", label: "Gain" },
  { id: "eq", label: "EQ (peaking)" },
  { id: "delay", label: "Delay" },
  { id: "reverb", label: "Reverb" },
] as const;

type Props = { trackId: string };

const FxRackComponent = ({ trackId }: Props) => {
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const track = project.tracks.find((t) => t.id === trackId);
  const fx = useMemo(() => (Array.isArray(track?.fx) ? (track?.fx as FxDecl[]) : []), [track?.fx]);
  const [newType, setNewType] = useState<(typeof FX_TYPES)[number]["id"]>("gain");

  const onParam = (idx: number, key: string, value: number) => {
    const next = fx.map((f, i) => (i === idx ? { ...f, params: { ...(f.params ?? {}), [key]: value } } : f));
    updateTrack(trackId, { fx: next as unknown as TrackDecl["fx"] });
  };
  const onParamAny = (idx: number, key: string, value: number | boolean | string) => {
    const next = fx.map((f, i) => (i === idx ? { ...f, params: { ...(f.params ?? {}), [key]: value } } : f));
    updateTrack(trackId, { fx: next as unknown as TrackDecl["fx"] });
  };

  const onRemove = (idx: number) => {
    const next = fx.filter((_, i) => i !== idx);
    updateTrack(trackId, { fx: next as unknown as TrackDecl["fx"] });
  };

  const onAdd = () => {
    const def: FxDecl = { type: newType, params: {} };
    const next = [...fx, def];
    updateTrack(trackId, { fx: next as unknown as TrackDecl["fx"] });
  };

  return (
    <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">FX Rack</span>
        <div className="flex items-center gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as (typeof FX_TYPES)[number]["id"])}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            {FX_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <button onClick={onAdd} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            + Add
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {fx.length === 0 && (
          <div className="text-xs text-zinc-500">Aucun effet.</div>
        )}
        {fx.map((f, i) => {
          const type = String(f.type).toLowerCase();
          const getNum = (key: string, def: number) => {
            const v = f.params ? f.params[key] : undefined;
            return typeof v === "number" ? v : def;
          };
          const bypass = !!(f.params && (f.params as Record<string, unknown>).bypass === true);
          return (
            <div key={i} className="rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">{type.toUpperCase()}</span>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={bypass} onChange={(e) => onParamAny(i, "bypass", e.target.checked)} />
                    <span className="opacity-70">Bypass</span>
                  </label>
                  <button onClick={() => onRemove(i)} className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-600/10 dark:border-zinc-700">Suppr</button>
                </div>
              </div>
              {type === "gain" && !bypass && (
                <label className="flex items-center gap-2">
                  <span className="opacity-70">Gain (dB)</span>
                  <input type="number" step={1} min={-60} max={24} value={getNum("gainDb", 0)} onChange={(e) => onParam(i, "gainDb", Number(e.target.value))}
                    className="w-20 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
              )}
              {type === "eq" && !bypass && (
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2">
                    <span className="opacity-70">Freq (Hz)</span>
                    <input type="number" step={10} min={20} max={20000} value={getNum("freq", 1000)} onChange={(e) => onParam(i, "freq", Number(e.target.value))}
                      className="w-24 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="opacity-70">Q</span>
                    <input type="number" step={0.1} min={0.1} max={18} value={getNum("q", 1)} onChange={(e) => onParam(i, "q", Number(e.target.value))}
                      className="w-20 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="opacity-70">Gain (dB)</span>
                    <input type="number" step={0.5} min={-24} max={24} value={getNum("gainDb", 0)} onChange={(e) => onParam(i, "gainDb", Number(e.target.value))}
                      className="w-20 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                </div>
              )}
              {type === "delay" && !bypass && (
                <label className="flex items-center gap-2">
                  <span className="opacity-70">Time (s)</span>
                  <input type="number" step={0.01} min={0} max={1} value={getNum("delayTime", 0.25)} onChange={(e) => onParam(i, "delayTime", Number(e.target.value))}
                    className="w-20 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
              )}
              {type === "reverb" && !bypass && (
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2">
                    <span className="opacity-70">Dur (s)</span>
                    <input type="number" step={0.05} min={0.1} max={5} value={getNum("reverbDuration", 1.2)} onChange={(e) => onParam(i, "reverbDuration", Number(e.target.value))}
                      className="w-20 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="opacity-70">Decay</span>
                    <input type="number" step={0.05} min={0.05} max={1} value={getNum("reverbDecay", 0.5)} onChange={(e) => onParam(i, "reverbDecay", Number(e.target.value))}
                      className="w-20 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const FxRack = memo(FxRackComponent);
