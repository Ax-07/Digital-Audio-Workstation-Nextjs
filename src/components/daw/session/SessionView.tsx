// src/components/daw/session/SessionView.tsx

"use client";

import { useMixerStore } from "@/lib/stores/mixer.store";
import { useProjectStore } from "@/lib/stores/project.store";
import { useCallback, memo } from "react";
import { useUiStore } from "@/lib/stores/ui.store";
import { useTransportStore } from "@/lib/stores/transport.store";
import { SessionGrid } from "@/components/daw/session/SessionGrid";
import { ClipEditor } from "@/components/daw/controls/clip-editor/ClipEditor";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { launchScene as launchSceneController } from "@/lib/controllers/session.controller";

/**
 * SessionView
 * -----------
 * Vue principale "Session" :
 *  - toolbar (bar/beat/tick, BPM)
 *  - grille Session (SessionGrid)
 *  - éditeur de clip en bas
 *
 * Rôle :
 *  - récupérer les infos de projet / transport / UI
 *  - dériver les props de cellules (getClipProps)
 *  - connecter les boutons de scène au controller (launchScene)
 */
const SessionViewComponent = () => {
  const tracks = useMixerStore((s) => s.tracks);
  const addProjectTrack = useProjectStore((s) => s.addTrack);
  const scenesCount = useProjectStore(
    (s) => s.project.session?.scenes.length ?? 8,
  );
  const session = useProjectStore((s) => s.project.session);

  const queued = useUiStore((s) => s.queuedCells);
  const playing = useUiStore((s) => s.playingCells);
  const scheduled = useUiStore((s) => s.scheduledCells);
  const toggleQueue = useUiStore((s) => s.toggleQueueCell);
  const openClipEditor = useUiStore((s) => s.openClipEditor);
  const clearOnLaunch = useUiStore((s) => s.clearQueueOnLaunch);
  const clearSceneQueue = useUiStore((s) => s.clearSceneQueue);
  const autoStartOnLaunch = useUiStore((s) => s.autoStartOnLaunch);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const play = useTransportStore((s) => s.play);
  const bpm = useTransportStore((s) => s.bpm);
  const bar = useTransportStore((s) => s.bar);
  const beat = useTransportStore((s) => s.beat);
  const tick = useTransportStore((s) => s.tick);

  /**
   * Fournisseur de props pour une cellule de la SessionGrid.
   * On ne fait que la logique UI (queued / playing / progression) à partir des stores.
   */
  const getClipProps = useCallback(
    (trackId: string, sceneIndex: number) => {
      const clip = session?.scenes[sceneIndex]?.clips[trackId] ?? null;
      const key = `${trackId}:${sceneIndex}`;
      const isQueued = !!queued[key];
      const isPlayingCell = !!playing[key];
      const scheduledWhen = scheduled[key];

      // Slot sans clip : uniquement l’état queued/empty
      if (!clip) {
        return { state: isQueued ? "queued" : "empty" } as const;
      }

      // Calcul de la durée de la barre de progression (en secondes)
      let progressSeconds: number | undefined;
      let isLoop = false;
      const secPerBeat = 60 / bpm;
      const loopStart = clip.loopStart;
      const loopEnd = clip.loopEnd;

      if (
        clip.loop === true &&
        typeof loopStart === "number" &&
        typeof loopEnd === "number" &&
        loopEnd > loopStart
      ) {
        progressSeconds = (loopEnd - loopStart) * secPerBeat;
        isLoop = true;
      } else if (clip.lengthBeats && clip.lengthBeats > 0) {
        progressSeconds = clip.lengthBeats * secPerBeat;
      }

      // Delay d’animation pour la progress bar = différence entre now et scheduledWhen
      const progressDelaySeconds = (() => {
        if (!scheduledWhen) return 0; // pas de lancement planifié
        let now: number | undefined = undefined;
        try {
          now = AudioEngine.ensure().context?.currentTime ?? undefined;
        } catch {}
        if (typeof now !== "number") {
          const ctxAny = (globalThis as any).__audioCtx;
          if (ctxAny && typeof ctxAny.currentTime === "number") now = ctxAny.currentTime;
        }
        if (typeof now !== "number") return 0;
        const delay = scheduledWhen - now;
        return delay > 0 ? delay : 0;
      })();

      return {
        state: isQueued ? "queued" : isPlayingCell ? "playing" : "stopped",
        label: clip.name ?? clip.id,
        type: clip.type,
        onClick: () => openClipEditor(trackId, sceneIndex),
        onAltClick: () => toggleQueue(trackId, sceneIndex),
        onQueueToggle: () => toggleQueue(trackId, sceneIndex),
        queued: isQueued,
        progressSeconds,
        isLoop,
        progressDelaySeconds,
      } as const;
    },
    [session, queued, playing, scheduled, toggleQueue, openClipEditor, bpm],
  );

  /**
   * Lancement de scène :
   *  - si autoStartOnLaunch + transport arrêté → démarre le transport puis lance la scène
   *  - sinon → lance la scène directement
   *  - optionnellement, on vide la queue de cette scène
   */
  const handleLaunchScene = useCallback(
    (sceneIndex: number) => {
      if (autoStartOnLaunch && !isPlaying) {
        void play().then(() => launchSceneController(sceneIndex));
        if (clearOnLaunch) clearSceneQueue(sceneIndex);
        return;
      }
      launchSceneController(sceneIndex);
      if (clearOnLaunch) clearSceneQueue(sceneIndex);
    },
    [clearOnLaunch, clearSceneQueue, autoStartOnLaunch, isPlaying, play],
  );

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {/* Toolbar Session */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4">
          <div className="text-xs uppercase tracking-wider text-neutral-400">
            Session
          </div>
          <div className="text-[11px] font-mono text-neutral-400/80">
            {bar}.{beat}.{tick}
          </div>
          <div className="text-[11px] font-mono text-neutral-500">
            {bpm} BPM
          </div>
        </div>
        <button
          onClick={() => addProjectTrack()}
          className="rounded-sm border border-neutral-700 bg-neutral-850 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          + Track
        </button>
      </div>

      {/* Grille Session */}
      {tracks.length > 0 ? (
        <div className="relative flex-1 overflow-auto">
          <SessionGrid
            scenes={scenesCount}
            getClipProps={getClipProps}
            onLaunchScene={handleLaunchScene}
          />
        </div>
      ) : (
        <div className="grid h-full place-content-center text-sm text-neutral-400">
          Aucune piste. Ajoutez une piste pour commencer.
        </div>
      )}

      {/* Clip Editor en bas */}
      {/* <ClipEditor /> */}
    </div>
  );
};

export const SessionView = memo(SessionViewComponent);
