// src/lib/audio/sources/simple-synth.ts

/* SimpleSynth (v2 - Generic Envelope)
  - Synthé mono-oscillateur polyphonique pour clips MIDI.
  - Gestion de voix (voice pool) + vol de voix (voice stealing).
  - Enveloppes génériques (GenericEnvelope) pour :
      • amplitude (gain)
      • detune (pitch mod en cents)
  - Lecture de clip sync via TransportScheduler (quantized scheduling).
*/

import { AudioEngine, dbToGain } from "@/lib/audio/core/audio-engine";
import {
  GenericEnvelope,
  normalizeEnvelope,
} from "../envelopes/generic-envelope";
import { applyEnvelopeToGain } from "../envelopes/apply-generic-envelope";
import type { EnvelopeMod } from "@/lib/audio/types";

/**
 * Conversion pitch MIDI → fréquence Hz.
 * Référence : 69 = A4 = 440 Hz.
 */
function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

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
 * Représente une voix polyphonique active ou réutilisable.
 *
 * - active    : la voix est en cours d'utilisation
 * - pitch     : note MIDI associée à la voix
 * - osc       : OscillatorNode pour cette voix (WebAudio = one-shot)
 * - gain      : GainNode global pour l'enveloppe
 * - startedAt : timestamp (ctx.currentTime) pour le voice stealing
 * - isPreview : true si c'est une note de preview (non affectée par stopAllVoices)
 */
type Voice = {
  active: boolean;
  pitch: number;
  osc: OscillatorNode | null;
  gain: GainNode;
  startedAt: number;
  isPreview?: boolean;
};

export class SimpleSynth {
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
      this.params.detuneCents = Math.max(-2400, Math.min(2400, opts.detuneCents));
    }
    if (opts.maxVoices !== undefined) {
      this.params.maxVoices = Math.max(1, Math.min(64, opts.maxVoices));
    }
    if (opts.envTarget) this.params.envTarget = opts.envTarget;
    if (opts.envDetuneDepth !== undefined) {
      this.params.envDetuneDepth = Math.max(-2400, Math.min(2400, opts.envDetuneDepth));
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
    try {
      for (const v of this.voices) {
        if (v.active && v.osc) {
          v.osc.detune.value = this.params.detuneCents;
        }
      }
      for (const osc of this.activeClipVoices) {
        osc.detune.value = this.params.detuneCents;
      }
    } catch {
      // En cas d’erreur (ex: osc déjà stoppé), on ignore silencieusement.
    }
  }

  /**
   * ensureContext()
   * ---------------
   * Récupère / mémorise le AudioContext global via AudioEngine.
   * Retourne null si le moteur audio n’est pas encore initialisé.
   */
  private ensureContext(): AudioContext | null {
    const e = AudioEngine.ensure();
    this.ctx = e.context ?? this.ctx;
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

    // 1) Réutilisation d’une voix inactive
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (!v.active) return this.reinitVoice(v, destination);
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

    // 3) Voice stealing : choix de la voix active la plus "vieille"
    let oldestIndex = -1;
    let oldestTime = Number.MAX_VALUE;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (!v.active) {
        oldestIndex = i;
        break;
      }
      if (v.startedAt < oldestTime) {
        oldestTime = v.startedAt;
        oldestIndex = i;
      }
    }

    if (oldestIndex >= 0) {
      const v = this.voices[oldestIndex];
      // Mini-release pour éviter un clic dur
      try {
        v.gain.gain.cancelScheduledValues(ctx.currentTime);
        v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      } catch {}
      try {
        v.osc?.stop(ctx.currentTime + 0.03);
      } catch {}
      v.osc = null;
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
    try {
      v.gain.disconnect();
    } catch {}
    v.gain.connect(destination);
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
    const v = this.allocateVoice(destination);
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

    if (detuneMod && v.osc) {
      const env = detuneMod.envelope;
      const totalSec = Math.max(0.001, env.totalMs / 1000);
      const pts = env.points.length
        ? env.points
        : [
            { t: 0, value: 0 },
            { t: 1, value: 0 },
          ];

      const base = this.params.detuneCents;
      const depth = detuneMod.depthCents ?? this.params.envDetuneDepth;
      const v0 = base + depth * pts[0]!.value;

      try {
        v.osc.detune.cancelScheduledValues(now);
      } catch {}
      v.osc.detune.setValueAtTime(v0, now);

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const tA = now + Math.max(0, a.t) * totalSec;
        const tB = now + Math.max(0, b.t) * totalSec;
        const valA = base + depth * a.value;
        const valB = base + depth * b.value;
        const endT = Math.max(tA + 1e-4, tB);
        v.osc.detune.setValueAtTime(valA, tA);
        v.osc.detune.linearRampToValueAtTime(valB, endT);
      }
    } else if (this.params.ampEnv && this.params.envTarget === "detune" && v.osc) {
      // Fallback : utilisation de ampEnv comme enveloppe de pitch.
      const env = this.params.ampEnv;
      const totalSec = Math.max(0.001, env.totalMs / 1000);
      const pts = env.points.length
        ? env.points
        : [
            { t: 0, value: 0 },
            { t: 1, value: 0 },
          ];

      const base = this.params.detuneCents;
      const depth = this.params.envDetuneDepth;
      const v0 = base + depth * pts[0]!.value;

      try {
        v.osc.detune.cancelScheduledValues(now);
      } catch {}
      v.osc.detune.setValueAtTime(v0, now);

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const tA = now + Math.max(0, a.t) * totalSec;
        const tB = now + Math.max(0, b.t) * totalSec;
        const valA = base + depth * a.value;
        const valB = base + depth * b.value;
        const endT = Math.max(tA + 1e-4, tB);
        v.osc.detune.setValueAtTime(valA, tA);
        v.osc.detune.linearRampToValueAtTime(valB, endT);
      }
    }

    // Démarrage de l'osc pour cette voix
    v.osc.start(now);
    v.startedAt = now;
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

    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (!v.active || v.pitch !== pitch) continue;

      const now = ctx.currentTime;
      const rel = 0.05; // release court

      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, rel * 0.5);
        v.osc?.stop(now + rel + 0.01);
      } catch {}

      const markOff = () => {
        v.active = false;
        v.osc = null;
      };

      if (typeof window !== "undefined") {
        window.setTimeout(markOff, Math.round((rel + 0.02) * 1000));
      } else {
        markOff();
      }
      break;
    }
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
      
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, rel * 0.5);
        v.osc.stop(now + rel + 0.01);
      } catch {}
      
      // Réinitialise le gain pour permettre la réutilisation
      try {
        v.gain.gain.setValueAtTime(0, now + rel + 0.02);
      } catch {}
      
      v.active = false;
      v.osc = null;
      v.isPreview = false;
    }
  }
}
