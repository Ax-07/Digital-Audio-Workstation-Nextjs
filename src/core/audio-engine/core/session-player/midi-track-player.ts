// src/lib/audio/core/session-player/midi-track-player.ts
import { MidiTrack } from "../../sources/midi-track";
import { InstrumentKind } from "../../types";
import type { InstrumentConfig } from "./types";

export class MidiTrackPlayer {
  private _mt: MidiTrack;

  constructor(trackOrId: string | MidiTrack, config?: InstrumentConfig) {
    if (typeof trackOrId === "string") {
      if (config) {
        this._mt = new MidiTrack(trackOrId, {
          instrument: config.kind,
          synthParams: config.params,
        });
      } else {
        this._mt = new MidiTrack(trackOrId);
      }
    } else {
      this._mt = trackOrId;
    }
  }

  getTrack(): MidiTrack {
    return this._mt;
  }

  scheduleClip(clip: any, when: number, bpm: number) {
    return this._mt.scheduleClip(clip, when, bpm);
  }

  cancelPending(): void {
    try { this._mt.cancelPending(); } catch (e) {}
  }

  stop(): void {
    try { this._mt.stop(); } catch (e) {}
  }

  setInstrument(kind: InstrumentKind) {
    try { this._mt.setInstrument(kind); } catch (e) {}
  }

  configureDual(params: any) {
    try { (this._mt).configureDual(params); } catch (e) {}
  }

  configureSynth(params: any) {
    try { (this._mt).configureSynth(params); } catch (e) {}
  }

  dispose(): void {
    try { this.stop(); } catch (e) {}
  }
}
