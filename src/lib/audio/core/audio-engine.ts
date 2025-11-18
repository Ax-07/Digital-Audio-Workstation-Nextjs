/*
  AudioEngine minimal — Phase 1 (Foundation)
  ------------------------------------------
  Rôle principal :
  - Garantir un unique AudioContext (pattern singleton)
  - Configurer un master GainNode propre, relié à la sortie
  - Aucun objet créé dans les boucles audio (préservation des perfs)
  - Compatible server-side rendering (checks window)
    - Fournit :
      • bus de pré-écoute pour jouer des notes ponctuelles (preview)
*/

export type AudioEngineInfo = {
  readonly sampleRate: number;
  readonly baseLatency: number | null;
  readonly outputLatency: number | null;
};

/**
 * Convertit un niveau en dB en gain linéaire.
 * -100 dB et moins → gain = 0 (mute total)
 * Sinon : 10^(dB/20)
 */
export function dbToGain(db: number): number {
  // clamp bas pour éviter des valeurs minuscules inutiles
  if (db <= -100) return 0;
  return Math.pow(10, db / 20);
}

/**
 * AudioEngine : gestionnaire audio central.
 * - Singleton
 * - Initialise AudioContext à la demande
 * - Met en place un master gain
 * - Gère la pré-écoute de notes (preview)
 *
 * Aucun état React ici, pour éviter les re-render. Tout est runtime/audio.
 */
export class AudioEngine {
  private static _instance: AudioEngine | null = null;

  private _ctx: (AudioContext & { outputLatency?: number }) | null = null;
  private _masterGain: GainNode | null = null;
  private _initialized = false;

  // --- Preview bus : pour jouer des notes ponctuelles (piano roll, etc.) ---
  // _previewGain est un gain commun à toutes les notes de preview
  private _previewGain: GainNode | null = null;

  // On conserve les voix actives pour permettre stopPreviewNote()
  private _previewVoices: Map<number, { osc: OscillatorNode; gain: GainNode }> = new Map();

  /** Accès au singleton */
  static ensure(): AudioEngine {
    if (!AudioEngine._instance) {
      AudioEngine._instance = new AudioEngine();
    }
    return AudioEngine._instance;
  }

  /** Vérifie si l'audio est disponible (window + AudioContext) */
  get isAvailable(): boolean {
    return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
  }

  /** Retourne l'AudioContext ou null s'il n'est pas encore initialisé */
  get context(): AudioContext | null {
    return this._ctx;
  }

  /** Retourne le master GainNode (tête de mixage globale) */
  get masterGain(): GainNode | null {
    return this._masterGain;
  }

  /** Indique si init() a déjà été appelé avec succès */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialise l'AudioContext.
   * Important : doit être déclenché par une action utilisateur (règles WebAudio).
   * Ne fait rien si déjà initialisé ou si AudioContext indisponible (SSR).
   */
  async init(): Promise<void> {
    if (this._initialized) return;
    if (!this.isAvailable) return;

    // Création du contexte audio (latence interactive recommandée pour un DAW)
    const Ctx = window.AudioContext;
    const ctx = new Ctx({ latencyHint: "interactive" });

    // Création du master gain (gain global du projet)
    const masterGain = ctx.createGain();
    masterGain.gain.value = dbToGain(-6); // marge de sécurité par défaut
    masterGain.connect(ctx.destination);

    this._ctx = ctx as AudioContext & { outputLatency?: number };
    this._masterGain = masterGain;
    this._initialized = true;
  }

  /** Reprend la lecture si le contexte est suspendu */
  async resume(): Promise<void> {
    if (!this._ctx) return;
    if (this._ctx.state === "suspended") await this._ctx.resume();
  }

  /** Met en pause l’audio engine */
  async suspend(): Promise<void> {
    if (!this._ctx) return;
    if (this._ctx.state === "running") await this._ctx.suspend();
  }

  /** Définit le niveau global de sortie (master dB → gain) */
  setMasterGainDb(db: number): void {
    if (!this._masterGain) return;
    this._masterGain.gain.value = dbToGain(db);
  }

  /**
   * Informations utiles :
   * - Sample rate
   * - Latence de base / latence de sortie (si supporté par le navigateur)
   */
  info(): AudioEngineInfo | null {
    if (!this._ctx) return null;
    const ctxAny = this._ctx as unknown as { baseLatency?: number; outputLatency?: number };
    return {
      sampleRate: this._ctx.sampleRate,
      baseLatency: typeof ctxAny.baseLatency === "number" ? ctxAny.baseLatency : null,
      outputLatency: typeof ctxAny.outputLatency === "number" ? ctxAny.outputLatency : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Preview notes (piano roll, clics de pré-écoute)
  // ---------------------------------------------------------------------------

  /** Prépare le bus global de preview (réutilisé pour toutes les notes) */
  private ensurePreviewBus(): void {
    if (!this._ctx || !this._masterGain) return;
    if (this._previewGain) return;

    const g = this._ctx.createGain();
    g.gain.value = dbToGain(-18); // Pré-écoute légèrement atténuée
    g.connect(this._masterGain);
    this._previewGain = g;
  }

  /**
   * Joue une note courte (one-shot) pour les aperçus :
   * - pitch : note MIDI
   * - velocity : 0..1
   * - durationSec : durée totale
   * - type : type d'onde (sine/square/triangle/sawtooth)
   */
  async previewNote(
    pitch: number,
    opts?: { velocity?: number; durationSec?: number; type?: OscillatorType }
  ): Promise<void> {
    await this.init();
    await this.resume();
    if (!this._ctx) return;

    this.ensurePreviewBus();
    if (!this._previewGain) return;

    const velocity = opts?.velocity ?? 0.8;
    const duration = Math.max(0.05, opts?.durationSec ?? 0.35);
    const type: OscillatorType = opts?.type ?? "sine";

    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;

    // Conversion MIDI → fréquence
    const freq = 440 * Math.pow(2, (pitch - 69) / 12);
    osc.frequency.value = freq;

    // Mini-envelope (attaque rapide, release court)
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(dbToGain(-12) * velocity, now + 0.005);

    const stopAt = now + duration;
    g.gain.setTargetAtTime(0, stopAt - 0.03, 0.02);

    osc.connect(g);
    g.connect(this._previewGain);

    osc.start(now);
    osc.stop(stopAt);
  }

  /**
   * Démarre une note de preview (sustain).
   * Peut être maintenue tant qu’on ne appelle pas stopPreviewNote().
   */
  async startPreviewNote(
    pitch: number,
    opts?: { velocity?: number; type?: OscillatorType }
  ): Promise<void> {
    await this.init();
    await this.resume();
    if (!this._ctx) return;

    this.ensurePreviewBus();
    if (!this._previewGain) return;

    // Si une voix existe déjà pour ce pitch → on augmente son niveau
    if (this._previewVoices.has(pitch)) {
      const v = this._previewVoices.get(pitch)!;
      const now = this._ctx.currentTime;
      const velocity = opts?.velocity ?? 0.85;

      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(dbToGain(-10) * velocity, now, 0.01);

      return;
    }

    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    const type: OscillatorType = opts?.type ?? "sine";
    osc.type = type;

    const freq = 440 * Math.pow(2, (pitch - 69) / 12);
    osc.frequency.value = freq;

    const velocity = opts?.velocity ?? 0.85;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(dbToGain(-10) * velocity, now + 0.01);

    osc.connect(g);
    g.connect(this._previewGain);

    osc.start(now);

    this._previewVoices.set(pitch, { osc, gain: g });
  }

  /**
   * Arrête une preview note active.
   * Ajoute une petite release pour éviter les clics.
   */
  stopPreviewNote(pitch: number, opts?: { releaseMs?: number }): void {
    if (!this._ctx) return;

    const v = this._previewVoices.get(pitch);
    if (!v) return;

    const now = this._ctx.currentTime;
    const rel = Math.max(5, opts?.releaseMs ?? 60) / 1000;

    try {
      // Release douce
      v.gain.gain.setTargetAtTime(0, now, rel * 0.5);
      const stopAt = now + rel + 0.01;
      v.osc.stop(stopAt);

      // Nettoyage asynchrone
      setTimeout(() => {
        try { v.osc.disconnect(); } catch {}
        try { v.gain.disconnect(); } catch {}
      }, (rel + 0.05) * 1000);
    } finally {
      this._previewVoices.delete(pitch);
    }
  }
}

/**
 * Hook simple : retourne le singleton AudioEngine
 * sans impliquer React dans la logique audio.
 */
export function useAudioEngine(): AudioEngine {
  return AudioEngine.ensure();
}
