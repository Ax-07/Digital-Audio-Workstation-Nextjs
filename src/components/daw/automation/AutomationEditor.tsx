"use client";

import { memo, useMemo, useState } from "react";
import { useProjectStore } from "@/lib/stores/project.store";
import type { TrackDecl } from "@/lib/audio/types";

type Props = { trackId: string };

type ParamKey = "gainDb" | "pan" | "sendA" | "sendB";

const labels: Record<ParamKey, string> = {
  gainDb: "Gain (dB)",
  pan: "Pan",
  sendA: "Send A",
  sendB: "Send B",
};

const defaults: Record<ParamKey, number> = {
  gainDb: -6,
  pan: 0,
  sendA: 0,
  sendB: 0,
};

function clampFor(key: ParamKey, v: number): number {
  switch (key) {
    case "gainDb": return Math.max(-60, Math.min(6, v));
    case "pan": return Math.max(-1, Math.min(1, v));
    default: return Math.max(0, Math.min(1, v));
  }
}

const AutomationEditorComponent = ({ trackId }: Props) => {
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const track = project.tracks.find((t) => t.id === trackId);
  const [param, setParam] = useState<ParamKey>("gainDb");
  const frames = useMemo(() => {
    type KF = { beat: number; value: number };
    const a = track?.automation;
    if (!a) return [] as KF[];
    switch (param) {
      case "gainDb": return (a.gainDb ?? []) as KF[];
      case "pan": return (a.pan ?? []) as KF[];
      case "sendA": return (a.sendA ?? []) as KF[];
      case "sendB": return (a.sendB ?? []) as KF[];
    }
  }, [track?.automation, param]);

  const onChangeCell = (idx: number, field: "beat" | "value", val: number) => {
    const nextFrames = frames.map((f, i) => (i === idx ? { ...f, [field]: clampFor(field === "value" ? param : "gainDb", val) } : f))
      .sort((a, b) => a.beat - b.beat);
    const base = (track?.automation ?? {}) as NonNullable<TrackDecl["automation"]>;
    let nextAuto: NonNullable<TrackDecl["automation"]>;
    switch (param) {
      case "gainDb": nextAuto = { ...base, gainDb: nextFrames }; break;
      case "pan": nextAuto = { ...base, pan: nextFrames }; break;
      case "sendA": nextAuto = { ...base, sendA: nextFrames }; break;
      case "sendB": nextAuto = { ...base, sendB: nextFrames }; break;
    }
    updateTrack(trackId, { automation: nextAuto });
  };

  const onAdd = () => {
    const nextFrames = [...frames, { beat: 0, value: defaults[param] }].sort((a, b) => a.beat - b.beat);
    const base = (track?.automation ?? {}) as NonNullable<TrackDecl["automation"]>;
    let nextAuto: NonNullable<TrackDecl["automation"]>;
    switch (param) {
      case "gainDb": nextAuto = { ...base, gainDb: nextFrames }; break;
      case "pan": nextAuto = { ...base, pan: nextFrames }; break;
      case "sendA": nextAuto = { ...base, sendA: nextFrames }; break;
      case "sendB": nextAuto = { ...base, sendB: nextFrames }; break;
    }
    updateTrack(trackId, { automation: nextAuto });
  };

  const onRemove = (idx: number) => {
    const nextFrames = frames.filter((_, i) => i !== idx);
    const base = (track?.automation ?? {}) as NonNullable<TrackDecl["automation"]>;
    let nextAuto: NonNullable<TrackDecl["automation"]>;
    switch (param) {
      case "gainDb": nextAuto = { ...base, gainDb: nextFrames }; break;
      case "pan": nextAuto = { ...base, pan: nextFrames }; break;
      case "sendA": nextAuto = { ...base, sendA: nextFrames }; break;
      case "sendB": nextAuto = { ...base, sendB: nextFrames }; break;
    }
    updateTrack(trackId, { automation: nextAuto });
  };

  return (
    <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Automation</span>
        <select
          value={param}
          onChange={(e) => setParam(e.target.value as ParamKey)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="gainDb">Gain (dB)</option>
          <option value="pan">Pan</option>
          <option value="sendA">Send A</option>
          <option value="sendB">Send B</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        {frames.length === 0 ? (
          <div className="text-xs text-zinc-500">Aucune keyframe. Ajoutez-en.</div>
        ) : (
          frames.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <span className="opacity-70">Beat</span>
                <input
                  type="number"
                  value={f.beat}
                  min={0}
                  step={0.25}
                  onChange={(e) => onChangeCell(i, "beat", Number(e.target.value))}
                  className="w-16 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <label className="ml-2 flex items-center gap-1">
                <span className="opacity-70">{labels[param]}</span>
                <input
                  type="number"
                  value={f.value}
                  step={param === "gainDb" ? 1 : 0.05}
                  min={param === "gainDb" ? -60 : param === "pan" ? -1 : 0}
                  max={param === "gainDb" ? 6 : param === "pan" ? 1 : 1}
                  onChange={(e) => onChangeCell(i, "value", Number(e.target.value))}
                  className="w-20 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <button
                onClick={() => onRemove(i)}
                className="ml-auto rounded border border-zinc-300 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-600/10 dark:border-zinc-700"
              >
                Suppr
              </button>
            </div>
          ))
        )}
      </div>
      <div className="mt-2">
        <button onClick={onAdd} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          + Keyframe
        </button>
      </div>
    </div>
  );
};

export const AutomationEditor = memo(AutomationEditorComponent);
