"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useMixerStore } from "@/lib/stores/mixer.store";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { SampleSource } from "@/lib/audio/sources/sampler/sample-source";

const sampleMap = new Map<string, SampleSource>();

export const SamplePlayer = memo(function SamplePlayer() {
  const tracks = useMixerStore((s) => s.tracks);
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "track1");
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [loop, setLoop] = useState(true);

  const onLoad = useCallback(async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const engine = AudioEngine.ensure();
    await engine.init();
    await engine.resume();
    const buf = await f.arrayBuffer();
    let src = sampleMap.get(trackId);
    if (!src) {
      src = new SampleSource(`sample:${trackId}`, trackId);
      sampleMap.set(trackId, src);
    }
    await src.loadFromArrayBuffer(buf);
    src.setLoop(loop);
    setLoaded(true);
  }, [trackId, loop]);

  const onPlay = useCallback(() => {
    const src = sampleMap.get(trackId);
    if (!src) return;
    src.setLoop(loop);
    src.start();
  }, [trackId, loop]);

  const onStop = useCallback(() => {
    const src = sampleMap.get(trackId);
    if (!src) return;
    src.stop();
  }, [trackId]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <select
        value={trackId}
        onChange={(e) => setTrackId(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <input ref={fileRef} type="file" accept="audio/*" className="text-sm" />
      <label className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop
      </label>
      <button
        onClick={onLoad}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
      >
        Load
      </button>
      <button
        onClick={onPlay}
        disabled={!loaded}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Play
      </button>
      <button
        onClick={onStop}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
      >
        Stop
      </button>
    </div>
  );
});
