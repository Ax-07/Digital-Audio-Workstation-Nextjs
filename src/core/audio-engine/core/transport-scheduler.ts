// src/lib/audio/core/transport-scheduler.ts
import { PerfMonitor } from "@/devtools/perf/perf-monitor";

/* TransportScheduler
   - Écoute les messages d'horloge provenant du worklet clock-worklet
   - Convertit les ticks (impulsions PPQ) en temps musical (mesure, temps, tick)
   - Fournit une API d'abonnement pour l'UI / déclenchement de clips futur
   - Aucune allocation par tick ; réutilise un seul objet de position.

   NOTE : Les commentaires ont été complétés et traduits en français pour plus de clarté.
*/

type TransportPosition = {
  bar: number;          // Numéro de la mesure (1, 2, 3...)
  beat: number;         // Temps dans la mesure (1..BEATS_PER_BAR)
  tick: number;         // Tick dans le temps (0..PPQ-1)
  absoluteTicks: number;// Compteur global de ticks, monotone
};

type Listener = (pos: TransportPosition) => void;

export const PPQ = 96 as const;            // Pulses Per Quarter note (96 ticks par noir)
export const BEATS_PER_BAR = 4;            // Mesure en 4/4 (version MVP)

/**
 * TransportScheduler : gestionnaire singleton du transport audio/musical.
 * - Maintient la position musicale (mesure/temps/tick)
 * - Reçoit des ticks du worklet d'horloge
 * - Notifie les abonnés
 * - Gère les points de boucle
 * - Gère la planification quantifiée de lancement de clips
 */
export class TransportScheduler {
  private static _instance: TransportScheduler | null = null;
  private _listeners: Set<Listener> = new Set(); // Écouteurs pour chaque tick

  // Écouteurs pour les événements de lancement de clips
  private _launchListeners: Set<(e: { when: number; trackId: string; clipId: string; clipType: 'audio' | 'midi' }) => void> = new Set();

  private _ctx: AudioContext | null = null;      // Contexte audio principal
  private _node: AudioWorkletNode | null = null;  // Worklet d'horloge

  // Position musicale interne
  private _position: TransportPosition = {
    bar: 1,
    beat: 1,
    tick: 0,
    absoluteTicks: 0
  };

  private _started = false;    // Indique si le transport tourne
  private _bpm = 120;          // Tempo

  // Gestions des boucles
  private _loopEnabled = false;
  private _loopStartBeats = 0;
  private _loopEndBeats = BEATS_PER_BAR; // Par défaut une mesure

  /**
   * Retourne l'instance singleton du scheduler
   */
  static ensure(): TransportScheduler {
    if (!this._instance) this._instance = new TransportScheduler();
    return this._instance;
  }

  /**
   * Initialise le scheduler avec un AudioContext
   * Charge le worklet d'horloge et écoute ses messages
   */
  async init(ctx: AudioContext): Promise<void> {
    if (this._node) return;
    this._ctx = ctx;

    await ctx.audioWorklet.addModule('/worklets/clock-worklet.js');
    this._node = new AudioWorkletNode(ctx, 'clock-worklet');

    // Réception des messages de tick
    this._node.port.onmessage = (e) => {
      const data = e.data;
      if (data && data.type === 'tick') {
        this.advanceTick();
      }
    };
  }

  /**
   * Définit le BPM et informe le worklet
   */
  setBpm(bpm: number): void {
    if (!this._node) return;
    this._bpm = bpm;
    this._node.port.postMessage({ type: 'bpm', value: bpm });
  }

  /** Récupère le BPM courant */
  getBpm(): number {
    return this._bpm;
  }

  /**
   * Réinitialise la position du transport au tout début
   */
  reset(): void {
    this._position.bar = 1;
    this._position.beat = 1;
    this._position.tick = 0;
    this._position.absoluteTicks = 0;

    if (this._node) this._node.port.postMessage({ type: 'reset' });
  }

  /**
   * Avance d'un tick musical.
   * Appelée à chaque message "tick" du worklet.
   */
  private advanceTick(): void {
    const p = this._position;
    // Dev perf: record transport jitter (client-only, gated by monitor)
    const pm = PerfMonitor();
    if (pm.isEnabled()) {
      const nominalMs = 1000 * (60 / (this._bpm * PPQ));
      pm.recordTransportTick(performance.now(), nominalMs);
    }

    p.absoluteTicks++;
    p.tick++;

    // Passage au temps suivant
    if (p.tick >= PPQ) {
      p.tick = 0;
      p.beat++;

      // Passage à la mesure suivante
      if (p.beat > BEATS_PER_BAR) {
        p.beat = 1;
        p.bar++;
      }
    }

    // Gestion de la boucle, si activée
    if (this._loopEnabled) {
      const beatFloat = this.getBeatFloat();

      // Si on dépasse le point de fin, on revient au début
      if (beatFloat >= this._loopEndBeats - 1e-9) {
        this.setBeatFloat(this._loopStartBeats);
      }
    }

    // Notifier les abonnés
    for (const l of this._listeners) l(p);
  }

  /**
   * Abonne un écouteur qui sera appelé à chaque tick
   * Retourne une fonction de désabonnement
   */
  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Retourne la position actuelle du transport (lecture seule) */
  getPosition(): Readonly<TransportPosition> {
    return this._position;
  }

  // --- Gestion des points de boucle ---

  /**
   * Définit des points de boucle en nombre de temps absolus
   * startBeats : temps de début
   * endBeats : temps de fin
   */
  setLoop(startBeats: number, endBeats: number): void {
    const s = Math.min(startBeats, endBeats);
    const e = Math.max(startBeats, endBeats);

    this._loopStartBeats = Math.max(0, s);
    this._loopEndBeats = Math.max(this._loopStartBeats + 1e-6, e);
    this._loopEnabled = true;
  }

  /** Active/désactive la boucle */
  setLoopEnabled(enabled: boolean): void {
    this._loopEnabled = !!enabled;
  }

  /** Désactive totalement la boucle */
  clearLoop(): void {
    this._loopEnabled = false;
  }

  /** Retourne l'état de la boucle et ses bornes */
  getLoop(): { enabled: boolean; start: number; end: number } {
    return { enabled: this._loopEnabled, start: this._loopStartBeats, end: this._loopEndBeats };
  }

  /**
   * Calcule la position absolue en temps (en nb de temps) à partir de bar/beat/tick
   */
  getBeatFloat(): number {
    const p = this._position;
    return (p.bar - 1) * BEATS_PER_BAR + (p.beat - 1) + p.tick / PPQ;
  }

  /**
   * Définit la position musicale à partir d'un nombre absolu de temps (fractionnel possible)
   */
  setBeatFloat(beat: number): void {
    const clamped = Math.max(0, beat);
    const bars0 = Math.floor(clamped / BEATS_PER_BAR);
    const within = clamped - bars0 * BEATS_PER_BAR;
    const beats0 = Math.floor(within);
    const tickF = (within - beats0) * PPQ;

    this._position.bar = bars0 + 1;
    this._position.beat = beats0 + 1;
    this._position.tick = Math.floor(tickF);
    // absoluteTicks reste monotone
  }

  /**
   * Démarre le transport (nécessite de connecter le worklet pour qu'il tourne)
   */
  start(): void {
    if (this._started || !this._node) return;
    this._node.connect(this._ctx!.destination);
    this._started = true;
  }

  /**
   * Arrête le transport
   */
  stop(): void {
    if (!this._started || !this._node) return;
    this._node.disconnect();
    this._started = false;
  }

  /**
   * Ajoute un écouteur pour les événements de lancement de clips
   */
  onLaunch(fn: (e: { when: number; trackId: string; clipId: string; clipType: 'audio' | 'midi' }) => void): () => void {
    this._launchListeners.add(fn);
    return () => this._launchListeners.delete(fn);
  }

  /**
   * Calcule la prochaine frontière quantifiée (temps en secondes dans AudioContext).
   * Utilisé pour planifier les lancements de clips.
   */
  private getNextQuantizedTime(
    quantize: 'none' | 'bar' | 'beat' | '1/2' | '1/4' | '1/8' | '1/16' | '1n' = 'bar'
  ): number {
    if (!this._ctx) return 0;

    const spTick = 60 / (this._bpm * PPQ); // durée d'un tick en secondes
    const p = this._position;

    if (quantize === 'none') {
      // pas de quantification → un léger offset de sécurité
      return this._ctx.currentTime + 0.01;
    }

    const ticksPerBeat = PPQ;
    const ticksPerBar = BEATS_PER_BAR * PPQ;

    let ticksLeft = 0;

    if (quantize === 'beat') {
      ticksLeft = (PPQ - p.tick) % PPQ;
    } else if (quantize === 'bar' || quantize === '1n') {
      const beatsLeft = BEATS_PER_BAR - (p.beat - 1);
      ticksLeft = (beatsLeft * PPQ - p.tick) % ticksPerBar;
    } else {
      // sous-divisions du temps
      const fractions: Record<string, number> = {
        '1/2': 0.5,
        '1/4': 0.25,
        '1/8': 0.125,
        '1/16': 0.0625
      };

      const ratio = fractions[quantize];
      const ticksSub = ticksPerBeat * ratio;
      const pos = p.tick;
      const rem = pos % ticksSub;
      ticksLeft = rem === 0 ? 0 : ticksSub - rem;
    }

    return this._ctx.currentTime + ticksLeft * spTick;
  }

  /**
   * Expose publiquement le prochain temps de lancement quantifié (en secondes AudioContext).
   * Permet de synchroniser d'autres actions (ex: arrêt de pistes) avec le lancement d'une scène.
   */
  getNextLaunchTime(
    quantize: 'none' | 'bar' | 'beat' | '1/2' | '1/4' | '1/8' | '1/16' | '1n' = 'bar'
  ): number {
    return this.getNextQuantizedTime(quantize);
  }

  /**
   * Parcourt une liste de clips et planifie leur lancement en respectant la quantification.
   * Émet un événement vers les écouteurs de lancement.
   */
  launchClips(
    items: ReadonlyArray<{ trackId: string; clipId: string; clipType: 'audio' | 'midi' }>,
    quantize: 'none' | 'bar' | 'beat' | '1/2' | '1/4' | '1/8' | '1/16' | '1n' = 'bar'
  ): void {
    if (!items || items.length === 0) return;

    let when = this.getNextQuantizedTime(quantize);

    if (this._ctx) {
      const now = this._ctx.currentTime;
      const spBeat = 60 / this._bpm;

      // marge de sécurité (pour éviter les déclenchements trop proches du présent)
      const safety = Math.min(0.02, spBeat / 8);

      if (when - now < safety) {
        // Ajustement pour éviter un déclenchement tardif
        when = now + safety;
      }
    }

    // Émettre un événement de lancement pour chaque clip
    for (const it of items) {
      const ev: { when: number; trackId: string; clipId: string; clipType: 'audio' | 'midi' } = {
        when,
        trackId: it.trackId,
        clipId: it.clipId,
        clipType: it.clipType
      };
      const pm = PerfMonitor();
      if (pm.isEnabled()) {
        pm.recordEvent('transport.launch');
        if (this._ctx) {
          const delayMs = Math.max(0, (when - this._ctx.currentTime) * 1000);
          pm.recordDuration('transport.launch.delay', delayMs);
        }
      }
      for (const l of this._launchListeners) l(ev);
    }
  }

  /**
   * Lance une liste de clips à un temps précis (en secondes AudioContext).
   * Ne fait AUCUNE quantization, utilise directement 'when'.
   */
  launchClipsAt(
    items: ReadonlyArray<{ trackId: string; clipId: string; clipType: 'audio' | 'midi' }>,
    when: number
  ): void {
    if (!items || items.length === 0) return;

    for (const it of items) {
      const ev = { when, trackId: it.trackId, clipId: it.clipId, clipType: it.clipType };
      for (const l of this._launchListeners) l(ev);
    }
  }

}

/** Raccourci React-like permettant d'utiliser le scheduler global */
export function useTransportScheduler(): TransportScheduler {
  return TransportScheduler.ensure();
};
