// src/components/daw/controls/clip-editor/MidiClipEditor.tsx
"use client";

/**
 * ClipEditor
 * ----------
 * Panneau d'édition de clip midi
 *
 * Rôle :
 *  - Lit `selectedClip` depuis le store UI (trackId + sceneIndex).
 *  - Récupère le clip correspondant dans `project.session.scenes`.
 *  - Affiche :
 *      • un éditeur MIDI (piano roll, boucle, longueur)
 *  - Permet de renommer le clip et de fermer l’éditeur.
 *
 * Flux de données :
 *  - UI store (useUiStore) :
 *      • selectedClip : { trackId, sceneIndex } | null
 *      • setSelectedTrack(id) : synchronise la sélection de piste globale
 *  - Project store (useProjectStore) :
 *      • project.session : structures des scènes & clips
 *      • updateMidiClipNotes(trackId, sceneIndex, notes)
 *      • renameClip(trackId, sceneIndex, name)
 *      • updateClipLoop(trackId, sceneIndex, { start, end } | null)
 *      • updateMidiClipLength(trackId, sceneIndex, lengthBeats)
 *  - Type midi note :
 *      • pitch : nombre (MIDI note number)
 *      • time : nombre (position en beats)
 *      • duration : nombre (durée en beats)
 *      • velocity : nombre (0-127)
 *
 * Actions possibles :
 *      • renameClip(trackId, sceneIndex, name)
 *      • updateClipLoop(trackId, sceneIndex, { start, end } | null)
 *      • updateMidiClipLength(trackId, sceneIndex, lengthBeats)
 */

import { memo, useEffect, useMemo, useState } from "react";
import { useProjectStore } from "@/lib/stores/project.store";
import type { MidiNote } from "@/lib/audio/types";
import { useUiStore } from "@/lib/stores/ui.store";
import { PianoRoll } from "./PianoRoll";
import { useTransportScheduler } from "@/lib/audio/core/transport-scheduler";

// 👇 petit hook interne pour suivre le beat global
function useGlobalBeatFloat() {
  const scheduler = useTransportScheduler();
  const [beat, setBeat] = useState<number>(() => scheduler.getBeatFloat());

  useEffect(() => {
    const unsubscribe = scheduler.subscribe(() => {
      // On récupère la position en beats via l’API du scheduler
      setBeat(scheduler.getBeatFloat());
    });
    return unsubscribe;
  }, [scheduler]);

  return beat;
}
// Helper pour calculer le beat local dans le clip en fonction du beat global
// Le playhead local tient compte du startOffset (position) dans la boucle
function computeClipLocalBeat(globalBeat: number, loopStart: number, loopEnd: number, position: number): number {
  const ls = loopStart;
  const le = Math.max(loopEnd, ls + 1e-6);
  const loopLen = le - ls;

  // position = startOffset du clip, fallback sur loopStart
  const pos = Number.isFinite(position) ? position : ls;

  // Décalage de phase par le startOffset
  const relative = globalBeat + (pos - ls);

  // modulo sécurisé dans [0, loopLen)
  const phase = ((relative % loopLen) + loopLen) % loopLen;

  return ls + phase;
}

export const MidiClipEditor = memo(function MidiClipEditor() {
  /** Clip sélectionné côté UI (track + scène) */
  const selected = useUiStore((s) => s.selectedClip);
  /** Synchronise la piste sélectionnée globale (utile pour MIDI live, etc.) */
  const setSelectedTrack = useUiStore((s) => s.setSelectedTrack);

  /** Session complète du projet : scènes + clips */
  const session = useProjectStore((s) => s.project.session);

  /** Suivi du beat global */
  const globalBeat = useGlobalBeatFloat(); // 👈 ici

  /** Actions projet */
  const renameClip = useProjectStore((s) => s.renameClip);
  const updateClipLoop = useProjectStore((s) => s.updateClipLoop);
  const updateClipLength = useProjectStore((s) => s.updateMidiClipLength);
  const updateMidiClipNotes = useProjectStore((s) => s.updateMidiClipNotes);
  const setClipStartOffset = useProjectStore((s) => s.setClipStartOffset);

  /**
   * Résolution du clip sélectionné :
   *  - à partir de selected.sceneIndex, on récupère la scène
   *  - on indexe dans scene.clips via trackId
   */
  const clip = useMemo(() => {
    if (!selected) return null;
    const sc = session?.scenes?.[selected.sceneIndex];
    if (!sc) return null;
    return sc.clips[selected.trackId] ?? null;
  }, [session, selected]);

  const isPlaying = useUiStore((s) =>
    clip ? !!s.playingCells[`${selected?.trackId}:${selected?.sceneIndex}`] : false
  );

  // Option : si tu as plusieurs types de clip (audio / midi)
  const midiClip = useMemo(() => {
    if (!clip) return null;
    if (clip.type !== "midi") return null; // adapte au besoin
    return clip;
  }, [clip]);

  /** Nom local editable dans l’input */
  const [localName, setLocalName] = useState(clip?.name ?? "");

  // Quand on change de clip, resynchroniser le champ texte
  useEffect(() => {
    setLocalName(clip?.name ?? "");
  }, [clip?.name]);

  /**
   * Effet : quand on ouvre un clip, on force la sélection de piste
   *          pour aligner le reste de l’UI (device panel, mixer, etc.)
   */
  useEffect(() => {
    if (selected?.trackId != null) setSelectedTrack(selected.trackId);
  }, [selected, setSelectedTrack]);

  /** Si aucun clip n’est sélectionné, ne rien afficher. */
  if (!selected || !clip) return null;

  const lengthBeats = midiClip?.lengthBeats ?? 4;

  // Valeurs dérivées pour la loop et la position
  const loopStart = clip.loopStart ?? 0;
  const loopEnd = clip.loopEnd ?? lengthBeats;

  // Position = offset de départ de lecture dans le clip
  const position = clip.startOffset ?? loopStart;

  const loop = clip.loopStart != null && clip.loopEnd != null ? { start: clip.loopStart, end: clip.loopEnd } : null;

  // 👇 calcul du playhead local dans le clip (en beats clip-local)
  const localPlayheadBeat = isPlaying ? computeClipLocalBeat(globalBeat, loopStart, loopEnd, position) : null;

  const handleLoopStartChange = (value: number) => {
    const end = loopEnd;
    updateClipLoop(selected.trackId, selected.sceneIndex, {
      start: value,
      end,
    });
  };

  const handleLoopEndChange = (value: number) => {
    const start = loopStart;
    updateClipLoop(selected.trackId, selected.sceneIndex, {
      start,
      end: value,
    });
  };

  // Position = startOffset, offset de lecture dans la loop/clip
  const handlePositionChange = (value: number) => {
    // ici on peut clamp dans [loopStart, loopEnd) si tu veux coller à Ableton,
    // pour l’instant on reste simple :
    const safe = Number.isFinite(value) ? value : 0;
    setClipStartOffset(selected.trackId, selected.sceneIndex, safe);
  };

  return (
    <section id="midi-clip" className="flex gap-1 h-60">
      {/* Panneau d'infos à gauche */}
      <div className="flex flex-col gap-2 justify-between border p-2 w-56">
        <span className="text-xs tracking-wider text-neutral-400">Midi</span>

        {/* Nom du clip */}
        <div className="flex items-center gap-2">
          <input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={() => renameClip(selected.trackId, selected.sceneIndex, localName)}
            className="flex-1 bg-neutral-700 px-1 py-0.5 text-sm text-white outline-none ring-0 placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-500"
            placeholder="Nom du clip"
          />
        </div>

        {/* Loop + Position */}
        <div id="loop-editor" className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-400">Loop</span>

            {/* 🔘 Toggle Loop */}
            <button
              className={`px-2 py-0.5 text-[10px] rounded ${
                loop ? "bg-green-600 text-white" : "bg-neutral-700 text-neutral-300"
              }`}
              onClick={() => {
                if (loop) {
                  // Désactivation du loop
                  updateClipLoop(selected.trackId, selected.sceneIndex, null);
                } else {
                  // Réactivation du loop : par défaut 4 bars
                  updateClipLoop(selected.trackId, selected.sceneIndex, {
                    start: 0,
                    end: 4,
                  });
                }
              }}
            >
              {loop ? "ON" : "OFF"}
            </button>
          </div>

          {/* Position (offset de départ) */}
          <div className="flex gap-1 items-center">
            <span className="text-[10px] text-neutral-500 w-14">Position</span>
            <input
              type="number"
              className="flex-1 bg-neutral-900 px-1 py-0.5 text-xs text-white outline-none ring-0 placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-500"
              value={position}
              step={0.25}
              onChange={(e) => handlePositionChange(Number(e.target.value))}
            />
          </div>

          {/* Loop Start */}
          <div className="flex gap-1 items-center">
            <span className="text-[10px] text-neutral-500 w-14">Loop Start</span>
            <input
              type="number"
              className="flex-1 bg-neutral-900 px-1 py-0.5 text-xs text-white outline-none ring-0 placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-500"
              value={loopStart}
              step={0.25}
              onChange={(e) => handleLoopStartChange(Number(e.target.value))}
            />
          </div>

          {/* Loop End */}
          <div className="flex gap-1 items-center">
            <span className="text-[10px] text-neutral-500 w-14">Loop End</span>
            <input
              type="number"
              className="flex-1 bg-neutral-900 px-1 py-0.5 text-xs text-white outline-none ring-0 placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-500"
              value={loopEnd}
              step={0.25}
              onChange={(e) => handleLoopEndChange(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Longueur du clip (fin du clip, pas de la loop) */}
        <div id="length-editor" className="flex gap-1 items-center">
          <span className="text-[10px] text-neutral-400">Clip Length</span>
          <input
            type="number"
            className="w-16 bg-neutral-900 px-1 py-0.5 text-xs text-white outline-none ring-0 placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-500"
            value={lengthBeats}
            step={1}
            onChange={(e) => updateClipLength(selected.trackId, selected.sceneIndex, Number(e.target.value))}
          />
        </div>
      </div>

      {/* Zone principale : Piano Roll */}
      {midiClip ? (
        <div className="flex-1 border bg-neutral-900 relative h-full">
          <div className="bg-red-300 h-10"></div>
          <PianoRoll
            notes={midiClip.notes as MidiNote[]}
            lengthBeats={lengthBeats}
            onChange={(notes) => updateMidiClipNotes(selected.trackId, selected.sceneIndex, notes)}
            onDraftChange={async (notes) => {
              try {
                const mod = await import("@/lib/audio/core/session-player-refactored");
                mod.getSessionPlayer().applyMidiDraft(selected.trackId, selected.sceneIndex, notes);
              } catch {}
            }}
            loop={loop}
            onLoopChange={(next) => updateClipLoop(selected.trackId, selected.sceneIndex, next)}
            position={position}
            playheadBeat={localPlayheadBeat ?? undefined}
            followPlayhead={isPlaying}
            active={isPlaying}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-neutral-500 border">Clip non MIDI</div>
      )}
    </section>
  );
});
