// src/lib/audio/core/session-player/midi-clip-manager.ts

import type { ActiveClip, MidiLoopInfo, InstrumentConfig } from "./types";
import { makeMidiNoteId } from "./helpers";
import { BaseClipManager } from "./clip-manager-base";
import { MidiTrackPlayer } from "./midi-track-player";
import { MidiTrack } from "../../sources/midi-track";
import { AudioEngine } from "../audio-engine";
import { TransportScheduler } from "../transport-scheduler";
import { InstrumentKind, MidiNote } from "../../types";

/**
 * MidiClipManager
 * 
 * Responsabilités :
 * - Gère les instances MidiTrack par piste
 * - Lance et arrête les clips MIDI (one-shot et loop)
 * - Gère le scheduling cyclique des boucles MIDI
 * - Applique les configurations d'instruments (synth, dual-synth)
 */
export class MidiClipManager extends BaseClipManager {
  /** Instances MidiTrack par trackId (compat) */
  private _midiTracks = new Map<string, MidiTrack>();
  /** Players MIDI par trackId (adapter) */
  private _midiPlayers = new Map<string, MidiTrackPlayer>();

  /** Boucles MIDI actives avec leur état de scheduling */
  private _midiLoops = new Map<string, MidiLoopInfo>();

  /** Dernier type d'instrument appliqué par piste */
  private _lastKind = new Map<string, string>();
  
  /** Derniers paramètres appliqués par piste (JSON stringifié) */
  private _lastParams = new Map<string, string>();

  /**
   * Obtient ou crée une MidiTrack pour une piste.
   */
  getMidiTrack(trackId: string, config?: InstrumentConfig): MidiTrack {
    // Ensure a MidiTrack exists and return it (keeps previous API).
    let mt = this._midiTracks.get(trackId);
    if (!mt) {
      const player = this.getOrCreateMidiPlayer(trackId, config);
      mt = player.getTrack();
      this._midiTracks.set(trackId, mt);
    }
    return mt;
  }

  private getOrCreateMidiPlayer(trackId: string, config?: InstrumentConfig): MidiTrackPlayer {
    let p = this._midiPlayers.get(trackId);
    if (!p) {
      const existing = this._midiTracks.get(trackId);
      if (existing) {
        p = new MidiTrackPlayer(existing);
      } else {
        p = new MidiTrackPlayer(trackId, config);
        // also keep compatibility map
        this._midiTracks.set(trackId, p.getTrack());
      }
      this._midiPlayers.set(trackId, p);
    }
    return p;
  }

  /**
   * Configure l'instrument d'une piste MIDI.
   */
  configureInstrument(trackId: string, config: InstrumentConfig): void {
    const mt = this._midiTracks.get(trackId);
    if (!mt) return;

    const kindStr = config.kind;
    const paramsStr = JSON.stringify(config.params);
    
    const prevKind = this._lastKind.get(trackId);
    const prevParams = this._lastParams.get(trackId);

    if (prevKind !== kindStr) {
      mt.setInstrument(kindStr as InstrumentKind);
      this._lastKind.set(trackId, kindStr);
      
      if (kindStr === "dual-synth") {
        mt.configureDual(config.params);
      } else if (kindStr === "simple-synth") {
        mt.configureSynth(config.params);
      } else if (kindStr === "drum-machine") {
        // Aucun param à appliquer pour l’instant
      }
      this._lastParams.set(trackId, paramsStr);
    } else if (prevParams !== paramsStr) {
      if (kindStr === "dual-synth") {
        mt.configureDual(config.params);
      } else if (kindStr === "simple-synth") {
        mt.configureSynth(config.params);
      } else if (kindStr === "drum-machine") {
        // No-op
      }
      this._lastParams.set(trackId, paramsStr);
    }
  }

  /**
   * Lance un clip MIDI one-shot (sans boucle).
   */
  startMidiClipOneShot(
    trackId: string,
    clipId: string,
    notes: ReadonlyArray<MidiNote>,
    when: number,
    bpm: number,
    lengthBeats?: number
  ): void {
    const mt = this.getOrCreateMidiPlayer(trackId);
    
    // Clamp des notes qui dépassent lengthBeats
    const clampedNotes = lengthBeats && lengthBeats > 0
      ? notes.map((n) => {
          const end = n.time + n.duration;
          const clippedEnd = end > lengthBeats ? lengthBeats : end;
          const dur = Math.max(0.0001, clippedEnd - n.time);
          return {
            id: makeMidiNoteId(clipId, n.pitch, n.time, dur, n.velocity),
            pitch: n.pitch,
            time: n.time,
            duration: dur,
            velocity: n.velocity,
          };
        })
      : notes.map((n) => ({
          id: makeMidiNoteId(clipId, n.pitch, n.time, n.duration, n.velocity),
          pitch: n.pitch,
          time: n.time,
          duration: n.duration,
          velocity: n.velocity,
        }));

    const handle = mt.scheduleClip({ notes: clampedNotes }, when, bpm);

    this.setActive(trackId, {
      type: "midi",
      clipId,
      stop: () => handle.stop(),
      whenSec: when,
      bpm,
    });
  }

  /**
   * Lance un clip MIDI en boucle.
   */
  startMidiClipLoop(
    trackId: string,
    clipId: string,
    notes: ReadonlyArray<MidiNote>,
    when: number,
    bpm: number,
    loopStartBeats: number,
    loopEndBeats: number,
    startOffset?: number
  ): void {
    const mt = this.getOrCreateMidiPlayer(trackId);
    const sch = TransportScheduler.ensure();
    const secPerBeat = 60 / bpm;
    const loopLenBeats = loopEndBeats - loopStartBeats;
    
    // Filtre et clamp des notes dans la zone de boucle
    const rawLoopNotes = notes.filter(
      (n) => n.time >= loopStartBeats && n.time < loopEndBeats
    );
    
    const clamped = rawLoopNotes.map((n) => {
      const end = n.time + n.duration;
      const dur = end > loopEndBeats ? Math.max(0.0001, loopEndBeats - n.time) : n.duration;
      return {
        id: makeMidiNoteId(clipId, n.pitch, n.time, dur, n.velocity),
        pitch: n.pitch,
        time: n.time,
        duration: dur,
        velocity: n.velocity,
      };
    });

    // Gestion du startOffset (legato mode)
    let firstCycle: typeof clamped | null = null;
    let fullCycle: typeof clamped = clamped;

    if (
      typeof startOffset === "number" &&
      startOffset > loopStartBeats &&
      startOffset < loopEndBeats
    ) {
      // Cycle partiel initial
      firstCycle = clamped
        .filter((n) => n.time >= startOffset)
        .map((n) => ({ ...n, time: n.time - startOffset }));
      // Cycle complet normalisé
      fullCycle = clamped.map((n) => ({ ...n, time: n.time - loopStartBeats }));
    } else {
      fullCycle = clamped.map((n) => ({ ...n, time: n.time - loopStartBeats }));
    }

    const firstCycleNotes = firstCycle ?? fullCycle;
    const firstCycleLenBeats = firstCycle
      ? loopEndBeats - startOffset!
      : loopLenBeats;

    // Planifier le premier cycle
    const handle = mt.scheduleClip({ notes: firstCycleNotes }, when, bpm);
    
    this.setActive(trackId, {
      type: "midi",
      clipId,
      stop: () => handle.stop(),
    });

    // Planifier les cycles suivants
    let nextIndex = 1;
    let loopLenSec = loopLenBeats * secPerBeat;
    const cycleOffsetSec = firstCycle
      ? firstCycleLenBeats * secPerBeat
      : loopLenSec;
    let lastScheduledWhen = when;

    const unsub = sch.subscribe(() => {
      const ctx = AudioEngine.ensure().context;
      if (!ctx) return;

      // FIX: Augmentation du lookahead pour garantir la stabilité du scheduling
      // 0.1 -> 0.5s (500ms) pour absorber tout jitter du main thread
      const lookahead = 0.5;
      const bpmNow = sch.getBpm();
      loopLenSec = loopLenBeats * (60 / bpmNow);

      const nextWhen = when + cycleOffsetSec + (nextIndex - 1) * loopLenSec;

      if (ctx.currentTime + lookahead >= nextWhen) {
        // Anti double-scheduling
        if (
          typeof lastScheduledWhen === "number" &&
          Math.abs(nextWhen - lastScheduledWhen) < 0.001
        ) {
          return;
        }

        const currentEntry = this._midiLoops.get(trackId);
        const latestCycle = currentEntry?.notesCycle ?? fullCycle;
        const h = mt.scheduleClip({ notes: latestCycle }, nextWhen, bpmNow);
        
        this.setActive(trackId, {
          type: "midi",
          clipId,
          stop: () => h.stop(),
        });
        
        nextIndex++;
        lastScheduledWhen = nextWhen;
        
        const li = this._midiLoops.get(trackId);
        if (li) {
          this._midiLoops.set(trackId, {
            ...li,
            loopLenSec,
            nextIndex,
            lastScheduledWhen,
          });
        }
      }
    });

    this._midiLoops.set(trackId, {
      unsub,
      when0: when,
      loopLenSec,
      nextIndex: 1,
      notesCycle: fullCycle,
      lastScheduledWhen,
      lastLoopStart: loopStartBeats,
      lastLoopEnd: loopEndBeats,
      lastRefreshAt: Date.now(),
    });
  }

  /**
   * Rafraîchit les notes d'une boucle MIDI active.
   */
  async refreshMidiLoop(
    trackId: string,
    clipId: string,
    notes: ReadonlyArray<MidiNote>,
    loopStartBeats: number,
    loopEndBeats: number
  ): Promise<void> {
    const loopInfo = this._midiLoops.get(trackId);
    if (!loopInfo) return;

    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    const loopLenBeats = loopEndBeats - loopStartBeats;
    const nowMs = Date.now();
    const prevRefresh = loopInfo.lastRefreshAt ?? 0;
    const TIME_THROTTLE_MS = 10;

    if (nowMs - prevRefresh < TIME_THROTTLE_MS) return;

    const prevStart = loopInfo.lastLoopStart ?? loopStartBeats;
    const prevEnd = loopInfo.lastLoopEnd ?? loopEndBeats;
    const deltaBeats = Math.max(
      Math.abs(loopStartBeats - prevStart),
      Math.abs(loopEndBeats - prevEnd)
    );

    const rawLoopNotes = notes.filter(
      (n) => n.time >= loopStartBeats && n.time < loopEndBeats
    );
    
    const clamped = rawLoopNotes.map((n) => {
      const end = n.time + n.duration;
      const dur = end > loopEndBeats ? Math.max(0.0001, loopEndBeats - n.time) : n.duration;
      return {
        id: makeMidiNoteId(clipId, n.pitch, n.time, dur, n.velocity),
        pitch: n.pitch,
        time: n.time - loopStartBeats,
        duration: dur,
        velocity: n.velocity,
      };
    });

    // Mise à jour pour les prochains cycles
    this._midiLoops.set(trackId, {
      ...loopInfo,
      notesCycle: clamped,
      lastLoopStart: loopStartBeats,
      lastLoopEnd: loopEndBeats,
      lastRefreshAt: nowMs,
    });

    // Si grand changement de loop bounds, réinitialiser
    const BIG_DELTA_BEATS = 1 / 32;
    if (deltaBeats >= BIG_DELTA_BEATS) {
      await this.reinitializeMidiLoop(trackId, clamped, loopStartBeats, loopLenBeats, clipId);
      return;
    }

    // Sinon, injecter les nouvelles notes
    await this.injectNewNotes(trackId, clamped, loopInfo.notesCycle ?? [], loopStartBeats, loopLenBeats);
  }

  /**
   * Réinitialise complètement une boucle MIDI.
   */
  private async reinitializeMidiLoop(
    trackId: string,
    clamped: MidiNote[],
    loopStartBeats: number,
    loopLenBeats: number,
    clipId: string
  ): Promise<void> {
    const loopInfo = this._midiLoops.get(trackId);
    if (!loopInfo) return;

    const player = this._midiPlayers.get(trackId) ?? null;
    if (!player) return;
    const mt = player.getTrack();

    const ctx = AudioEngine.ensure().context;
    const sch = TransportScheduler.ensure();
    if (!ctx) return;

    try {
      mt.cancelPending();
    } catch {}
    
    try {
      loopInfo.unsub();
    } catch {}

    const beatNow = sch.getBeatFloat();
    const rel = ((beatNow - loopStartBeats) % loopLenBeats + loopLenBeats) % loopLenBeats;
    
    const remaining = clamped
      .filter((n) => n.time >= rel)
      .map((n) => ({ ...n, time: n.time - rel }));
    
    const firstCycleNotes = remaining.length > 0 ? remaining : clamped;
    const firstCycleLenBeats = remaining.length > 0 ? loopLenBeats - rel : loopLenBeats;
    const startSec = ctx.currentTime;
    const bpm = sch.getBpm();

    if (firstCycleNotes.length > 0) {
      mt.scheduleClip({ notes: firstCycleNotes }, startSec, bpm);
      this.setActive(trackId, {
        type: "midi",
        clipId,
        stop: () => mt.cancelPending(),
      });
    }

    // Réabonner pour les prochains cycles
    let nextIndex = 1;
    const secPerBeat = 60 / bpm;
    
    const unsub = sch.subscribe(() => {
      const lookahead = 0.1;
      const loopLenSec = loopLenBeats * (60 / sch.getBpm());
      const nextWhen = startSec + firstCycleLenBeats * secPerBeat + (nextIndex - 1) * loopLenSec;
      
      if (ctx.currentTime + lookahead >= nextWhen) {
        const cycleNotes = this._midiLoops.get(trackId)?.notesCycle ?? clamped;
        const h = mt.scheduleClip({ notes: cycleNotes }, nextWhen, sch.getBpm());
        
        this.setActive(trackId, {
          type: "midi",
          clipId,
          stop: () => h.stop(),
        });
        
        nextIndex++;
        
        const li = this._midiLoops.get(trackId);
        if (li) {
          this._midiLoops.set(trackId, {
            ...li,
            when0: startSec,
            loopLenSec,
            nextIndex,
          });
        }
      }
    });

    this._midiLoops.set(trackId, {
      unsub,
      when0: startSec,
      loopLenSec: loopLenBeats * secPerBeat,
      nextIndex: 1,
      notesCycle: clamped,
      lastScheduledWhen: startSec,
      lastLoopStart: loopStartBeats,
      lastLoopEnd: loopStartBeats + loopLenBeats,
      lastRefreshAt: Date.now(),
    });
  }

  /**
   * Injecte les nouvelles notes dans le cycle actuel.
   */
  private async injectNewNotes(
    trackId: string,
    newCycle: MidiNote[],
    oldCycle: MidiNote[],
    loopStartBeats: number,
    loopLenBeats: number
  ): Promise<void> {
    const ctx = AudioEngine.ensure().context;
    const sch = TransportScheduler.ensure();
    const player = this._midiPlayers.get(trackId) ?? null;
    const mt = player?.getTrack();
    if (!ctx || !mt) return;

    const key = (n: MidiNote) =>
      `${n.pitch}:${n.time.toFixed(4)}:${n.duration.toFixed(4)}:${(n.velocity ?? 0.8).toFixed(2)}`;
    
    const oldSet = new Set(oldCycle.map(key));
    const additions = newCycle.filter((n) => !oldSet.has(key(n)));

    const beatNow = sch.getBeatFloat();
    const rel = ((beatNow - loopStartBeats) % loopLenBeats + loopLenBeats) % loopLenBeats;
    const bpm = sch.getBpm();
    const secPerBeat = 60 / bpm;

    for (const n of additions) {
      if (n.time + 1e-4 >= rel) {
        const conflictExists = oldCycle.some(
          (p) => p.pitch === n.pitch && p.time + 1e-4 >= rel
        );
        if (conflictExists) continue;

        const offsetBeats = n.time - rel;
        const when = ctx.currentTime + Math.max(0, offsetBeats * secPerBeat);

        if (when - ctx.currentTime < 0.01) continue;

        mt.scheduleClip({ notes: [{ ...n, time: 0 }] }, when, bpm);
      }
    }
  }

  /**
   * Arrête un clip MIDI.
   */
  stopMidiClip(trackId: string): void {
    try {
      this.stopClip(trackId);
    } catch (err) {
      this.devWarn("stopMidiClip.stopClip", err);
    }

    const loop = this._midiLoops.get(trackId);
    if (loop) {
      try {
        loop.unsub();
      } catch (err) {
        this.devWarn("stopMidiClip.loop.unsub", err);
      }
      this._midiLoops.delete(trackId);
    }

    const mt = this._midiTracks.get(trackId);
    if (mt) {
      try {
        mt.stop();
      } catch (err) {
        this.devWarn("stopMidiClip.mt.stop", err);
      }
    }
  }

  /**
   * Retourne le clip MIDI actif pour une piste.
   */
  getActiveClip(trackId: string): ActiveClip | undefined {
    return super.getActiveClip(trackId) as ActiveClip | undefined;
  }

  /**
   * Retourne la boucle MIDI active pour une piste.
   */
  getMidiLoop(trackId: string): MidiLoopInfo | undefined {
    return this._midiLoops.get(trackId);
  }

  /**
   * Arrête tous les clips MIDI.
   */
  stopAll(): void {
    super.stopAll();

    for (const [, loop] of this._midiLoops) {
      try {
        loop.unsub();
      } catch (err) {
        this.devWarn("stopAll.loop.unsub", err);
      }
    }
    this._midiLoops.clear();

    for (const [, mt] of this._midiTracks) {
      try {
        mt.stop();
      } catch (err) {
        this.devWarn("stopAll.mt.stop", err);
      }
    }
  }

  /**
   * Nettoie les ressources.
   */
  dispose(): void {
    super.dispose();
    this._midiTracks.clear();
    this._lastKind.clear();
    this._lastParams.clear();
  }

  /**
   * Retourne les trackIds qui ont un clip MIDI actif (one-shot ou loop).
   */
  getActiveTrackIds(): string[] {
    const ids = new Set<string>();
    for (const k of super.getActiveTrackIds()) ids.add(k);
    for (const k of this._midiLoops.keys()) ids.add(k);
    return [...ids];
  }

  /**
   * Retourne tous les trackIds qui possèdent une MidiTrack instanciée.
   */
  getAllMidiTracks(): string[] {
    return [...this._midiTracks.keys()];
  }
}
