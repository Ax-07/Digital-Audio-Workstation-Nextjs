// src/lib/audio/core/session-player/clip-manager.ts
import { MidiNote } from "../../types";
import { AudioClipManager } from "./audio-clip-manager";
import { MidiClipManager } from "./midi-clip-manager";
import type { AudioClipOptions, InstrumentConfig } from "./types";

/**
 * ClipManager - façade unifiée pour gérer clips audio et midi
 *
 * Cette classe compose les managers spécifiques et expose une API
 * unique pour le code appelant. L'objectif est de centraliser les
 * opérations courantes sans modifier la logique métier existante.
 */
export class ClipManager {
  private audio = new AudioClipManager();
  private midi = new MidiClipManager();

  // Expose underlying managers when necessary (compat)
  getAudioManager(): AudioClipManager {
    return this.audio;
  }

  getMidiManager(): MidiClipManager {
    return this.midi;
  }

  // --- Audio ---
  async preloadSamples(clips: Array<{ trackId: string; clipId: string; sampleUrl: string }>) {
    return this.audio.preloadSamples(clips);
  }

  async startAudioClip(trackId: string, clipId: string, sampleUrl: string, when: number, options: AudioClipOptions) {
    return this.audio.startAudioClip(trackId, clipId, sampleUrl, when, options);
  }

  stopAudioClip(trackId: string) {
    return this.audio.stopAudioClip(trackId);
  }

  scheduleStopAudioClip(trackId: string, whenSec: number) {
    return this.audio.scheduleStopAudioClip(trackId, whenSec);
  }

  // --- MIDI ---
  startMidiClipOneShot(trackId: string, clipId: string, notes: ReadonlyArray<MidiNote>, when: number, bpm: number, lengthBeats?: number) {
    return this.midi.startMidiClipOneShot(trackId, clipId, notes, when, bpm, lengthBeats);
  }

  startMidiClipLoop(trackId: string, clipId: string, notes: ReadonlyArray<MidiNote>, when: number, bpm: number, loopStartBeats: number, loopEndBeats: number, startOffset?: number) {
    return this.midi.startMidiClipLoop(trackId, clipId, notes, when, bpm, loopStartBeats, loopEndBeats, startOffset);
  }

  refreshMidiLoop(trackId: string, clipId: string, notes: ReadonlyArray<MidiNote>, loopStartBeats: number, loopEndBeats: number) {
    return this.midi.refreshMidiLoop(trackId, clipId, notes, loopStartBeats, loopEndBeats);
  }

  stopMidiClip(trackId: string) {
    return this.midi.stopMidiClip(trackId);
  }

  configureInstrument(trackId: string, config: InstrumentConfig) {
    return this.midi.configureInstrument(trackId, config);
  }

  // --- Utilities ---
  stopClip(trackId: string) {
    // stop both types to be safe
    try { this.audio.stopAudioClip(trackId); } catch (e) {}
    try { this.midi.stopMidiClip(trackId); } catch (e) {}
  }

  stopAll() {
    this.audio.stopAll();
    this.midi.stopAll();
  }

  dispose() {
    try { this.audio.dispose(); } catch (e) {}
    try { this.midi.dispose(); } catch (e) {}
  }

  getActiveTrackIds(): string[] {
    const s = new Set<string>();
    for (const id of this.audio.getActiveTrackIds()) s.add(id);
    for (const id of this.midi.getActiveTrackIds()) s.add(id);
    return [...s];
  }
}

export const clipManager = new ClipManager();
export const getAudioManager = () => clipManager.getAudioManager();
export const getMidiManager = () => clipManager.getMidiManager();
