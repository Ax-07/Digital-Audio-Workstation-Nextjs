// src/lib/audio/sources/simple-synth.ts

/* SimpleSynth (v2 - Generic Envelope)
  - Synthé mono-oscillateur polyphonique pour clips MIDI.
  - Gestion de voix (voice pool) + vol de voix (voice stealing).
  - Enveloppes génériques (GenericEnvelope) pour :
      • amplitude (gain)
      • detune (pitch mod en cents)
  - Lecture de clip sync via TransportScheduler (quantized scheduling).
*/

import { perfIncrementVoiceSteal, perfSetActiveVoices } from "@/devtools/perf/audio-metrics";
import {
  midiToFreq,
  clamp,
  ensureAudioContext,
  findInactiveVoice,
  findOldestVoice,
  applyVoiceRelease,
  stopOscillator,
  resetVoiceGain,
  reconnectVoiceGain,
  findVoiceByPitch,
  scheduleVoiceCleanup,
  propagateDetune,
  applyDetuneEnvelope,
  type BaseVoice,
} from "./synth-utils";
import { GenericEnvelope, normalizeEnvelope } from "../../../../core/audio-engine/envelopes/generic-envelope";
import { applyEnvelopeToGain } from "../../../../core/audio-engine/envelopes/apply-generic-envelope";
import { MixerCore } from "../../core/mixer/mixer";
import { EnvelopeMod } from "../../types";
import { getTrackAnalyser, getTrackStereoAnalysers, InstrumentOutput } from "../../core/instrument-output";
import { dbToGain } from "../../core/audio-engine";

/**
 * EnvelopeMod
 * -----------
 * Décrit une modulation par enveloppe appliquée à une cible donnée.
 *
 * - id        : identifiant stable (pour l’UI / automation)
 * - target    : "amp" (gain) ou "detune" (pitch en cents)
 * - macro     : placeholder pour tie-in avec macro system
 */

/**
 * SimpleSynthParams
 * -----------------
 * Paramètres de haut niveau du synthé :
 *
 * - waveform        : forme d’onde (WebAudio OscillatorType)
 * - detuneCents     : offset de pitch global en cents
 * - maxVoices       : taille du pool de voix
 * - ampEnv          : enveloppe générique de base (fallback)
 * - envTarget       : cible de ampEnv ("amp" ou "detune")
 * - envDetuneDepth  : profondeur en cents si envTarget = "detune"
 * - envs            : liste de modulations avancées par enveloppe
 *                     (si définie, prioritaire sur ampEnv/envTarget)
 */
export type SimpleSynthParams = {
  waveform?: OscillatorType; // "sine" | "square" | "sawtooth" | "triangle"
  detuneCents?: number; // -1200..+1200
  maxVoices?: number; // voice pool size
  ampEnv?: GenericEnvelope;
  /** Cible de l'enveloppe générique: amplitude (gain) ou detune (cents). */
  envTarget?: "amp" | "detune";
  /** Profondeur de modulation (en cents) si target=detune. */
  envDetuneDepth?: number;
  /** Liste de modulations par enveloppe. Si présent, prioritaire sur ampEnv/envTarget. */
  envs?: EnvelopeMod[];
};

/**
 * Voice
 * -----
 * Extension de BaseVoice avec l'oscillateur unique.
 *
 * - osc : OscillatorNode pour cette voix (WebAudio = one-shot)
 */
type Voice = BaseVoice & {
  osc: OscillatorNode | null;
};

export class SimpleSynth implements InstrumentOutput {
  /** AudioContext partagé (issu de AudioEngine) */
  private ctx: AudioContext | null = null;

  /**
   * Paramètres internes du synthé, toujours complets (Required<>).
   * On fournit un preset d’enveloppe volume par défaut (type pluck).
   */
  private params: Required<SimpleSynthParams> = {
    waveform: "sawtooth",
    detuneCents: 0,
    maxVoices: 16,
    envTarget: "amp",
    envDetuneDepth: 0,
    envs: [
      {
        id: "env-amp-1",
        target: "amp",
        enabled: true,
        envelope: {
          totalMs: 500,
          points: [
            { t: 0, value: 0, curve: "linear" },
            { t: 0.1, value: 1, curve: "linear" },
            { t: 0.9, value: 1, curve: "linear" },
            { t: 1, value: 0, curve: "linear" },
          ],
        },
      },
    ],
    ampEnv: {
      totalMs: 500,
      points: [
        { t: 0, value: 0, curve: "linear" },
        { t: 0.1, value: 1, curve: "linear" },
        { t: 0.9, value: 1, curve: "linear" },
        { t: 1, value: 0, curve: "linear" },
      ],
    },
  };

  /** Pool de voix pour noteOn/noteOff temps réel. */
  private voices: Voice[] = [];

  /**
   * Voices / oscillateurs créés par la lecture de clips via startClip.
   * Gardé pour, si besoin, faire des modifs live (detune, waveform, etc.).
   */
  private activeClipVoices: Set<OscillatorNode> = new Set();

  /** Mode de sortie: legacy (destination fourni à noteOn) ou track (routing via MixerCore). */
  private outputMode: "legacy" | "track" = "legacy";
  /** Id de piste si connecté via track routing. */
  private connectedTrackId: string | null = null;
  /** Somme des voix avant l'entrée piste (gain de mix interne). */
  private voiceSumGain: GainNode | null = null;

  constructor(opts?: SimpleSynthParams) {
    if (opts) this.configure(opts);
  }

  /**
   * configure(opts)
   * ---------------
   * Mise à jour des paramètres du synthé :
   *  - clamp des valeurs (detune, maxVoices, depth, etc.)
   *  - normalisation de la liste d’enveloppes (envs)
   *  - propagate detune sur les voix actives (RT-safe)
   *
   * Remarque :
   *  - waveform n’est pas changée pour les oscillateurs déjà en cours
   *    → évite les clicks (appliquée aux prochaines notes).
   */
  configure(opts: SimpleSynthParams): void {
    if (opts.waveform) this.params.waveform = opts.waveform;
    if (opts.detuneCents !== undefined) {
      this.params.detuneCents = clamp(opts.detuneCents, -2400, 2400);
    }
    if (opts.maxVoices !== undefined) {
      this.params.maxVoices = clamp(opts.maxVoices, 1, 64);
    }
    if (opts.envTarget) this.params.envTarget = opts.envTarget;
    if (opts.envDetuneDepth !== undefined) {
      this.params.envDetuneDepth = clamp(opts.envDetuneDepth, -2400, 2400);
    }

    if (opts.envs) {
      // Normalise toutes les enveloppes reçues => t dans [0..1], points triés, etc.
      this.params.envs = opts.envs.map((m, i) => ({
        id: m.id || `env-${i}`,
        target: m.target,
        enabled: m.enabled !== false,
        depthCents: m.depthCents ?? 0,
        name: m.name ?? `Env ${i + 1}`,
        group: m.group,
        macro: m.macro,
        envelope: normalizeEnvelope(m.envelope),
      }));
    }

    // Propagation live sur les osc déjà actifs (detune seulement)
    for (const v of this.voices) {
      if (v.active) {
        propagateDetune(v.osc, this.params.detuneCents);
      }
    }
    for (const osc of this.activeClipVoices) {
      propagateDetune(osc, this.params.detuneCents);
    }
  }

  /**
   * ensureContext()
   * ---------------
   * Récupère / mémorise le AudioContext global via AudioEngine.
   * Retourne null si le moteur audio n'est pas encore initialisé.
   */
  private ensureContext(): AudioContext | null {
    this.ctx = ensureAudioContext() ?? this.ctx;
    return this.ctx;
  }

  /**
   * allocateVoice(destination)
   * --------------------------
   * Alloue une voix pour une nouvelle note :
   *  1. réutilise une voix inactive
   *  2. sinon, crée une nouvelle voix si le pool n’est pas plein
   *  3. sinon, "steal" la voix la plus ancienne (startedAt le plus bas)
   *
   * La voix est rattachée à `destination` via son GainNode.
   */
  private allocateVoice(destination: AudioNode): Voice | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;

    // 1) Réutilisation d'une voix inactive
    const inactiveIdx = findInactiveVoice(this.voices);
    if (inactiveIdx >= 0) {
      return this.reinitVoice(this.voices[inactiveIdx], destination);
    }

    // 2) Création d’une nouvelle voix si on est sous maxVoices
    if (this.voices.length < this.params.maxVoices) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(destination);
      const v: Voice = {
        active: false,
        pitch: 0,
        osc: null,
        gain,
        startedAt: 0,
      };
      this.voices.push(v);
      return this.reinitVoice(v, destination);
    }

    // 3) Voice stealing : voix la plus ancienne
    const oldestIdx = findOldestVoice(this.voices);
    if (oldestIdx >= 0) {
      const v = this.voices[oldestIdx];
      const now = ctx.currentTime;
      applyVoiceRelease(v.gain, now, 0.02);
      stopOscillator(v.osc, now + 0.03);
      v.osc = null;
      perfIncrementVoiceSteal();
      return this.reinitVoice(v, destination);
    }

    return null;
  }

  /**
   * reinitVoice(v, destination)
   * ---------------------------
   * Réinitialise le routing de la voix vers la destination,
   * marque la voix comme active et met à jour startedAt.
   */
  private reinitVoice(v: Voice, destination: AudioNode): Voice {
    const ctx = this.ctx!;
    reconnectVoiceGain(v.gain, destination);
    v.active = true;
    v.startedAt = ctx.currentTime;
    return v;
  }

  /**
   * noteOn(pitch, velocity, destination, isPreview)
   * -----------------------------------------------
   * Ouvre une nouvelle note :
   *  - alloue une voix
   *  - crée un OscillatorNode
   *  - applique les enveloppes de gain / detune (GenericEnvelope)
   *  - démarre l'oscillateur
   *
   * velocity : facteur 0..1 sur le niveau de base (baseGain).
   * isPreview : si true, la note ne sera pas stoppée par stopAllVoices() (pour preview keyboard).
   */
  noteOn(pitch: number, velocity: number, destination: AudioNode, isPreview = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Choix de la destination selon mode.
    let dest = destination;
    if (this.outputMode === "track" && this.voiceSumGain) {
      dest = this.voiceSumGain;
    }
    const v = this.allocateVoice(dest);
    if (!v) return;

    v.pitch = pitch;
    v.isPreview = isPreview;

    // Reset / déconnexion éventuelle de l'ancien osc
    if (v.osc) {
      try {
        v.osc.disconnect();
      } catch {}
    }

    // Création de l’osc pour cette voix
    v.osc = ctx.createOscillator();
    v.osc.type = this.params.waveform;
    v.osc.frequency.value = midiToFreq(pitch);
    v.osc.detune.value = this.params.detuneCents;
    v.osc.connect(v.gain);

    const now = ctx.currentTime;
    const baseGain = (velocity ?? 0.8) * dbToGain(-12);

    /**
     * 1) Enveloppe amplitude (gain)
     * -----------------------------
     * Priorité:
     *  - cherche une EnvelopeMod target="amp" + enabled
     *  - sinon, fallback sur ampEnv si envTarget="amp"
     *  - sinon, simple montée vers baseGain sans enveloppe détaillée
     */
    const ampMod = (this.params.envs || []).find(
      (m) => m.enabled !== false && m.target === "amp",
    );

    if (ampMod) {
      applyEnvelopeToGain(v.gain.gain, ampMod.envelope, now, baseGain);
    } else if (this.params.ampEnv && this.params.envTarget === "amp") {
      applyEnvelopeToGain(v.gain.gain, this.params.ampEnv, now, baseGain);
    } else {
      // Pas d’enveloppe : mini fade-in pour éviter les clics
      const g = v.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(baseGain, now + 0.005);
    }

    /**
     * 2) Enveloppe detune (pitch)
     * ---------------------------
     * Même logique : on lit d’abord une EnvelopeMod target="detune",
     * puis fallback sur ampEnv si envTarget="detune".
     *
     * On remappe value (0..1) → base + depth * value (en cents).
     */
    const detuneMod = (this.params.envs || []).find(
      (m) => m.enabled !== false && m.target === "detune",
    );

    if (detuneMod) {
      const depth = detuneMod.depthCents ?? this.params.envDetuneDepth;
      applyDetuneEnvelope(v.osc, detuneMod.envelope, now, this.params.detuneCents, depth);
    } else if (this.params.ampEnv && this.params.envTarget === "detune") {
      // Fallback : utilisation de ampEnv comme enveloppe de pitch.
      applyDetuneEnvelope(v.osc, this.params.ampEnv, now, this.params.detuneCents, this.params.envDetuneDepth);
    }

    // Démarrage de l'osc pour cette voix
    v.osc.start(now);
    v.startedAt = now;
    perfSetActiveVoices(this.getActiveVoiceCount());
  }

  /**
   * noteOff(pitch)
   * --------------
   * Ferme une note (NoteOff) :
   *  - cherche la première voix active correspondant au pitch
   *  - applique un petit release fixe sur le gain pour éviter les clics
   *  - stop l’osc, puis marque la voix comme inactive
   *
   * NB : l’enveloppe générique gère déjà la descente, ce release ici
   * sert surtout de safety net au cas où on "coupe" la note avant la fin.
   */
  noteOff(pitch: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const idx = findVoiceByPitch(this.voices, pitch);
    if (idx < 0) return;

    const v = this.voices[idx];
    const now = ctx.currentTime;
    const rel = 0.05; // release court

    applyVoiceRelease(v.gain, now, rel * 0.5);
    stopOscillator(v.osc, now + rel + 0.01);

    const markOff = () => {
      v.active = false;
      v.osc = null;
    };

    scheduleVoiceCleanup(markOff, (rel + 0.02) * 1000);
    // Mise à jour approximative immédiate (cleanup final se fera après timeout)
    perfSetActiveVoices(this.getActiveVoiceCount());
  }

  /**
   * stopAllVoices()
   * ----------------
   * Coupe immédiatement toutes les voix actives de CLIP (utilisé quand on stoppe une scène/clip/transport).
   * Les voix marquées comme preview sont IGNORÉES pour permettre la preview du keyboard.
   * Applique un court release sur le gain puis stoppe l'oscillateur.
   */
  stopAllVoices(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const rel = 0.05;
    const now = ctx.currentTime;
    
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      // SKIP les voix preview pour permettre le keyboard après un stop
      if (!v.active || !v.osc || v.isPreview) continue;
      
      applyVoiceRelease(v.gain, now, rel * 0.5);
      stopOscillator(v.osc, now + rel + 0.01);
      resetVoiceGain(v.gain, now + rel + 0.02);
      
      v.active = false;
      v.osc = null;
      v.isPreview = false;
    }
    perfSetActiveVoices(this.getActiveVoiceCount());
  }

  /**
   * Active le mode track routing en connectant la somme des voix à une piste du mixeur.
   * Non destructif: conserve API existante (noteOn(destination)) mais ignore destination si mode track.
   */
  connectToTrack(trackId: string): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.outputMode = "track";
    this.connectedTrackId = trackId;
    // Créer le gain de somme si absent.
    if (!this.voiceSumGain) {
      this.voiceSumGain = ctx.createGain();
      this.voiceSumGain.gain.value = 1;
    }
    // Assurer la piste et obtenir son input.
    const mix = MixerCore.ensure();
    mix.ensureTrack(trackId);
    const input = mix.getTrackInput(trackId);
    if (input) {
      try { this.voiceSumGain.disconnect(); } catch {}
      this.voiceSumGain.connect(input);
    }
  }

  /**
   * Désactive le mode track routing (les futures noteOn devront fournir un destination explicite).
   */
  /** Implémentation InstrumentOutput.disconnect */
  disconnect(): void {
    if (this.voiceSumGain) {
      try { this.voiceSumGain.disconnect(); } catch {}
    }
    this.outputMode = "legacy";
    this.connectedTrackId = null;
  }

  /** Ancienne API conservée pour compatibilité interne. */
  disconnectTrack(): void { this.disconnect(); }

  /** Nombre de voix actuellement actives (instrumentation basique). */
  getActiveVoiceCount(): number {
    let c = 0;
    for (const v of this.voices) if (v.active) c++;
    return c;
  }

  /** Identifiant de piste si connecté (sinon null). */
  get trackId(): string | null {
    return this.connectedTrackId;
  }

  /** Accès à l'Analyser mono de la piste (null si pas routé). */
  getAnalyserNode(): AnalyserNode | null {
    if (!this.connectedTrackId) return null;
    return getTrackAnalyser(this.connectedTrackId);
  }

  /** Accès aux analyseurs stéréo de la piste (null si pas routé ou hors config). */
  getStereoAnalysers(opts?: { channelCount?: number; fftSize?: number }): { left: AnalyserNode; right: AnalyserNode } | null {
    if (!this.connectedTrackId) return null;
    return getTrackStereoAnalysers(this.connectedTrackId, opts) ?? null;
  }

  /** Libération des ressources (voix, gains internes). */
  dispose(): void {
    // Stop toutes les voix et déconnecte voiceSumGain.
    try { this.stopAllVoices(); } catch {}
    if (this.voiceSumGain) {
      try { this.voiceSumGain.disconnect(); } catch {}
      this.voiceSumGain = null;
    }
    this.connectedTrackId = null;
    this.outputMode = "legacy";
  }
}
