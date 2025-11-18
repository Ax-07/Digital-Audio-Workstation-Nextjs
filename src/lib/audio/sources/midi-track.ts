// src/lib/audio/sources/midi-track.ts

/**
 * MidiTrack
 * =========
 * Représente une piste MIDI dans ton DAW.
 *
 * Rôle :
 *   - Router l'audio vers le MixerCore
 *   - Héberger un instrument : SimpleSynth, DualOscSynth ou Sampler
 *   - Fournir noteOn / noteOff
 *   - Planifier la lecture d'un clip MIDI (scheduleClip)
 *
 * Architecture :
 *   + MidiTrack
 *       - SimpleSynth | DualOscSynth | Sampler
 *       - routing vers MixerCore
 *       - scheduling via TransportScheduler ou setTimeout (sampler)
 *
 * ⚠️ Une piste ne contient qu’un seul instrument actif à la fois.
 */

import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { MixerCore } from "@/lib/audio/core/mixer";
import type { MidiNote } from "@/lib/audio/types";
import {
  SimpleSynth,
  type SimpleSynthParams,
} from "@/lib/audio/sources/simple-synth";
import {
  DualOscSynth,
  type DualSynthParams,
} from "@/lib/audio/sources/dual-osc-synth";
import { Sampler } from "@/lib/audio/sources/sampler";
import { TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import type { InstrumentKind } from "@/lib/audio/types";

export class MidiTrack {
  readonly id: string;

  /** Node audio vers lequel la piste se route (track → mixer). */
  private destination: AudioNode | null = null;

  /** Instrument actuellement actif. */
  private kind: InstrumentKind = "simple-synth";

  /** Instances des instruments (seul un est actif à la fois). */
  private synth: SimpleSynth | null = null;
  private dual: DualOscSynth | null = null;
  private sampler: Sampler | null = null;

  /**
   * stop() d’un clip en cours (startClip ou scheduleClip)
   * Permet au DAW d’arrêter une piste proprement.
   */
  private activeStop: (() => void) | null = null;

  /**
   * Constructeur
   * ------------
   * trackId → identifiant unique de la piste dans le DAW.
   * opts → instrument par défaut + params éventuels.
   */
  constructor(
    trackId: string,
    opts?: {
      instrument?: MidiInstrumentKind;
      synthParams?: SimpleSynthParams | DualSynthParams;
      sampler?: Sampler;
    },
  ) {
    this.id = trackId;

    // Crée le routing vers MixerCore si nécessaire.
    this.ensureRouting();

    // Instrument choisi ?
    if (opts?.instrument) this.kind = opts.instrument;

    // Instancie l’instrument demandé.
    if (this.kind === "simple-synth") {
      this.synth = new SimpleSynth(opts?.synthParams as SimpleSynthParams);
      this.dual = null;
      this.sampler = null;
    } else if (this.kind === "dual-synth") {
      this.dual = new DualOscSynth((opts?.synthParams ?? {}) as DualSynthParams);
      this.synth = null;
      this.sampler = null;
    } else if (this.kind === "sampler") {
      this.sampler = opts?.sampler ?? null;
      this.synth = null;
      this.dual = null;
    }
  }

  /**
   * cancelPending()
   * ---------------
   * Annule uniquement la planification des événements restants (unsubscribe),
   * sans couper les voix actuellement en train de jouer.
   * Utile lors d’une réécriture du reste du cycle courant.
   */
  cancelPending(): void {
    try {
      this.activeStop?.();
    } catch {}
    this.activeStop = null;
  }

  /**
   * ensureRouting()
   * ---------------
   * S’assure que la piste possède bien un input audio dans le Mixer.
   * Appelé dans le constructeur et dans noteOn().
   */
  private ensureRouting(): void {
    const mix = MixerCore.ensure();
    mix.ensureTrack(this.id);
    this.destination = mix.getTrackInput(this.id);
  }

  /**
   * setInstrument()
   * ---------------
   * Change l’instrument de la piste dynamiquement.
   * L’ancien instrument est abandonné, le nouveau est instancié.
   */
  setInstrument(
    kind: MidiInstrumentKind,
    opts?: { synthParams?: SimpleSynthParams; sampler?: Sampler },
  ): void {
    this.kind = kind;

    if (kind === "simple-synth") {
      this.synth = new SimpleSynth(opts?.synthParams);
      this.sampler = null;
      this.dual = null;
    } else if (kind === "dual-synth") {
      this.dual = new DualOscSynth((opts?.synthParams ?? {}) as DualSynthParams);
      this.synth = null;
      this.sampler = null;
    } else {
      this.sampler = opts?.sampler ?? null;
      this.synth = null;
      this.dual = null;
    }
  }

  /**
   * configureSynth()
   * ----------------
   * Applique en direct des paramètres d’un SimpleSynth existant.
   * Utilisé par les panneaux React.
   */
  configureSynth(params: SimpleSynthParams): void {
    if (this.kind === "simple-synth") {
      if (!this.synth) this.synth = new SimpleSynth(params);
      else this.synth.configure(params);
    }
  }

  /**
   * configureDual()
   * ---------------
   * Même principe mais pour DualOscSynth.
   */
  configureDual(params: DualSynthParams): void {
    if (this.kind === "dual-synth") {
      if (!this.dual) this.dual = new DualOscSynth(params);
      else this.dual.configure(params);
    }
  }

  /**
   * noteOn()
   * --------
   * Appelé par l’éditeur piano-roll, les pads MIDI, etc.
   * La piste appelle simplement l’instrument actif.
   */
  noteOn(pitch: number, velocity = 0.8): void {
    this.ensureRouting();
    const dest = this.destination;
    if (!dest) return;

    if (this.kind === "simple-synth") {
      if (!this.synth) this.synth = new SimpleSynth();
      this.synth.noteOn(pitch, velocity, dest);
    } else if (this.kind === "dual-synth") {
      if (!this.dual) this.dual = new DualOscSynth();
      this.dual.noteOn(pitch, velocity, dest);
    } else if (this.kind === "sampler") {
      this.sampler?.trigger(pitch, velocity, dest);
    }
  }

  /** noteOff — idem, délégué à l’instrument. */
  noteOff(pitch: number): void {
    if (this.kind === "simple-synth") this.synth?.noteOff(pitch);
    else if (this.kind === "dual-synth") this.dual?.noteOff(pitch);
  }

  /**
   * scheduleClip()
   * --------------
   * Planifie la lecture d’un clip MIDI.
   *
   * 3 cas :
   *   - SimpleSynth → utilise sa méthode startClip()
   *   - DualSynth   → scheduling manuel via TransportScheduler
   *   - Sampler     → scheduling via setTimeout()
   *
   * Retourne { stop } pour annuler proprement la lecture.
   */
  scheduleClip(
    clip: {
      notes: ReadonlyArray<MidiNote>;
      lengthBeats?: number;
      loop?: boolean;
      loopStart?: number;
      loopEnd?: number;
      startOffset?: number;
    },
    when: number,
    bpm: number,
  ): { stop: () => void } {
    this.ensureRouting();

    /* ---------------- DualSynth : scheduling manuel haute précision ---------------- */

    if (this.kind === "dual-synth") {
      if (!this.dual) this.dual = new DualOscSynth();

      const ctx = AudioEngine.ensure().context;
      const dest = this.destination;
      if (!ctx || !dest) return { stop: () => { } };

      const secPerBeat = 60 / bpm;

      // On transforme la liste des notes en événements on/off triés par temps.
      const events = clip.notes.flatMap((n) => [
        { type: "on" as const, time: when + n.time * secPerBeat, pitch: n.pitch, velocity: n.velocity ?? 0.8 },
        { type: "off" as const, time: when + (n.time + n.duration) * secPerBeat, pitch: n.pitch },
      ]);
      events.sort((a, b) => a.time - b.time);

      // Streaming via TransportScheduler
      const sched = TransportScheduler.ensure();
      const lookahead = Math.min(0.05, secPerBeat / 4);
      let idx = 0;

      const unsub = sched.subscribe(() => {
        const now = ctx.currentTime;
        while (idx < events.length && events[idx]!.time <= now + lookahead) {
          const ev = events[idx]!;
          try {
            if (ev.type === "on") this.dual!.noteOn(ev.pitch, ev.velocity, dest);
            else this.dual!.noteOff(ev.pitch);
          } catch { }
          idx++;
        }
        if (idx >= events.length) {
          try {
            unsub();
          } catch { }
        }
      });

      const stop = () => {
        try {
          unsub();
        } catch { }
      };
      this.activeStop = stop;
      return { stop };
    }

    /* ---------------- Sampler : scheduling simple via setTimeout ---------------- */

    if (this.kind === "sampler") {
      const ctx = AudioEngine.ensure().context;
      const dest = this.destination;
      if (!ctx || !dest) return { stop: () => { } };

      const secPerBeat = 60 / bpm;
      const timers: number[] = [];

      for (const n of clip.notes) {
        const delayMs = Math.max(
          0,
          Math.round(
            (when + n.time * secPerBeat - ctx.currentTime) * 1000,
          ),
        );
        const h = window.setTimeout(() => {
          try {
            this.sampler?.trigger(n.pitch, n.velocity ?? 0.8, dest);
          } catch { }
        }, delayMs);
        timers.push(h);
      }

      const stop = () => {
        for (const id of timers) {
          try {
            window.clearTimeout(id);
          } catch { }
        }
      };
      this.activeStop = stop;
      return { stop };
    }

    /* ---------------- SimpleSynth : Scheduling via TransportScheduler ---------------- */

    if (this.kind === "simple-synth") {
      if (!this.synth) this.synth = new SimpleSynth();
      const ctx = AudioEngine.ensure().context;
      const dest = this.destination;
      if (!ctx || !dest) return { stop: () => { } };

      const secPerBeat = 60 / bpm;
      const events = clip.notes.flatMap(n => ([
        { type: "on" as const, time: when + n.time * secPerBeat, pitch: n.pitch, velocity: n.velocity ?? 0.8 },
        { type: "off" as const, time: when + (n.time + n.duration) * secPerBeat, pitch: n.pitch, velocity: 0 },
      ]));

      events.sort((a, b) => a.time - b.time);

      let idx = 0;
      const sched = TransportScheduler.ensure();
      const lookahead = Math.min(0.05, (60 / bpm) / 4);

      const unsub = sched.subscribe(() => {
        const now = ctx.currentTime;
        while (idx < events.length && events[idx]!.time <= now + lookahead) {
          const ev = events[idx]!;
          try {
            if (ev.type === "on") this.synth!.noteOn(ev.pitch, ev.velocity, dest);
            else this.synth!.noteOff(ev.pitch);
          } catch { }
          idx++;
        }
        if (idx >= events.length) { try { unsub(); } catch { } }
      });

      const stop = () => { try { unsub(); } catch { } };
      this.activeStop = stop;
      return { stop };
    }

    // Fallback : si aucun instrument reconnu, retour vide
    return { stop: () => { } };
  }

  /** refreshClip() — hook futur pour recalculer un clip quand les params changent. */
  refreshClip(): void { }

  /**
   * stop()
   * ------
   * Coupe un clip programmé (SimpleSynth, DualSynth ou Sampler).
   * Appelé par le transport du DAW.
   */
  stop(): void {
    try {
      this.activeStop?.();
    } catch { }
    this.activeStop = null;
    // Assure l'arrêt complet des voix en cours (évite doublage au redémarrage)
    try {
      if (this.kind === "simple-synth") this.synth?.stopAllVoices();
      else if (this.kind === "dual-synth") this.dual?.stopAllVoices();
    } catch { }
  }
}

/* ---------------- Cache global pour éviter de recréer des pistes ---------------- */

const _midiTrackCache: Map<string, MidiTrack> = new Map();

/**
 * ensureMidiTrack()
 * -----------------
 * Garantit une instance unique de MidiTrack par trackId.
 */
export function ensureMidiTrack(trackId: string): MidiTrack {
  let mt = _midiTrackCache.get(trackId);
  if (!mt) {
    mt = new MidiTrack(trackId);
    _midiTrackCache.set(trackId, mt);
  }
  return mt;
}
