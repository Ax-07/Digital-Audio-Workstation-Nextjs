// src/lib/audio/core/session-player/audio-track-player.ts
import { SampleSource } from "../../sources/sampler/sample-source";
import { makePoolKey } from "./helpers";

export type AudioClipStartOptions = {
  fadeIn?: number;
  offset?: number;
  loop?: boolean;
};

export class AudioTrackPlayer {
  private trackId: string;
  private _pool = new Map<string, SampleSource>();

  constructor(trackId: string) {
    this.trackId = trackId;
  }

  // Ensure a SampleSource exists and buffer is loaded
  async ensureSample(clipId: string, sampleUrl: string): Promise<SampleSource> {
    const key = makePoolKey(this.trackId, clipId);
    let src = this._pool.get(key);
    if (!src) {
      src = new SampleSource(clipId, this.trackId);
      this._pool.set(key, src);
      const res = await fetch(sampleUrl);
      const buf = await res.arrayBuffer();
      await src.loadFromArrayBuffer(buf);
    }
    return src;
  }

  // Start the given sample at 'when' with options. Returns a handle.
  async startAt(clipId: string, sampleUrl: string, when: number, options: AudioClipStartOptions): Promise<{ stop(): void; stopAt?: (t: number) => void; }>{
    const src = await this.ensureSample(clipId, sampleUrl);
    src.startAt(when, options);
    const handle = {
      stop: () => {
        try { src.stop(); } catch (e) {}
      },
      stopAt: (t: number) => {
        try { src.stopAt(t); } catch (e) {}
      }
    };
    return handle;
  }

  stopAll(): void {
    for (const [, s] of this._pool) {
      try { s.stop(); } catch (e) {}
    }
  }

  dispose(): void {
    this.stopAll();
    this._pool.clear();
  }
}
