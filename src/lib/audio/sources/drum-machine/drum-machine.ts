// src/lib/audio/drum-machine/drum-machine.ts

import { AudioEngine } from "@/lib/audio/core/audio-engine"
import { isTrackRoutingV2Enabled } from "@/lib/audio/core/instrument-output"
import type { InstrumentOutput } from "@/lib/audio/core/instrument-output"
// MixerCore est déjà importé plus haut pour routing; pas besoin de doublon.
import { MixerCore } from "@/lib/audio/core/mixer"
import { perfIncrementDrumTrigger } from "@/lib/audio/perf/audio-metrics"
import type { DrumPreset, DeepPartial, TomStyle, DrumInstrument } from "@/lib/audio/sources/drums/drum-machine/types"
import { DEFAULT_PRESET } from "@/lib/audio/sources/drums/drum-machine/presets"
import { triggerKick } from "@/lib/audio/sources/drums/drum-machine/kick/kick-dsp"
import { triggerSnare } from "@/lib/audio/sources/drums/drum-machine/snare/snare"
import { triggerHat } from "@/lib/audio/sources/drums/drum-machine/hi-hat/hi-hat"
import { dbToGain } from "@/lib/audio/core/audio-engine"
import type { FxDecl } from "@/lib/audio/types"
import { triggerTom } from "./tom/tom-dsp"
import { triggerCrash1, triggerCrash2, triggerRide, triggerRideBell, triggerSplash } from "./crash/crash-dsp"
import { triggerChina } from "@/lib/audio/sources/drums/drum-machine/china/china-dsp";


// (Legacy FX supprimés: warnings et types retirés)

// Types déplacés dans types.ts

// Presets par défaut déplacés dans presets.ts

// Kick909Preset déplacé dans presets.ts

// Courbe de distorsion déplacée dans kick.ts

/**
 * Deep clone d'un preset de batterie
 * @param p 
 * @returns 
 */
function deepClonePreset(p: DrumPreset): DrumPreset {
  return JSON.parse(JSON.stringify(p)) as DrumPreset
}
/**
 * Fusionne un preset de batterie avec un patch partiel
 * @param base 
 * @param patch 
 * @returns 
 */
function mergePreset(base: DrumPreset, patch: DeepPartial<DrumPreset>): DrumPreset {
  const mergedToms = {
    low: { ...base.toms.low, ...(patch.toms?.low ?? {}) },
    mid: { ...base.toms.mid, ...(patch.toms?.mid ?? {}) },
    high: { ...base.toms.high, ...(patch.toms?.high ?? {}) },
    floor: { ...base.toms.floor, ...(patch.toms?.floor ?? {}) },
  }

  return {
    kick: { ...base.kick, ...(patch.kick ?? {}) },
    snare: { ...base.snare, ...(patch.snare ?? {}) },
    hh: { ...base.hh, ...(patch.hh ?? {}) },
    hhOpen: { ...base.hhOpen, ...(patch.hhOpen ?? {}) },
    toms: mergedToms,
    crash1: { ...base.crash1, ...(patch.crash1 ?? {}) },
    crash2: { ...base.crash2, ...(patch.crash2 ?? {}) },
    ride: { ...base.ride, ...(patch.ride ?? {}) },
    rideBell: { ...base.rideBell, ...(patch.rideBell ?? {}) },
    splash: { ...base.splash, ...(patch.splash ?? {}) },
    china: { ...base.china, ...(patch.china ?? {})}
  }
}


/**
 * Interface interne d'un canal de batterie
 */
interface Channel {
  gain: GainNode
  pan: StereoPannerNode
  mute: boolean
  analyser?: AnalyserNode
  stereo?: {
    splitter: ChannelSplitterNode
    left: AnalyserNode
    right: AnalyserNode
  }
}

export class DrumMachine {
  private ctx: AudioContext | null = null
  private channels: Map<string, Channel> = new Map()
  private presets: Map<string, DrumPreset> = new Map()
  /** Cache JSON sérialisé pour éviter stringify/parse fréquents (micro-optimisation). */
  private presetJson: Map<string, string> = new Map()
  /** Pistes en mode routing v2 (utilisent TrackNodeChain via MixerCore). */
  private trackMode: Set<string> = new Set()
  /** Gain de sommation interne par piste en mode track (avant track input). */
  private trackModeSumGain: Map<string, GainNode> = new Map()
  /** Compteurs instrumentation basique. */
  private triggerCounts: Map<string, {
    kick: number;
    snare: number;
    hh: number;
    hhOpen: number;
    tomLow: number;
    tomMid: number;
    tomHigh: number;
    tomFloor: number;
    crash1: number;
    crash2: number;
    china: number;
    ride: number;
    rideBell: number;
    splash: number;
  }> = new Map()
  /** Canal minimal cache pour chaque piste trackMode (évite recréations). */
  private trackModeChannels: Map<string, Channel> = new Map()

  async ensure() {
    const eng = AudioEngine.ensure()
    await eng.init()
    this.ctx = eng.context
  }

  private getOrCreateChannel(trackId: string): Channel | null {
    // Auto-migration: si le flag routing v2 est ON et que la piste n'a pas encore
    // de channel legacy créé, activer immédiatement le mode track routing pour éviter
    // de construire une chaîne FX legacy inutile (perf & simplification).
    if (isTrackRoutingV2Enabled() && !this.trackMode.has(trackId) && !this.channels.has(trackId)) {
      this.enableTrackRouting(trackId)
    }
    // Mode track routing v2: retourner canal minimal cache.
    if (this.trackMode.has(trackId)) {
      const cached = this.trackModeChannels.get(trackId)
      if (cached) return cached
      const mix = MixerCore.ensure()
      mix.ensureTrack(trackId)
      let sum = this.trackModeSumGain.get(trackId)
      if (!sum && this.ctx) {
        sum = this.ctx.createGain()
        sum.gain.value = 1
        this.trackModeSumGain.set(trackId, sum)
        const input = mix.getTrackInput(trackId)
        if (input) sum.connect(input)
      }
      if (!sum) return null
      const chain = mix.getTrackChain(trackId)
      // Accès panNode interne (non exposé publiquement); fallback dummy si indisponible.
      let panNode: StereoPannerNode
      if (chain && (chain as unknown as { panNode?: StereoPannerNode }).panNode) {
        panNode = (chain as unknown as { panNode: StereoPannerNode }).panNode
      } else {
        panNode = ({ pan: { value: 0 }, connect: () => { } } as unknown as StereoPannerNode)
      }
      const minimal: Channel = { gain: sum, pan: panNode, mute: false }
      this.trackModeChannels.set(trackId, minimal)
      return minimal
    }
    const ctx = this.ctx
    const mix = MixerCore.ensure()
    mix.ensureTrack(trackId)
    const trackInput = mix.getTrackInput(trackId)
    if (!ctx || !trackInput) return null
    let ch = this.channels.get(trackId)
    if (!ch) {
      const gain = ctx.createGain()
      const pan = ctx.createStereoPanner()
      gain.gain.value = dbToGain(0)
      pan.pan.value = 0
      // Chaîne simplifiée: gain -> pan -> trackInput (FX legacy supprimés)
      gain.connect(pan).connect(trackInput)
      ch = { gain, pan, mute: false }
      this.channels.set(trackId, ch)
    }
    return ch
  }

  // ----- Gestion des presets par piste -----
  private ensurePreset(trackId: string): DrumPreset {
    let p = this.presets.get(trackId)
    if (!p) {
      p = deepClonePreset(DEFAULT_PRESET)
      this.presets.set(trackId, p)
      this.presetJson.set(trackId, JSON.stringify(p))
    }
    return p
  }

  /** Retourne un clone du preset (parse depuis cache JSON pour éviter double stringify). */
  getTrackPreset(trackId: string): DrumPreset {
    this.ensurePreset(trackId)
    const cached = this.presetJson.get(trackId)
    if (cached) return JSON.parse(cached) as DrumPreset
    const fresh = this.presets.get(trackId)!
    const json = JSON.stringify(fresh)
    this.presetJson.set(trackId, json)
    return JSON.parse(json) as DrumPreset
  }

  setTrackPreset(trackId: string, preset: DeepPartial<DrumPreset>) {
    const curr = this.ensurePreset(trackId)
    const merged = mergePreset(curr, preset)
    this.presets.set(trackId, merged)
    this.presetJson.set(trackId, JSON.stringify(merged))
  }

  resetTrackPreset(trackId: string) {
    const clone = deepClonePreset(DEFAULT_PRESET)
    this.presets.set(trackId, clone)
    this.presetJson.set(trackId, JSON.stringify(clone))
  }

  exportTrackPreset(trackId: string): DrumPreset {
    return this.getTrackPreset(trackId)
  }

  setChannelSettings(trackId: string, opts: { volumeDb?: number; pan?: number; mute?: boolean; sendA?: number; sendB?: number }) {
    // Unification: toujours déléguer volume/pan/mute/sends vers MixerCore.
    const mix = MixerCore.ensure()
    mix.ensureTrack(trackId)
    if (typeof opts.volumeDb === "number") mix.setGainDb(trackId, opts.volumeDb)
    if (typeof opts.pan === "number") mix.setPan(trackId, opts.pan)
    if (typeof opts.mute === "boolean") mix.setMute(trackId, opts.mute)
    if (typeof opts.sendA === "number") mix.setSendAmount(trackId, "A", opts.sendA)
    if (typeof opts.sendB === "number") mix.setSendAmount(trackId, "B", opts.sendB)
    // Mute local utilisé pour court-circuiter playSound sans dépendre du meter.
    const ch = this.getOrCreateChannel(trackId)
    if (ch && typeof opts.mute === "boolean") ch.mute = opts.mute
  }

  // FX legacy supprimés: anciennes méthodes add/remove/move/bypass/update n'existent plus.
  // Toute gestion d'effets doit désormais passer par MixerCore.setTrackFx via setTrackFxChain.

  /**
   * purgeLegacyFxIfSafe()
   * ---------------------
   * Supprime la chaîne FX legacy (fxIn/fxOut/effects) de toutes les pistes encore legacy
   * si toutes les pistes actives sont en mode v2 (trackMode) OU si la liste d'ids fournie
   * est entièrement migrée. Sécurisé: ne fait rien tant qu'une piste legacy potentielle existe.
   *
   * Usage typique (après migration complète):
   *   drumMachine.purgeLegacyFxIfSafe();
   * Impact perf: libère nodes FX inutiles, réduit le graphe.
   */
  purgeLegacyFxIfSafe(): void { /* legacy déjà supprimé */ }

  /**
   * setTrackFxChain(trackId, fxDecls)
   * -------------------------------
   * API unifiée de définition de FX par piste.
   * - En mode v2 : délègue directement à MixerCore.setTrackFx (TrackNodeChain gère les nodes).
   * - En mode legacy : convertit FxDecl[] en AudioEffect[] simplifiés puis reconstruit chaîne locale.
   * Les types supportés: gain, eq, delay, reverb (aligné avec TrackNodeChain).
   */
  setTrackFxChain(trackId: string, fxDecls: readonly FxDecl[]): void {
    const mix = MixerCore.ensure();
    mix.setTrackFx(trackId, fxDecls);
  }

  // createLegacyFxNode supprimé (FX legacy retirés)

  // rebuildFxChain supprimé (FX legacy retirés)

  playSound(instrument: DrumInstrument, velocity: number, when: number, trackId: string) {
    const ch = this.getOrCreateChannel(trackId)
    if (!ch || ch.mute) return
    const ctx = this.ctx
    if (!ctx) return

    // Instrumentation comptage triggers
    let counts = this.triggerCounts.get(trackId)
    if (!counts) {
      counts = {
        kick: 0,
        snare: 0,
        hh: 0,
        hhOpen: 0,
        tomLow: 0,
        tomMid: 0,
        tomHigh: 0,
        tomFloor: 0,
        crash1: 0,
        crash2: 0,
        china: 0,
        ride: 0,
        rideBell: 0,
        splash: 0,
      }
      this.triggerCounts.set(trackId, counts)
    }

    switch (instrument) {
      case "kick":
        this.playKick(ctx, ch, velocity, when, trackId)
        break
      case "snare":
        this.playSnare(ctx, ch, velocity, when, trackId)
        break
      case "tomLow":
        this.playTom(ctx, ch, velocity, when, trackId, "low")
        break
      case "tomMid":
        this.playTom(ctx, ch, velocity, when, trackId, "mid")
        break
      case "tomHigh":
        this.playTom(ctx, ch, velocity, when, trackId, "high")
        break
      case "tomFloor":
        this.playTom(ctx, ch, velocity, when, trackId, "floor")
        break
      case "hh":
        this.playHiHat(ctx, ch, velocity, when, trackId)
        break
      case "hhOpen":              // ✅ open hat
        this.playHiHatOpen(ctx, ch, velocity, when, trackId);
        break;
      case "crash1":
        this.playCrash1(ctx, ch, velocity, when, trackId)
        break
      case "crash2":
        this.playCrash2(ctx, ch, velocity, when, trackId)
        break
      case "ride":
        this.playRide(ctx, ch, velocity, when, trackId)
        break
      case "rideBell":
        this.playRideBell(ctx, ch, velocity, when, trackId)
        break
      case "splash":
        this.playSplash(ctx, ch, velocity, when, trackId)
        break
      case "china":
        this.playChina(ctx, ch, velocity, when, trackId)
        break
      default:
    }

  }

  private playKick(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerKick(ctx, ch.gain, velocity, when, preset.kick)
    const c = this.triggerCounts.get(trackId); if (c) c.kick++
    perfIncrementDrumTrigger("kick")
  }

  private playSnare(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerSnare(ctx, ch.gain, velocity, when, preset.snare)
    const c = this.triggerCounts.get(trackId); if (c) c.snare++
    perfIncrementDrumTrigger("snare")
  }

  private playHiHat(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerHat(ctx, ch.gain, velocity, when, preset.hh)
    const c = this.triggerCounts.get(trackId); if (c) c.hh++
    perfIncrementDrumTrigger("hh")
  }

  private playHiHatOpen(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId);
    const hatPreset = preset.hhOpen ?? preset.hh; // fallback au closed si pas défini
    triggerHat(ctx, ch.gain, velocity, when, hatPreset);
    const c = this.triggerCounts.get(trackId); if (c) c.hhOpen++;
    // perfIncrementDrumTrigger("hhOpen");
  }

  private playTom(
    ctx: AudioContext,
    ch: Channel,
    velocity: number,
    when: number,
    trackId: string,
    which: TomStyle,
  ) {
    const preset = this.ensurePreset(trackId)
    const toms = preset.toms

    // Map TomKey to TomsPreset keys
    const tomKeyMap: Record<TomStyle, keyof typeof toms> = {
      low: "low",
      mid: "mid",
      high: "high",
      floor: "floor",
    }

    const params = toms?.[tomKeyMap[which]]

    if (!params) return

    triggerTom(ctx, ch.gain, velocity, when, params)

    const c = this.triggerCounts.get(trackId)
    if (c) {
      if (which === "low") c.tomLow++
      else if (which === "mid") c.tomMid++
      else if (which === "high") c.tomHigh++
      else c.tomFloor++
    }

    // perfIncrementDrumTrigger("tom")
  }

  private playCrash1(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerCrash1(ctx, ch.gain, velocity, when, preset.crash1)
    const c = this.triggerCounts.get(trackId); if (c) c.crash1++
    // perfIncrementDrumTrigger("crash1")
  }

  private playChina(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId);
    triggerChina(ctx, ch.gain, velocity, when, preset.china)
    const c = this.triggerCounts.get(trackId); if (c) c.china++
  }

  private playCrash2(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerCrash2(ctx, ch.gain, velocity, when, preset.crash2)
    const c = this.triggerCounts.get(trackId); if (c) c.crash2++
  }

  private playRide(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerRide(ctx, ch.gain, velocity, when, preset.ride)
    const c = this.triggerCounts.get(trackId); if (c) c.ride++
  }

  private playRideBell(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerRideBell(ctx, ch.gain, velocity, when, preset.rideBell)
    const c = this.triggerCounts.get(trackId); if (c) c.rideBell++
  }

  private playSplash(ctx: AudioContext, ch: Channel, velocity: number, when: number, trackId: string) {
    const preset = this.ensurePreset(trackId)
    triggerSplash(ctx, ch.gain, velocity, when, preset.splash)
    const c = this.triggerCounts.get(trackId); if (c) c.splash++
  }

  getAudioContext(): AudioContext | null { return this.ctx }

  getTrackAnalyser(trackId: string, opts?: { fftSize?: number; smoothing?: number; minDb?: number; maxDb?: number }): AnalyserNode | null {
    // Mode track: créer un analyser passif relié au track input (pré-pan pour simplification).
    if (this.trackMode.has(trackId) && this.ctx) {
      const mix = MixerCore.ensure();
      const chain = mix.getTrackChain(trackId);
      if (!chain) return null;
      const an = chain.getAnalyserNode();
      if (opts?.fftSize) an.fftSize = Math.min(1024, Math.max(128, opts.fftSize));
      if (opts?.smoothing !== undefined) an.smoothingTimeConstant = opts.smoothing;
      if (opts?.minDb !== undefined) an.minDecibels = opts.minDb;
      if (opts?.maxDb !== undefined) an.maxDecibels = opts.maxDb;
      return an;
    }
    const ch = this.getOrCreateChannel(trackId)
    if (!ch || !this.ctx) return null
    if (!ch.analyser) {
      const an = this.ctx.createAnalyser()
      ch.pan.connect(an) // tap post-pan/post-fader
      ch.analyser = an
    }
    const an = ch.analyser
    if (opts?.fftSize) an.fftSize = Math.min(1024, Math.max(128, opts.fftSize))
    if (opts?.smoothing !== undefined) an.smoothingTimeConstant = opts.smoothing
    if (opts?.minDb !== undefined) an.minDecibels = opts.minDb
    if (opts?.maxDb !== undefined) an.maxDecibels = opts.maxDb
    return an
  }

  /**
   * Retourne (ou crée) un couple d'AnalyserNodes stéréo (L/R) pour une piste.
   * On ajoute une branche passive: pan -> splitter -> (left/right analyser).
   * La connexion existante pan -> master est conservée pour ne pas modifier le routing.
   */
  getTrackStereoAnalysers(trackId: string, opts?: { fftSize?: number; smoothing?: number }): { left: AnalyserNode; right: AnalyserNode } | null {
    if (this.trackMode.has(trackId) && this.ctx) {
      const mix = MixerCore.ensure();
      const chain = mix.getTrackChain(trackId);
      if (!chain) return null;
      return chain.getStereoAnalysers(opts);
    }
    const ch = this.getOrCreateChannel(trackId)
    const ctx = this.ctx
    if (!ch || !ctx) return null
    if (!ch.stereo) {
      const splitter = ctx.createChannelSplitter(2)
      // branche passive
      ch.pan.connect(splitter)
      const left = ctx.createAnalyser()
      const right = ctx.createAnalyser()
      splitter.connect(left, 0)
      splitter.connect(right, 1)
      if (opts?.fftSize) {
        const fft = Math.min(1024, Math.max(128, opts.fftSize))
        left.fftSize = fft; right.fftSize = fft
      }
      if (opts?.smoothing !== undefined) { left.smoothingTimeConstant = opts.smoothing; right.smoothingTimeConstant = opts.smoothing }
      ch.stereo = { splitter, left, right }
    } else if (opts) {
      const { left, right } = ch.stereo
      if (opts.fftSize) {
        const fft = Math.min(1024, Math.max(128, opts.fftSize))
        left.fftSize = fft; right.fftSize = fft
      }
      if (opts.smoothing !== undefined) { left.smoothingTimeConstant = opts.smoothing; right.smoothingTimeConstant = opts.smoothing }
    }
    return ch.stereo ? { left: ch.stereo.left, right: ch.stereo.right } : null
  }

  /** Active le mode Track Routing V2 pour une piste donnée. */
  enableTrackRouting(trackId: string) {
    if (!isTrackRoutingV2Enabled()) return
    this.trackMode.add(trackId)
    const mix = MixerCore.ensure()
    mix.ensureTrack(trackId)
    // Forcer création de gain de somme
    this.getOrCreateChannel(trackId)
    // Vérifier si toutes les pistes connues sont désormais en mode v2 et purger legacy FX si oui.
    // PERF: évite de conserver fxIn/fxOut/effects inutiles après migration complète.
    let allV2 = true
    for (const id of this.channels.keys()) {
      if (!this.trackMode.has(id)) { allV2 = false; break }
    }
    if (allV2) {
      this.purgeLegacyFxIfSafe()
    }
  }

  /** Retour instrumentation des triggers par piste. */
  getTriggerMetrics(trackId: string) {
    return this.triggerCounts.get(trackId) ?? { kick: 0, snare: 0, hh: 0, hhOpen: 0, tomLow: 0, tomMid: 0, tomHigh: 0, tomFloor: 0, crash1: 0, crash2: 0, china: 0, ride: 0, rideBell: 0, splash: 0 }
  }
}

// Instance partagée pour éviter des graphes audio parallèles (nécessaire pour les vu-mètres)
export const drumMachine = new DrumMachine()

/**
 * createDrumInstrumentOutput(trackId)
 * -----------------------------------
 * Adaptateur par piste exposant l'interface InstrumentOutput pour DrumMachine.
 * Permet une migration progressive identique à SimpleSynth sans modifier l'API multi-piste existante.
 */
export function createDrumInstrumentOutput(trackId: string): InstrumentOutput {
  return {
    connectToTrack(id: string) {
      drumMachine.enableTrackRouting(id)
    },
    disconnect() {
      // Sortie du mode track routing pour cette piste (la piste reste créée).
      drumMachine["trackMode"].delete(trackId)
    },
    get trackId() { return trackId },
    getAnalyserNode() { return drumMachine.getTrackAnalyser(trackId) },
    getStereoAnalysers(opts) { return drumMachine.getTrackStereoAnalysers(trackId, opts) },
    getActiveVoiceCount() { return 0 }, // Percussif one-shot → pas de voix persistantes.
    dispose() {
      // Nettoyage léger: retirer caches minimal channel & sumGain.
      drumMachine["trackModeChannels"].delete(trackId)
      const sum = drumMachine["trackModeSumGain"].get(trackId)
      if (sum) { try { sum.disconnect() } catch { } }
      drumMachine["trackModeSumGain"].delete(trackId)
      drumMachine["trackMode"].delete(trackId)
    },
  }
}
