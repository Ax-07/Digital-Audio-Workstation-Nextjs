// src/lib/audio/core/session-player/audio-clip-manager.ts

import { SampleSource } from "@/lib/audio/sources/sample-source";
import type { ActiveClip, AudioClipOptions } from "./types";
import { makePoolKey } from "./helpers";

/**
 * AudioClipManager
 * 
 * Responsabilités :
 * - Gère le pool de SampleSource (cache des buffers audio)
 * - Lance et arrête les clips audio
 * - Gère les boucles audio
 */
export class AudioClipManager {
  /** Pool de sources audio, indexées par "clipId@trackId" */
  private _pool = new Map<string, SampleSource>();
  
  /** Clips audio actuellement actifs par trackId */
  private _activeAudio = new Map<string, ActiveClip>();

  private static readonly __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  private devWarn(scope: string, err: unknown) {
    if (AudioClipManager.__DEV__) {
      console.warn(`[AudioClipManager:${scope}]`, err);
    }
  }

  /**
   * S'assure qu'un SampleSource est disponible pour (trackId, clipId, sampleUrl).
   * - Si pas présent dans le pool, on l'instancie et on charge le buffer.
   * - Le buffer n'est chargé qu'une seule fois ; ensuite réutilisé.
   */
  async ensureSample(
    trackId: string,
    clipId: string,
    sampleUrl: string
  ): Promise<SampleSource> {
    const key = makePoolKey(trackId, clipId);
    let src = this._pool.get(key);
    
    if (!src) {
      src = new SampleSource(clipId, trackId);
      this._pool.set(key, src);
      
      // Preload du buffer audio
      const res = await fetch(sampleUrl);
      const buf = await res.arrayBuffer();
      await src.loadFromArrayBuffer(buf);
    }
    
    return src;
  }

  /**
   * Lance un clip audio à l'instant 'when'.
   */
  async startAudioClip(
    trackId: string,
    clipId: string,
    sampleUrl: string,
    when: number,
    options: AudioClipOptions
  ): Promise<void> {
    const src = await this.ensureSample(trackId, clipId, sampleUrl);
    
    src.startAt(when, options);

    this._activeAudio.set(trackId, {
      type: "audio",
      clipId,
      stop: () => src.stop(),
      stopAt: (t) => src.stopAt(t),
    });
  }

  /**
   * Arrête un clip audio pour une piste donnée.
   */
  stopAudioClip(trackId: string): void {
    const clip = this._activeAudio.get(trackId);
    if (clip) {
      try {
        clip.stop();
      } catch (err) {
        this.devWarn("stopAudioClip.clip.stop", err);
      }
      this._activeAudio.delete(trackId);
    }
  }

  /**
   * Programme l'arrêt d'un clip audio au temps 'whenSec'.
   */
  scheduleStopAudioClip(trackId: string, whenSec: number): void {
    const clip = this._activeAudio.get(trackId);
    if (clip && clip.stopAt) {
      try {
        clip.stopAt(whenSec);
      } catch (err) {
        this.devWarn("scheduleStopAudioClip.clip.stopAt", err);
      }
    }
  }

  /**
   * Retourne le clip audio actif pour une piste.
   */
  getActiveClip(trackId: string): ActiveClip | undefined {
    return this._activeAudio.get(trackId);
  }

  /**
   * Arrête tous les clips audio.
   */
  stopAll(): void {
    for (const [, clip] of this._activeAudio) {
      try {
        clip.stop();
      } catch (err) {
        this.devWarn("stopAll.clip.stop", err);
      }
    }
    this._activeAudio.clear();
  }

  /**
   * Précharge tous les samples audio d'une liste de clips.
   */
  async preloadSamples(
    clips: Array<{ trackId: string; clipId: string; sampleUrl: string }>
  ): Promise<Array<{ success: boolean; trackId: string; clipId: string }>> {
    const results = await Promise.allSettled(
      clips.map(async ({ trackId, clipId, sampleUrl }) => {
        await this.ensureSample(trackId, clipId, sampleUrl);
        return { success: true, trackId, clipId };
      })
    );

    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { success: false, ...clips[i] };
    });
  }

  /**
   * Nettoie les ressources.
   */
  dispose(): void {
    this.stopAll();
    this._pool.clear();
  }

  /**
   * Retourne les trackIds qui ont un clip audio actif.
   */
  getActiveTrackIds(): string[] {
    return [...this._activeAudio.keys()];
  }
}
