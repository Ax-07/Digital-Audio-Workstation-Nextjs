// src/lib/audio/core/session-player/ui-sync-manager.ts

import { useUiStore } from "@/features/daw/state/ui.store";
import { calculateDelayMs } from "./helpers";

/**
 * UISyncManager
 * 
 * Responsabilités :
 * - Synchronise l'état UI (playing/scheduled) avec le playback audio
 * - Programme les mises à jour UI au bon moment (aligned avec 'when')
 * - Gère les transitions d'état des clips côté interface
 */
export class UISyncManager {
  /**
   * Marque un clip comme "scheduled" dans l'UI.
   */
  async setScheduled(trackId: string, sceneIndex: number | null, when: number): Promise<void> {
    try {
      const { useUiStore } = await import("@/features/daw/state/ui.store");
      useUiStore.getState().setTrackScheduled(trackId, sceneIndex, when);
    } catch {
      // Store non disponible
    }
  }

  /**
   * Marque un clip comme "playing" au moment précis 'when'.
   */
  async setPlayingAt(
    trackId: string,
    sceneIndex: number | null,
    when: number,
    currentTime: number
  ): Promise<void> {
    const delayMs = calculateDelayMs(currentTime, when);
    
    window.setTimeout(async () => {
      try {
        useUiStore.getState().setTrackPlaying(trackId, sceneIndex);
      } catch {}
    }, Math.round(delayMs));
  }

  /**
   * Efface l'état "playing" au moment précis 'when'.
   */
  async clearPlayingAt(trackId: string, when: number, currentTime: number): Promise<void> {
    const delayMs = calculateDelayMs(currentTime, when);
    
    window.setTimeout(async () => {
      try {
        useUiStore.getState().setTrackPlaying(trackId, null);
      } catch {}
    }, Math.round(delayMs));
  }

  /**
   * Efface immédiatement l'état "playing" d'une piste.
   */
  async clearPlaying(trackId: string): Promise<void> {
    try {
      useUiStore.getState().setTrackPlaying(trackId, null);
    } catch {}
  }

  /**
   * Efface tous les états "playing".
   */
  async clearAllPlaying(): Promise<void> {
    try {
      const st = useUiStore.getState();
      st.clearPlaying();
      st.clearScheduled();
    } catch {}
  }

  /**
   * Récupère le mode de lancement actuel (gate, toggle, legato...).
   */
  async getLaunchMode(): Promise<string | undefined> {
    try {
      return useUiStore.getState().launchMode;
    } catch {
      return undefined;
    }
  }

  /**
   * Récupère les cellules en cours de lecture.
   */
  async getPlayingCells(): Promise<Record<string, number | boolean | null>> {
    try {
      return useUiStore.getState().playingCells as Record<string, number | boolean | null>;
    } catch {
      return {};
    }
  }
}
