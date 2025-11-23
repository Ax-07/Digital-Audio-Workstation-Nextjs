// src/lib/audio/core/session-player-refactored.ts

/* SessionPlayer Refactorisé
   - Architecture modulaire avec séparation des responsabilités
   - AudioClipManager : gestion des clips audio
   - MidiClipManager : gestion des clips MIDI et boucles
   - UISyncManager : synchronisation UI/Audio
   - SessionPlayer : orchestration globale
*/

import { TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { useProjectStore } from "@/lib/stores/project.store";
import type { MidiNote, ClipDecl } from "@/lib/audio/types";
import { AudioClipManager } from "./session-player/audio-clip-manager";
import { MidiClipManager } from "./session-player/midi-clip-manager";
import { UISyncManager } from "./session-player/ui-sync-manager";
import { makeMidiNoteId, shouldDebounce, calculateDelayMs } from "./session-player/helpers";
import type { InstrumentConfig } from "./session-player/types";
import { MidiTrack } from "@/lib/audio/sources/midi-track";
import { PerfMonitor } from "@/lib/perf/perf-monitor";

/**
 * SessionPlayer
 * 
 * Orchestrateur principal qui :
 * - S'abonne aux événements de lancement du TransportScheduler
 * - Délègue la gestion audio aux AudioClipManager
 * - Délègue la gestion MIDI aux MidiClipManager
 * - Délègue la synchronisation UI au UISyncManager
 * - Gère les watchers de changements d'état (loop, instruments)
 */
class SessionPlayer {
  private static _instance: SessionPlayer | null = null;
  private _started = false;

  // Managers dédiés
  private readonly _audioManager = new AudioClipManager();
  private readonly _midiManager = new MidiClipManager();
  private readonly _uiManager = new UISyncManager();

  // Contrôle de lancement
  private _unsub: (() => void) | null = null;
  private _lastLaunchTime = new Map<string, number>();
  private _storeUnsubs: Array<() => void> = [];
  private static readonly __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  private devWarn(scope: string, err: unknown) {
    if (SessionPlayer.__DEV__) {
      console.warn(`[SessionPlayer:${scope}]`, err);
    }
  }

  /** Singleton */
  static ensure(): SessionPlayer {
    if (!this._instance) this._instance = new SessionPlayer();
    return this._instance;
  }

  /**
   * Démarre le SessionPlayer.
   */
  start(): void {
    if (this._started) return;
    
    const sch = TransportScheduler.ensure();
    this._unsub = sch.onLaunch((e) => {
      const pm = PerfMonitor();
      if (pm.isEnabled()) pm.recordEvent("session.launch.recv");
      this.handleLaunch(e.when, e.trackId, e.clipId, e.clipType);
    });
    
    this._started = true;
    this.attachInstrumentSubscriptions().catch(() => {});
    this.attachLoopWatcher().catch(() => {});
  }

  /**
   * Arrête le SessionPlayer.
   */
  stop(): void {
    if (!this._started) return;
    
    this._unsub?.();
    this._unsub = null;
    this.stopAll();

    for (const u of this._storeUnsubs) {
      try {
        u();
      } catch {}
    }
    this._storeUnsubs = [];
    this._started = false;
  }

  /**
   * Handler principal de lancement de clip.
   */
  private async handleLaunch(
    when: number,
    trackId: string,
    clipId: string,
    clipType: "audio" | "midi"
  ): Promise<void> {
    const pm = PerfMonitor();
    const t0 = pm.isEnabled() ? performance.now() : 0;
    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    // Anti double-lancement
    if (shouldDebounce(this._lastLaunchTime.get(trackId), ctx.currentTime)) {
      return;
    }
    this._lastLaunchTime.set(trackId, ctx.currentTime);

    // S'assurer que la piste existe dans le mixer
    try {
      const tEns = pm.isEnabled() ? performance.now() : 0;
      (await import("@/lib/audio/core/mixer")).MixerCore.ensure().ensureTrack(trackId);
      if (pm.isEnabled()) pm.recordDuration("session.ensureTrack", performance.now() - tEns);
    } catch (err) {
      this.devWarn("handleLaunch.ensureTrack", err);
    }

    // Arrêter le clip précédent sur cette piste
    await this.stopPreviousClip(trackId, when);

    // Récupérer le clip depuis le projet
    const clip = this.findClip(trackId, clipId);
    if (!clip) {
      await this._uiManager.clearPlaying(trackId);
      return;
    }

    const sceneIndex = this.findSceneIndex(trackId, clipId);
    
    // Marquer comme "scheduled" dans l'UI
    await this._uiManager.setScheduled(trackId, sceneIndex, when);

    // Lancer le clip selon son type
    if (clipType === "audio" && clip.type === "audio") {
      if (pm.isEnabled()) pm.recordEvent("session.audio.start");
      const ta = pm.isEnabled() ? performance.now() : 0;
      await this.launchAudioClip(trackId, clip, when, sceneIndex);
      if (pm.isEnabled()) pm.recordDuration("session.audio.launch", performance.now() - ta);
    } else if (clipType === "midi" && clip.type === "midi") {
      if (pm.isEnabled()) pm.recordEvent("session.midi.start");
      const tm = pm.isEnabled() ? performance.now() : 0;
      await this.launchMidiClip(trackId, clip, when, sceneIndex);
      if (pm.isEnabled()) pm.recordDuration("session.midi.launch", performance.now() - tm);
    }

    if (pm.isEnabled()) pm.recordDuration("session.handleLaunch", performance.now() - t0);
  }

  /**
   * Arrête le clip précédent sur une piste.
   */
  private async stopPreviousClip(trackId: string, when: number): Promise<void> {
    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    // Arrêter clip audio précédent
    const prevAudio = this._audioManager.getActiveClip(trackId);
    if (prevAudio) {
      if (prevAudio.stopAt) {
        prevAudio.stopAt(when);
      } else {
        const delay = calculateDelayMs(ctx.currentTime, when);
        window.setTimeout(() => {
          this._audioManager.stopAudioClip(trackId);
        }, Math.round(delay));
      }
    }

    // Arrêter clip MIDI précédent
    this._midiManager.stopMidiClip(trackId);
  }

  /**
   * Lance un clip audio.
   */
  private async launchAudioClip(
    trackId: string,
    clip: ClipDecl,
    when: number,
    sceneIndex: number
  ): Promise<void> {
    if (!clip.sampleUrl) return;

    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    const bpm = TransportScheduler.ensure().getBpm();
    const secPerBeat = 60 / bpm;

    const lengthBeats = clip.lengthBeats && clip.lengthBeats > 0 ? clip.lengthBeats : undefined;
    const hasLoop =
      clip.loop === true &&
      typeof clip.loopStart === "number" &&
      typeof clip.loopEnd === "number" &&
      clip.loopEnd > clip.loopStart;

    await this._audioManager.startAudioClip(trackId, clip.id, clip.sampleUrl, when, {
      loop: hasLoop,
      loopStartSec: hasLoop ? clip.loopStart! * secPerBeat : undefined,
      loopEndSec: hasLoop ? clip.loopEnd! * secPerBeat : undefined,
      stopAfterSec: !hasLoop && lengthBeats ? lengthBeats * secPerBeat : undefined,
    });

    // Synchroniser l'UI
    await this._uiManager.setPlayingAt(trackId, sceneIndex, when, ctx.currentTime);

    // Auto-clear pour les one-shots
    if (!hasLoop && lengthBeats) {
      const endAt = when + lengthBeats * secPerBeat;
      await this._uiManager.clearPlayingAt(trackId, endAt, ctx.currentTime);
    }
  }

  /**
   * Lance un clip MIDI.
   */
  private async launchMidiClip(
    trackId: string,
    clip: ClipDecl,
    when: number,
    sceneIndex: number
  ): Promise<void> {
    if (!clip.notes || clip.notes.length === 0) return;

    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    // Configurer l'instrument
    const config = await this.getInstrumentConfig(trackId);
    if (config) {
      // IMPORTANT: Créer/assurer la MidiTrack avec la bonne config AVANT scheduling
      // pour éviter la création par défaut en simple-synth.
      this._midiManager.getMidiTrack(trackId, config);
      this._midiManager.configureInstrument(trackId, config);
    }

    const bpm = TransportScheduler.ensure().getBpm();
    const loopStartBeats = typeof clip.loopStart === "number" ? clip.loopStart : 0;
    const loopEndBeats =
      clip.loop === true && typeof clip.loopEnd === "number" ? clip.loopEnd : undefined;

    const hasLoop =
      clip.loop === true &&
      typeof loopEndBeats === "number" &&
      loopEndBeats > loopStartBeats;

    if (hasLoop) {
      // Calculer startOffset si en mode legato
      let startOffset: number | undefined;
      const mode = await this._uiManager.getLaunchMode();
      
      if (mode === "legato") {
        const sch = TransportScheduler.ensure();
        const beatNow = sch.getBeatFloat();
        const spBeat = 60 / sch.getBpm();
        const beatsUntilWhen = Math.max(0, when - ctx.currentTime) / spBeat;
        const whenBeat = beatNow + beatsUntilWhen;
        const loopLen = loopEndBeats! - loopStartBeats;
        const rel = ((whenBeat - loopStartBeats) % loopLen + loopLen) % loopLen;
        startOffset = loopStartBeats + rel;
      } else if (typeof clip.startOffset === "number") {
        startOffset = Math.min(
          Math.max(loopStartBeats, clip.startOffset),
          loopEndBeats!
        );
      }

      this._midiManager.startMidiClipLoop(
        trackId,
        clip.id,
        clip.notes,
        when,
        bpm,
        loopStartBeats,
        loopEndBeats!,
        startOffset
      );
    } else {
      this._midiManager.startMidiClipOneShot(
        trackId,
        clip.id,
        clip.notes,
        when,
        bpm,
        clip.lengthBeats
      );

      // Auto-stop pour les one-shots
      const maxEndBeats = clip.notes.reduce(
        (max: number, n: MidiNote) => Math.max(max, n.time + n.duration),
        0
      );
      const effectiveEndBeats =
        clip.lengthBeats && clip.lengthBeats > 0
          ? Math.min(clip.lengthBeats, maxEndBeats)
          : maxEndBeats;
      const endAt = when + effectiveEndBeats * (60 / bpm);

      await this._uiManager.clearPlayingAt(trackId, endAt, ctx.currentTime);
      
      window.setTimeout(() => {
        this._midiManager.stopMidiClip(trackId);
      }, Math.round(calculateDelayMs(ctx.currentTime, endAt)));
    }

    // Synchroniser l'UI
    await this._uiManager.setPlayingAt(trackId, sceneIndex, when, ctx.currentTime);
  }

  /**
   * Applique un brouillon de notes MIDI en temps réel.
   */
  async applyMidiDraft(
    trackId: string,
    sceneIndex: number,
    draft: ReadonlyArray<MidiNote>
  ): Promise<void> {
    const proj = useProjectStore.getState().project;
    const scene = proj.session?.scenes?.[sceneIndex];
    const clip = scene?.clips?.[trackId];
    
    if (!clip || clip.type !== "midi") return;

    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    const sch = TransportScheduler.ensure();
    const bpm = sch.getBpm();

    // Cas LOOP
    if (
      clip.loop === true &&
      typeof clip.loopStart === "number" &&
      typeof clip.loopEnd === "number"
    ) {
      const loopInfo = this._midiManager.getMidiLoop(trackId);
      if (loopInfo) {
        await this._midiManager.refreshMidiLoop(
          trackId,
          clip.id,
          draft as MidiNote[],
          clip.loopStart,
          clip.loopEnd
        );
        return;
      }
    }

    // Cas NON-LOOP : replanifier le reste
    const active = this._midiManager.getActiveClip(trackId);
    if (!active || active.type !== "midi" || active.clipId !== clip.id) return;

    const whenSec = active.whenSec;
    if (typeof whenSec !== "number") return;

    const secPerBeat = 60 / (active.bpm ?? bpm);
    const rel = Math.max(0, (ctx.currentTime - whenSec) / secPerBeat);

    const lengthBeats = clip.lengthBeats ?? undefined;
    const clampedNotes =
      lengthBeats && lengthBeats > 0
        ? draft.map((n) => {
            const end = n.time + n.duration;
            const clippedEnd = end > lengthBeats ? lengthBeats : end;
            const dur = Math.max(0.0001, clippedEnd - n.time);
            return {
              id: makeMidiNoteId(clip.id, n.pitch, n.time, dur, n.velocity),
              pitch: n.pitch,
              time: n.time,
              duration: dur,
              velocity: n.velocity,
            };
          })
        : draft.map((n) => ({
            id: makeMidiNoteId(clip.id, n.pitch, n.time, n.duration, n.velocity),
            pitch: n.pitch,
            time: n.time,
            duration: n.duration,
            velocity: n.velocity,
          }));

    const mt = this._midiManager.getMidiTrack(trackId);
    if (!mt) return;

    try {
      mt.cancelPending();
    } catch (err) {
      this.devWarn("applyMidiDraft.mt.cancelPending", err);
    }

    const remaining = clampedNotes
      .filter((n) => n.time + 1e-4 >= rel)
      .map((n) => ({ ...n, time: Math.max(0, n.time - rel) }));

    if (remaining.length > 0) {
      mt.scheduleClip({ notes: remaining }, ctx.currentTime, bpm);
    }
  }

  /**
   * Rafraîchit une boucle MIDI active.
   */
  async refreshActiveMidiLoop(trackId: string, sceneIndex: number): Promise<void> {
    const proj = useProjectStore.getState().project;
    const scene = proj.session?.scenes?.[sceneIndex];
    const clip = scene?.clips?.[trackId];
    
    if (!clip || clip.type !== "midi" || !Array.isArray(clip.notes)) return;

    const loopInfo = this._midiManager.getMidiLoop(trackId);
    if (!loopInfo) return;

    if (
      clip.loop === true &&
      typeof clip.loopStart === "number" &&
      typeof clip.loopEnd === "number"
    ) {
      await this._midiManager.refreshMidiLoop(
        trackId,
        clip.id,
        clip.notes,
        clip.loopStart,
        clip.loopEnd
      );
    }
  }

  /**
   * Précharge tous les clips audio.
   */
  async prime(): Promise<void> {
    const proj = useProjectStore.getState().project;
    const scenes = proj.session?.scenes ?? [];
    
    const clips: Array<{ trackId: string; clipId: string; sampleUrl: string }> = [];
    const seen = new Set<string>();

    for (const s of scenes) {
      for (const [trackId, clip] of Object.entries(s.clips)) {
        if (!clip || !clip.sampleUrl) continue;
        const key = `${trackId}@${clip.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        clips.push({ trackId, clipId: clip.id, sampleUrl: clip.sampleUrl });
      }
    }

    const { useUiStore } = await import("@/lib/stores/ui.store");
    const begin = useUiStore.getState().setPreloadBegin;
    const inc = useUiStore.getState().setPreloadIncrement;
    const done = useUiStore.getState().setPreloadDone;

    begin(clips.length);
    const results = await this._audioManager.preloadSamples(clips);
    
    for (const result of results) {
      inc(result.success);
    }
    
    done();
  }

  /**
   * Arrête tous les clips.
   */
  stopAll(): void {
    this._audioManager.stopAll();
    this._midiManager.stopAll();
    this._uiManager.clearAllPlaying().catch((err) => this.devWarn("stopAll.clearAllPlaying", err));
  }

  /**
   * Arrête une piste spécifique.
   */
  stopTrack(trackId: string): void {
    this._audioManager.stopAudioClip(trackId);
    this._midiManager.stopMidiClip(trackId);
    this._uiManager.clearPlaying(trackId).catch((err) => this.devWarn("stopTrack.clearPlaying", err));
  }

  /**
   * Programme l'arrêt d'une piste à un moment précis.
   */
  scheduleStopTrack(trackId: string, whenSec: number): void {
    const ctx = AudioEngine.ensure().context;
    if (!ctx) {
      this.stopTrack(trackId);
      return;
    }

    const target = Math.max(ctx.currentTime, whenSec);
    const delayMs = calculateDelayMs(ctx.currentTime, target);

    // Planifier l'arrêt audio
    this._audioManager.scheduleStopAudioClip(trackId, target);

    // Planifier le cleanup
    window.setTimeout(() => {
      this._audioManager.stopAudioClip(trackId);
      this._midiManager.stopMidiClip(trackId);
      this._uiManager.clearPlaying(trackId).catch(() => {});
    }, Math.round(delayMs));
  }

  /**
   * Retourne les trackIds actifs.
   */
  getActiveTrackIds(): string[] {
    const audioTracks = this._audioManager.getActiveTrackIds();
    const midiTracks = this._midiManager.getActiveTrackIds();
    return [...new Set([...audioTracks, ...midiTracks])];
  }

  // ==================== Helpers privés ====================

  private findClip(trackId: string, clipId: string): ClipDecl | null {
    const proj = useProjectStore.getState().project;
    const scenes = proj.session?.scenes ?? [];
    
    for (const scene of scenes) {
      const clip = scene.clips[trackId];
      if (clip && clip.id === clipId) {
        return clip;
      }
    }
    
    return null;
  }

  private findSceneIndex(trackId: string, clipId: string): number {
    const proj = useProjectStore.getState().project;
    const scenes = proj.session?.scenes ?? [];
    
    return scenes.findIndex((s) => s.clips[trackId]?.id === clipId);
  }

  private async getInstrumentConfig(trackId: string): Promise<InstrumentConfig | null> {
    try {
      const { useInstrumentStore } = await import("@/lib/stores/instrument.store");
      const kind = useInstrumentStore.getState().getKind(trackId);
      
      if (kind === "dual-synth") {
        const { useDualSynthStore } = await import("@/lib/stores/dual-synth.store");
        return {
          kind: "dual-synth",
          params: useDualSynthStore.getState().getParams(trackId),
        };
      } else if (kind === "drum-machine") {
        // Pas de params spécifiques pour l’instant
        return {
          kind: "drum-machine",
          params: {},
        };
      } else {
        const { useSynthStore } = await import("@/lib/stores/synth.store");
        return {
          kind: "simple-synth",
          params: useSynthStore.getState().getParams(trackId),
        };
      }
    } catch {
      return null;
    }
  }

  private async attachInstrumentSubscriptions(): Promise<void> {
    try {
      const { useInstrumentStore } = await import("@/lib/stores/instrument.store");
      const { useSynthStore } = await import("@/lib/stores/synth.store");
      const { useDualSynthStore } = await import("@/lib/stores/dual-synth.store");

      const applyToAll = async () => {
        const trackIds = this._midiManager.getAllMidiTracks();
        
        for (const trackId of trackIds) {
          const config = await this.getInstrumentConfig(trackId);
          if (config) {
            this._midiManager.configureInstrument(trackId, config);
          }
        }
      };

      this._storeUnsubs.push(useInstrumentStore.subscribe(applyToAll));
      this._storeUnsubs.push(useSynthStore.subscribe(applyToAll));
      this._storeUnsubs.push(useDualSynthStore.subscribe(applyToAll));
    } catch (err) {
      this.devWarn("attachInstrumentSubscriptions", err);
    }
  }

  private async attachLoopWatcher(): Promise<void> {
    try {
      const { useProjectStore } = await import("@/lib/stores/project.store");

      const cb = async () => {
        // Placeholder: futur contrôle de cohérence loops/UI
        void useProjectStore.getState().project; // évite warning unused
        // Option: on pourrait comparer _uiManager.getPlayingCells() et états internes
      };

      this._storeUnsubs.push(useProjectStore.subscribe(cb));
    } catch (err) {
      this.devWarn("attachLoopWatcher", err);
    }
  }

  /**
   * Obtient une MidiTrack pour la preview (piano roll, pads).
   * Configure automatiquement l'instrument si nécessaire.
   */
  async getMidiTrackForPreview(trackId: string): Promise<MidiTrack> {
    const config = await this.getInstrumentConfig(trackId);
    return this._midiManager.getMidiTrack(trackId, config ?? undefined);
  }
}

/**
 * Accès public au SessionPlayer singleton.
 */
export function getSessionPlayer(): SessionPlayer {
  return SessionPlayer.ensure();
}
