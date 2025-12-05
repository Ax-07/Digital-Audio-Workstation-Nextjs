// src/lib/audio/core/session-player/clip-manager-base.ts
// Abstractions partagées pour les gestionnaires de clips (audio / midi).

export type ClipHandle = {
  stop(): void;
  stopAt?: (whenSec: number) => void;
};

export type ActiveClipBase = {
  type: string;
  clipId?: string;
  stop: () => void;
  stopAt?: (whenSec: number) => void;
  whenSec?: number;
  bpm?: number;
};

export type ClipDescriptor = {
  id: string;
  type: 'audio' | 'midi';
  [key: string]: unknown;
};

export type ClipStartOptions = {
  loop?: boolean;
  fadeIn?: number;
  offset?: number;
  [key: string]: unknown;
};

export interface TrackPlayer {
  // Lance un clip (sync ou async). Retourne un ClipHandle ou une promesse.
  startClip(clipDescriptor: ClipDescriptor, whenSec: number, options?: ClipStartOptions): ClipHandle | Promise<ClipHandle>;

  // Arrête immédiatement tout ce qui est en cours sur la piste.
  stop(): void;

  // Optionnel : programme un arrêt à un temps futur (en secondes AudioContext).
  stopAt?(whenSec: number): void;

  // Type pour distinguer les players (par ex. 'audio' | 'midi').
  getType(): string;

  // Nettoyage optionnel.
  dispose?(): void;
}

/**
 * BaseClipManager
 *
 * Fournit les opérations communes et la gestion du lifecycle des clips actifs
 * (start/stop/stopAll/getActiveTrackIds). Cette classe est volontairement
 * minimale : la logique spécifique (scheduling midi, preload audio...) doit
 * rester dans des adaptateurs `TrackPlayer` spécialisés.
 */
export abstract class BaseClipManager {
  protected _active = new Map<string, ActiveClipBase>();

  private static readonly __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  protected devWarn(scope: string, err: unknown) {
    if (BaseClipManager.__DEV__) {
      console.warn(`[BaseClipManager:${scope}]`, err);
    }
  }

  protected setActive(trackId: string, clip: ActiveClipBase) {
    this._active.set(trackId, clip);
  }

  protected clearActive(trackId: string) {
    this._active.delete(trackId);
  }

  getActiveClip(trackId: string): ActiveClipBase | undefined {
    return this._active.get(trackId);
  }

  stopClip(trackId: string): void {
    const clip = this._active.get(trackId);
    if (clip) {
      try {
        clip.stop();
      } catch (err) {
        this.devWarn('stopClip.clip.stop', err);
      }
      this._active.delete(trackId);
    }
  }

  stopAll(): void {
    for (const [, clip] of this._active) {
      try {
        clip.stop();
      } catch (err) {
        this.devWarn('stopAll.clip.stop', err);
      }
    }
    this._active.clear();
  }

  dispose(): void {
    this.stopAll();
    this._active.clear();
  }

  getActiveTrackIds(): string[] {
    return [...this._active.keys()];
  }
}
