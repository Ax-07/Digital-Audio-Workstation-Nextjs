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
}

/**
 * Hook simple : retourne le singleton AudioEngine
 * sans impliquer React dans la logique audio.
 */
export function useAudioEngine(): AudioEngine {
  return AudioEngine.ensure();
}
