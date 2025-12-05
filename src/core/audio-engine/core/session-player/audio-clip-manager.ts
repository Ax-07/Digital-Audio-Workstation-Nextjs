// src/lib/audio/core/session-player/audio-clip-manager.ts

import type { ActiveClip, AudioClipOptions } from "./types";
import { makePoolKey } from "./helpers";
import { BaseClipManager } from "./clip-manager-base";
import { AudioTrackPlayer } from "./audio-track-player";
import { SampleSource } from "../../sources/sampler/sample-source";

/**
 * AudioClipManager
 * 
 * Responsabilités :
 * - Gère le pool de SampleSource (cache des buffers audio)
 * - Lance et arrête les clips audio
 * - Gère les boucles audio
 */
export class AudioClipManager extends BaseClipManager {
  /** Players audio par trackId */
  private _players = new Map<string, AudioTrackPlayer>();

  private getOrCreatePlayer(trackId: string): AudioTrackPlayer {
    let p = this._players.get(trackId);
    if (!p) {
      p = new AudioTrackPlayer(trackId);
      this._players.set(trackId, p);
    }
    return p;
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
    const player = this.getOrCreatePlayer(trackId);
    return player.ensureSample(clipId, sampleUrl);
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
    const player = this.getOrCreatePlayer(trackId);
    const handle = await player.startAt(clipId, sampleUrl, when, options);
    this.setActive(trackId, {
      type: "audio",
      clipId,
      stop: () => handle.stop(),
      stopAt: handle.stopAt,
      whenSec: when,
    });
  }

  /**
   * Arrête un clip audio pour une piste donnée.
   */
  stopAudioClip(trackId: string): void {
    // reuse BaseClipManager logic
    try {
      this.stopClip(trackId);
    } catch (err) {
      this.devWarn("stopAudioClip.stopClip", err);
    }
  }

  /**
   * Programme l'arrêt d'un clip audio au temps 'whenSec'.
   */
  scheduleStopAudioClip(trackId: string, whenSec: number): void {
    const clip = this.getActiveClip(trackId) as ActiveClip | undefined;
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
    return super.getActiveClip(trackId) as ActiveClip | undefined;
  }

  /**
   * Arrête tous les clips audio.
   */
  stopAll(): void {
    super.stopAll();
  }

  /**
   * Précharge tous les samples audio d'une liste de clips.
   */
  async preloadSamples(
    clips: Array<{ trackId: string; clipId: string; sampleUrl: string }>
  ): Promise<Array<{ success: boolean; trackId: string; clipId: string }>> {
    const results = await Promise.allSettled(
      clips.map(async ({ trackId, clipId, sampleUrl }) => {
        const player = this.getOrCreatePlayer(trackId);
        await player.ensureSample(clipId, sampleUrl);
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
    super.dispose();
    for (const [, p] of this._players) {
      try { p.dispose(); } catch (e) {}
    }
    this._players.clear();
  }

  /**
   * Retourne les trackIds qui ont un clip audio actif.
   */
  getActiveTrackIds(): string[] {
    return super.getActiveTrackIds();
  }
}
