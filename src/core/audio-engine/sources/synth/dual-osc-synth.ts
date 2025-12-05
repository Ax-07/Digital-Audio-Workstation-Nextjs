// src/lib/audio/sources/dual-osc-synth.ts

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
  propagateDetune,
  propagateGain,
  calculateCrossfadeGains,
  applyDetuneEnvelope,
} from "./synth-utils";
import type { GenericEnvelope } from "@/core/audio-engine/envelopes/generic-envelope";
import {
  normalizeEnvelope,
  getEnvelopeTotalSec,
} from "@/core/audio-engine/envelopes/generic-envelope";
import { applyEnvelopeToGain } from "@/core/audio-engine/envelopes/apply-generic-envelope";
import { EnvelopeMod } from "../../types";
import { dbToGain } from "../../core/audio-engine";

/* -------------------------------------------------------------------------- */
/*  Paramètres & types d'enveloppes                                           */
/* -------------------------------------------------------------------------- */

/**
 * EnvelopeMod
 * -----------
 * Une modulation pilotée par enveloppe, appliquée à un paramètre de la voix.
 *
 * - target:
 *    - "amp"      : amplitude globale (GainNode de la voix)
 *    - "detuneA"  : Osc A detune (en cents)
 *    - "detuneB"  : Osc B detune (en cents)
 *    - "detune"   : alias legacy pour "detuneB" (compat)
 *    - "mix"      : crossfade A/B (0..1) modulé dans le temps
 *
 * - envelope   : GenericEnvelope normalisée (t 0..1, totalMs, courbes, etc.)
 * - name/group/macro : infos pour l'UI et un futur système de macros
 */

/**
 * DualSynthParams
 * ---------------
 * Paramètres de haut niveau du DualOscSynth :
 *
 * - waveformA/B    : formes d’ondes (OscillatorType) pour les 2 oscillateurs
 * - mix            : crossfade A/B (0 = A seul, 1 = B seul, trig-law en interne)
 * - detuneCents    : offset global appliqué sur Osc B (spread/chorus)
 * - maxVoices      : taille du pool de voix
 *
 * - ampEnv         : enveloppe générique de base (fallback) pour amp/detune
 * - envTarget      : interprétation de ampEnv → "amp" ou "detune"
 * - envDetuneDepth : profondeur en cents si envTarget="detune"
 *
 * - envs           : liste avancée de EnvelopeMod (amp / detuneA / detuneB / mix)
 *                    Si définie, prend le dessus sur ampEnv/envTarget.
 */
export type DualSynthParams = {
  waveformA?: OscillatorType;
  waveformB?: OscillatorType;
  mix?: number; // 0..1, 0 = A uniquement, 1 = B uniquement
  detuneCents?: number; // appliqué sur B pour élargir / détuner
  maxVoices?: number;
  ampEnv?: GenericEnvelope;
  envTarget?: "amp" | "detune";
  envDetuneDepth?: number; // profondeur en cents si target=detune
  envs?: EnvelopeMod[]; // liste de modulations multiples (prioritaire sur ampEnv/envTarget)
};

/**
 * Voice
 * -----
 * Représentation interne d’une voix polyphonique.
 *
 * - oscA / oscB : OscillatorNode pour les deux oscillateurs
 * - mixGainA/B  : GainNode de mix individuel avant le gain global
 * - gain        : GainNode global de la voix (amplitude)
 * - pitch       : note MIDI associée
 * - startedAt   : ctx.currentTime au moment du lancement (pour voice stealing)
 * - active      : drapeau de vie de la voix
 */
type Voice = {
  active: boolean;
  pitch: number;
  oscA: OscillatorNode | null;
  oscB: OscillatorNode | null;
  mixGainA: GainNode;
  mixGainB: GainNode;
  gain: GainNode;
  startedAt: number;
  isPreview?: boolean;
};

/* -------------------------------------------------------------------------- */
/*  DualOscSynth                                                              */
/* -------------------------------------------------------------------------- */

/**
 * DualOscSynth
 * ------------
 * Synthé polyphonique à deux oscillateurs par voix :
 *
 * - Osc A + Osc B, chacun avec sa forme d’onde (waveformA / waveformB)
 * - Mix crossfade A/B (mix 0..1) avec loi trigonométrique (cos/sin)
 * - Détune global sur B (detuneCents) + jitter léger par voix
 * - Enveloppes génériques pour :
 *    • amplitude globale (amp)
 *    • detuneA / detuneB (pitch mod des oscillateurs)
 *    • mix (crossfade dynamique dans le temps)
 * - Polyphonie bornée par maxVoices + voice stealing (vol de voix la plus ancienne)
 *
 * Intégration :
 * - Utilise AudioEngine pour l’AudioContext global.
 * - Destination configurée par l’appel à noteOn() (ex: piste du Mixer).
 */
export class DualOscSynth {
  /** Contexte audio partagé (provenant de AudioEngine) */
  private ctx: AudioContext | null = null;

  /**
   * Paramètres internes, toujours “complets” (Required<>) avec valeurs par défaut.
   * On fournit une enveloppe d’amplitude par défaut (type pluck).
   */
  private params: Required<DualSynthParams> = {
    waveformA: "sawtooth",
    waveformB: "square",
    mix: 0.5,
    detuneCents: 0,
    maxVoices: 16,
    envTarget: "amp",
    envDetuneDepth: 0,
    envs: [
      {
        id: "env-amp-1",
        target: "amp",
        enabled: true,
        name: "Amp",
        envelope: {
          totalMs: 500,
          points: [
            { t: 0, value: 0, curve: "linear" },
            { t: 0.08, value: 1, curve: "exp" },
            { t: 0.9, value: 0.7, curve: "linear" },
            { t: 1, value: 0, curve: "log" },
          ],
        },
      },
    ],
    ampEnv: {
      totalMs: 500,
      points: [
        { t: 0, value: 0, curve: "linear" },
        { t: 0.08, value: 1, curve: "exp" },
        { t: 0.9, value: 0.7, curve: "linear" },
        { t: 1, value: 0, curve: "log" },
      ],
    },
  };

  /** Pool de voix polyphoniques (allocation paresseuse, recyclage après coup). */
  private voices: Voice[] = [];

  /* ---------------------------- Utilitaires internes ---------------------------- */

  /**
   * killVoice(v, now, tau)
   * ----------------------
   * Applique un petit release et stoppe les oscillateurs de la voix.
   * Utilisé pour le voice stealing et les nettoyages forcés.
   */
  private killVoice(v: Voice, now: number, tau = 0.02): void {
    applyVoiceRelease(v.gain, now, tau);
    stopOscillator(v.oscA, now + tau + 0.01);
    stopOscillator(v.oscB, now + tau + 0.01);
    v.oscA = null;
    v.oscB = null;
    v.active = false;
  }

  constructor(opts?: DualSynthParams) {
    if (opts) this.configure(opts);
  }

  /* -------------------------------------------------------------------------- */
  /*  Configuration                                                             */
  /* -------------------------------------------------------------------------- */

  /**
   * configure(opts)
   * ---------------
   * Met à jour les paramètres du synthé sans recréer les voix existantes.
   *
   * - clamp des valeurs (mix, detune, maxVoices, depth, etc.)
   * - normalisation des enveloppes (envs) via normalizeEnvelope
   * - propagation live :
   *    • detuneCents → oscB.detune sur les voix actives
   *    • mix         → mixGainA/mixGainB sur les voix actives
   *
   * Les waveforms A/B ne sont PAS modifiées pour les notes déjà en cours
   * (on évite ainsi les clicks — appliquées aux prochaines noteOn).
   */
  configure(opts: DualSynthParams): void {
    if (opts.waveformA) this.params.waveformA = opts.waveformA;
    if (opts.waveformB) this.params.waveformB = opts.waveformB;

    if (opts.mix !== undefined) {
      this.params.mix = clamp(opts.mix, 0, 1);
    }
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
    if (opts.ampEnv) this.params.ampEnv = opts.ampEnv;

    if (opts.envs) {
      this.params.envs = opts.envs.map((m, i) => ({
        id: m.id || `env-${i}`,
        // compat: "detune" => "detuneB"
        target: (m.target === "detune"
          ? "detuneB"
          : m.target) as EnvelopeMod["target"],
        enabled: m.enabled !== false,
        depthCents: m.depthCents ?? 0,
        depthMix: m.depthMix ?? 0,
        name: m.name ?? `Env ${i + 1}`,
        group: m.group,
        macro: m.macro,
        envelope: normalizeEnvelope(m.envelope),
      }));
    }

    // Propagation live sûre: detune B + mix crossfade
    const mix = this.params.mix;
    const [gainA, gainB] = calculateCrossfadeGains(mix);

    for (const v of this.voices) {
      if (v.active) {
        propagateDetune(v.oscB, this.params.detuneCents);
        propagateGain(v.mixGainA, gainA);
        propagateGain(v.mixGainB, gainB);
      }
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

  /* -------------------------------------------------------------------------- */
  /*  Gestion de voix (pool + voice stealing)                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * allocateVoice(destination)
   * --------------------------
   * Alloue une voix pour une nouvelle note :
   *  1. réutilise une voix inactive si dispo
   *  2. sinon, crée une nouvelle voix si le pool n’est pas plein
   *  3. sinon, applique du voice stealing sur la voix la plus ancienne active
   *
   * La voix est reliée à `destination` via son gain global.
   */
  private allocateVoice(destination: AudioNode): Voice | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;

    // 1) Réutiliser une voix inactive si possible
    const inactiveIdx = findInactiveVoice(this.voices);
    if (inactiveIdx >= 0) {
      return this.reinitVoice(this.voices[inactiveIdx], destination);
    }

    // 2) Si on a encore de la marge → créer une nouvelle voix
    if (this.voices.length < this.params.maxVoices) {
      const mixA = ctx.createGain();
      const mixB = ctx.createGain();
      const gain = ctx.createGain();
      mixA.connect(gain);
      mixB.connect(gain);
      gain.connect(destination);

      const v: Voice = {
        active: false,
        pitch: 0,
        oscA: null,
        oscB: null,
        mixGainA: mixA,
        mixGainB: mixB,
        gain,
        startedAt: 0,
      };

      this.voices.push(v);
      return this.reinitVoice(v, destination);
    }

    // 3) Voice stealing : voix active la plus ancienne
    const oldestIdx = findOldestVoice(this.voices);
    if (oldestIdx >= 0) {
      const v = this.voices[oldestIdx];
      this.killVoice(v, this.ctx!.currentTime, 0.02);
      return this.reinitVoice(v, destination);
    }

    return null;
  }

  /**
   * reinitVoice(v, destination)
   * ---------------------------
   * Réinitialise une voix pour une nouvelle note :
   *  - reconnecte le GainNode global vers destination
   *  - met active=true et startedAt=ctx.currentTime
   */
  private reinitVoice(v: Voice, destination: AudioNode): Voice {
    const ctx = this.ctx!;
    reconnectVoiceGain(v.gain, destination);
    v.active = true;
    v.startedAt = ctx.currentTime;
    return v;
  }

  /* -------------------------------------------------------------------------- */
  /*  Note On / Note Off                                                       */
  /* -------------------------------------------------------------------------- */

  /**
   * noteOn(pitch, velocity, destination, isPreview)
   * -----------------------------------------------
   * Joue une nouvelle note :
   *  - alloue une voix
   *  - crée OscA / OscB avec waveforms configurées
   *  - applique detuneCents global sur B + jitter léger par voix
   *  - configure le mix A/B (crossfade trig)
   *  - applique les enveloppes (amp, detuneA, detuneB, mix)
   *
   * velocity : facteur 0..1 pour l'amplitude de base.
   * isPreview : si true, la note ne sera pas stoppée par stopAllVoices() (pour preview keyboard).
   */
  noteOn(pitch: number, velocity: number, destination: AudioNode, isPreview = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const v = this.allocateVoice(destination);
    if (!v) return;

    v.pitch = pitch;
    v.isPreview = isPreview;

    // On recrée systématiquement les oscillateurs pour un départ propre
    try {
      v.oscA?.disconnect();
      v.oscB?.disconnect();
    } catch {}

    v.oscA = ctx.createOscillator();
    v.oscB = ctx.createOscillator();
    v.oscA.type = this.params.waveformA;
    v.oscB.type = this.params.waveformB;

    // Même fréquence de base, avec detune éventuel sur B
    v.oscA.frequency.value = midiToFreq(pitch);
    v.oscB.frequency.value = midiToFreq(pitch);

    v.oscA.connect(v.mixGainA);
    v.oscB.connect(v.mixGainB);

    // Légère variation par voix pour donner de la vie (±5 cents)
    const jitter = (Math.random() - 0.5) * 5;
    v.oscB.detune.value = this.params.detuneCents + jitter;

    // Mix A/B (loi trigonométrique)
    const mix = this.params.mix;
    v.mixGainA.gain.value = Math.cos(mix * Math.PI * 0.5);
    v.mixGainB.gain.value = Math.sin(mix * Math.PI * 0.5);

    const now = ctx.currentTime;
    const vel = Math.max(0.05, velocity ?? 0.8);
    const baseGain = vel * dbToGain(-12);

    /* ---------------------------------------------------------------------- */
    /*  1) Enveloppe amplitude (amp)                                          */
    /* ---------------------------------------------------------------------- */

    const ampMod = (this.params.envs || []).find(
      (m) => m.enabled !== false && m.target === "amp",
    );

    if (ampMod) {
      applyEnvelopeToGain(v.gain.gain, ampMod.envelope, now, baseGain);
    } else if (this.params.ampEnv && this.params.envTarget === "amp") {
      applyEnvelopeToGain(v.gain.gain, this.params.ampEnv, now, baseGain);
    } else {
      // Pas d'enveloppe amp: niveau constant rapidement pour éviter les clics
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(0, now);
      v.gain.gain.linearRampToValueAtTime(baseGain, now + 0.005);
    }

    /* ---------------------------------------------------------------------- */
    /*  2) Enveloppe detuneA (oscA)                                           */
    /* ---------------------------------------------------------------------- */

    const detuneAMod = (this.params.envs || []).find(
      (m) => m.enabled !== false && m.target === "detuneA",
    );

    if (detuneAMod) {
      const depth = detuneAMod.depthCents ?? 0;
      applyDetuneEnvelope(v.oscA, detuneAMod.envelope, now, 0, depth);
    }

    /* ---------------------------------------------------------------------- */
    /*  3) Enveloppe detuneB (oscB)                                           */
    /*     (inclut alias legacy "detune")                                     */
    /* ---------------------------------------------------------------------- */

    const detuneMod = (this.params.envs || []).find(
      (m) =>
        m.enabled !== false &&
        (m.target === "detuneB" || m.target === "detune"),
    );

    if (detuneMod) {
      const base = this.params.detuneCents + jitter;
      const depth = detuneMod.depthCents ?? this.params.envDetuneDepth;
      applyDetuneEnvelope(v.oscB, detuneMod.envelope, now, base, depth);
    } else if (this.params.ampEnv && this.params.envTarget === "detune") {
      // Fallback: utilisation de ampEnv comme enveloppe detune sur B.
      const base = this.params.detuneCents + jitter;
      applyDetuneEnvelope(v.oscB, this.params.ampEnv, now, base, this.params.envDetuneDepth);
    }

    /* ---------------------------------------------------------------------- */
    /*  4) Enveloppe de mix A/B                                               */
    /* ---------------------------------------------------------------------- */

    const mixMod = (this.params.envs || []).find(
      (m) => m.enabled !== false && m.target === "mix",
    );

    if (mixMod) {
      const env = mixMod.envelope;
      const totalSec = getEnvelopeTotalSec(env);
      const pts = env.points.length
        ? env.points
        : [
            { t: 0, value: 0 },
            { t: 1, value: 0 },
          ];

      const baseMix = this.params.mix;
      const depth = Math.max(-1, Math.min(1, mixMod.depthMix ?? 0));

      const mix0 = Math.max(0, Math.min(1, baseMix + depth * pts[0]!.value));
      const ga0 = Math.cos(mix0 * Math.PI * 0.5);
      const gb0 = Math.sin(mix0 * Math.PI * 0.5);

      try {
        v.mixGainA.gain.cancelScheduledValues(now);
      } catch {}
      try {
        v.mixGainB.gain.cancelScheduledValues(now);
      } catch {}

      v.mixGainA.gain.setValueAtTime(ga0, now);
      v.mixGainB.gain.setValueAtTime(gb0, now);

      for (let i = 0; i < pts.length - 1; i++) {
        const aPt = pts[i]!;
        const bPt = pts[i + 1]!;
        const tA = now + Math.max(0, aPt.t) * totalSec;
        const tB = now + Math.max(0, bPt.t) * totalSec;

        const mixA = Math.max(0, Math.min(1, baseMix + depth * aPt.value));
        const mixB = Math.max(0, Math.min(1, baseMix + depth * bPt.value));
        const gaA = Math.cos(mixA * Math.PI * 0.5);
        const gbA = Math.sin(mixA * Math.PI * 0.5);
        const gaB = Math.cos(mixB * Math.PI * 0.5);
        const gbB = Math.sin(mixB * Math.PI * 0.5);

        const endT = Math.max(tA + 1e-4, tB);

        v.mixGainA.gain.setValueAtTime(gaA, tA);
        v.mixGainA.gain.linearRampToValueAtTime(gaB, endT);
        v.mixGainB.gain.setValueAtTime(gbA, tA);
        v.mixGainB.gain.linearRampToValueAtTime(gbB, endT);
      }
    }

    // Démarrage des oscillateurs
    v.oscA.start(now);
    v.oscB.start(now);
    v.startedAt = now;
  }

  /**
   * noteOff(pitch)
   * --------------
   * Relâche une note :
   *  - trouve la première voix active associée à ce pitch
   *  - applique un release court sur le gain global
   *  - stoppe A/B puis marque la voix comme inactive
   *
   * NB : Les enveloppes génériques gèrent déjà l’amplitude ; ici on
   * assure juste un fade-out minimum si la note est coupée en plein milieu.
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
        v.oscA?.stop(now + rel + 0.01);
        v.oscB?.stop(now + rel + 0.01);
      } catch {}

      const markOff = () => {
        v.active = false;
        v.oscA = null;
        v.oscB = null;
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
   * Couper immédiatement toutes les voix actives de CLIP avec un court release.
   * Les voix marquées comme preview sont IGNORÉES pour permettre la preview du keyboard.
   */
  stopAllVoices(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const tau = 0.03; // release court
    const now = ctx.currentTime;
    
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      // SKIP les voix preview pour permettre le keyboard après un stop
      if (!v.active || v.isPreview) continue;
      
      applyVoiceRelease(v.gain, now, tau);
      stopOscillator(v.oscA, now + tau + 0.01);
      stopOscillator(v.oscB, now + tau + 0.01);
      resetVoiceGain(v.gain, now + tau + 0.02);
      
      v.active = false;
      v.oscA = null;
      v.oscB = null;
      v.isPreview = false;
    }
  }

  // Pas de startClip ici : la lecture des clips est gérée au niveau de MidiTrack
  // via noteOn/noteOff (TransportScheduler, quantization, etc.).
}
