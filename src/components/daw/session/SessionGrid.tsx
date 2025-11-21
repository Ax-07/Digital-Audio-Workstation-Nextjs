// src/components/daw/session/SessionGrid.tsx

"use client";

import { memo, useMemo, Fragment, useCallback } from "react";
import { useMixerStore } from "@/lib/stores/mixer.store";
import { useProjectStore } from "@/lib/stores/project.store";
import { ClipCell, type ClipCellProps } from "@/components/daw/session/ClipCell";
import { Button } from "../../ui/button";
import { PlayIcon } from "lucide-react";
import { ChannelStrip } from "../ChannelStrip";
import { useUiStore } from "@/lib/stores/ui.store";
import { useTransportStore } from "@/lib/stores/transport.store";
import {
  launchClip as launchClipController,
  stopTrackQuantized,
} from "@/lib/controllers/session.controller";

export type SessionGridProps = {
  scenes?: number; // number of rows (scenes)
  // provider pour les props de clip : (trackId, sceneIndex) => ClipCell props
  getClipProps?: (trackId: string, sceneIndex: number) => Partial<ClipCellProps> | undefined;
  // déclencher tous les clips d’une scène (bouton à gauche)
  onLaunchScene?: (sceneIndex: number) => void;
};

/**
 * SessionGrid
 * -----------
 * Grille de type Ableton :
 *  - colonnes = pistes
 *  - lignes   = scènes
 *
 * UI pure, aucun accès direct à l’audio.
 */
export const SessionGrid = memo(function SessionGrid({
  scenes = 8,
  getClipProps,
  onLaunchScene,
}: SessionGridProps) {
  const tracks = useMixerStore((s) => s.tracks);
  const session = useProjectStore((s) => s.project.session);
  const renameScene = useProjectStore((s) => s.renameScene);
  const setSceneColor = useProjectStore((s) => s.setSceneColor);
  const duplicateScene = useProjectStore((s) => s.duplicateScene);
  const createMidiClip = useProjectStore((s) => s.createMidiClip);

  const playingCells = useUiStore((s) => s.playingCells);
  const autoStartOnLaunch = useUiStore((s) => s.autoStartOnLaunch);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const play = useTransportStore((s) => s.play);

  // Stabilise le nombre de scènes (1..64)
  const rows = Math.max(1, Math.min(64, scenes | 0));

  // Mise en page : première colonne = scènes, puis 1 colonne par piste
  const trackColWidth = "92px" as const;
  const sceneColWidth = "92px" as const;
  const sceneColHeight = "32px" as const;

  const gridTemplateColumns = useMemo(
    () => `${sceneColWidth} repeat(${tracks.length}, ${trackColWidth})`,
    [tracks.length],
  );
  const gridTemplateRows = useMemo(
    () => `${sceneColHeight} repeat(${rows}, ${sceneColHeight})`,
    [rows],
  );

  /** Lancement de scène (bouton Play à gauche) */
  const handleLaunch = useCallback(
    (idx: number) => {
      onLaunchScene?.(idx);
    },
    [onLaunchScene],
  );

  /** Petit menu contextuel de scène : rename / color / dup */
  const handleSceneMenu = useCallback(
    (idx: number) => {
      const choice = window.prompt("Action scène (rename/color/dup):", "rename");
      if (!choice) return;

      if (choice.toLowerCase().startsWith("ren")) {
        const name = window.prompt(
          "Nouveau nom de scène:",
          session?.scenes[idx]?.name ?? `Scene ${idx + 1}`,
        );
        if (name !== null && name !== undefined) renameScene(idx, name);
      } else if (choice.toLowerCase().startsWith("col")) {
        const color = window.prompt(
          "Couleur hex (ex: #FFD02F):",
          session?.scenes[idx]?.color ?? "#FFD02F",
        );
        if (color) setSceneColor(idx, color);
      } else if (choice.toLowerCase().startsWith("dup")) {
        duplicateScene(idx);
      }
    },
    [renameScene, setSceneColor, duplicateScene, session],
  );

  return (
    <div className="flex flex-col h-full w-full">
      {/* En-têtes : colonne scène + entêtes de pistes */}
      <div
        className="sticky top-0 z-10 grid gap-1 bg-neutral-900/90 px-1 py-1"
        style={{ gridTemplateColumns }}
      >
        {/* Cellule header scène */}
        <div className="flex items-center justify-center rounded-md border border-neutral-700/80 bg-neutral-850 px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-400">
          Scenes
        </div>
        {/* Entêtes pistes */}
        {tracks.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-center rounded-md border border-neutral-700/80 bg-neutral-850 px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-400"
          >
            {t.name}
          </div>
        ))}
      </div>

      {/* Grille principale */}
      <div
        className="mt-1 grid gap-1 px-1 overflow-auto"
        style={{ gridTemplateColumns, gridTemplateRows }}
      >
        {Array.from({ length: rows }).map((_, r) => {
          // Scène considérée "en lecture" si au moins une cellule de cette ligne joue
          const isScenePlaying = Object.keys(playingCells).some((k) =>
            k.endsWith(`:${r}`),
          );

          return (
            <Fragment key={r}>
              {/* Cellule de lancement de scène (colonne de gauche) */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: session?.scenes?.[r]?.color ?? "#777" }}
                    title={session?.scenes?.[r]?.color ?? "Scene color"}
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Lancer la scène ${r + 1}`}
                    title={session?.scenes?.[r]?.name ?? `Scene ${r + 1}`}
                    onClick={() => handleLaunch(r)}
                    className={
                      isScenePlaying ? "ring-2 ring-amber-400 animate-pulse" : undefined
                    }
                  >
                    <PlayIcon size={12} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Actions scène"
                    onClick={() => handleSceneMenu(r)}
                  >
                    ⋯
                  </Button>
                </div>
              </div>

              {/* Cellules de piste pour cette scène */}
              {tracks.map((t) => {
                const trackId = t.id;
                const cellKey = `${trackId}-${r}`;

                // Props UI calculées par SessionView (state / label / progress / queued...)
                const baseProps = getClipProps?.(trackId, r) ?? {};

                // Clip réellement présent dans le projet à cet emplacement ?
                const clip = session?.scenes?.[r]?.clips?.[trackId] ?? null;

                // Est-ce que cette piste joue un clip dans *n'importe quelle* scène ?
                const anyPlayingOnTrack = Object.keys(playingCells).some((k) =>
                  k.startsWith(trackId + ":"),
                );

                // --- CAS 2 : pas de clip ici, mais la piste joue ailleurs → SLOT STOP ---
                if (!clip && anyPlayingOnTrack) {
                  const stopProps: Partial<ClipCellProps> = {
                    state: "stopped", // pas "empty" pour forcer l’affichage du bouton
                    type: "audio",
                    label: "Stop",
                    color: "#BF616A", // rouge doux
                    onClick: () => stopTrackQuantized(trackId),
                    onPlay: undefined, // on fait tout via onStop (mode stop-slot)
                    onStop: () => stopTrackQuantized(trackId),
                  };

                  return <ClipCell key={cellKey} {...stopProps} />;
                }

                // --- CAS 1 / 3 : logique normale (clip présent ou slot vraiment vide) ---

                const finalProps: Partial<ClipCellProps> = {
                  state: "empty",
                  ...baseProps,
                };

                // Slot vraiment vide (aucun clip + pas de handlers) → bouton "+ MIDI" pour tester
                if (!clip && (finalProps.state ?? "empty") === "empty" && !finalProps.onClick) {
                  finalProps.onClick = () => {
                    const notes = [
                      { id: "note1", pitch: 60, time: 0, duration: 0.95, velocity: 0.85 },
                      { id: "note2", pitch: 64, time: 1, duration: 0.95, velocity: 0.85 },
                      { id: "note3", pitch: 67, time: 2, duration: 0.95, velocity: 0.85 },
                      { id: "note4", pitch: 72, time: 3, duration: 0.95, velocity: 0.85 },
                    ];
                    createMidiClip(trackId, r, notes, "MIDI Test");
                  };
                  finalProps.label = finalProps.label ?? "+ MIDI";
                } else {
                  // Slot avec clip : bouton Play/Stop quantisé
                  finalProps.onPlay = async () => {
                    if (autoStartOnLaunch && !isPlaying) {
                      await play();
                    }
                    launchClipController(trackId, r);
                  };
                  finalProps.onStop = () => stopTrackQuantized(trackId);
                }

                return <ClipCell key={cellKey} {...finalProps} />;
              })}
            </Fragment>
          );
        })}
      </div>

      {/* Bas de page : channel strips alignés aux colonnes de pistes */}
      <div
        className="h-fit z-10 grid gap-1 bg-neutral-900/90 px-1 py-1"
        style={{ gridTemplateColumns }}
      >
        <div /> {/* colonne scène vide */}
        {tracks.map((t) => (
          <ChannelStrip key={t.id} id={t.id} />
        ))}
      </div>
    </div>
  );
});
