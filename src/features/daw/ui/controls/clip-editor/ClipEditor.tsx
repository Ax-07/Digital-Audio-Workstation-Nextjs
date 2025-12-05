// src/components/daw/session/ClipEditor.tsx
"use client";

/**
 * ClipEditor
 * ----------
 * Panneau d'édition de clip en bas de l’interface (comme dans Ableton Live).
 *
 * Rôle :
 *  - Lit `selectedClip` depuis le store UI (trackId + sceneIndex).
 *  - Récupère le clip correspondant dans `project.session.scenes`.
 *  - Affiche soit :
 *      • un éditeur MIDI (piano roll, boucle, longueur) via <MidiClipPanel>
 *      • un éditeur Audio placeholder via <AudioClipEditor>
 *  - Permet de renommer le clip et de fermer l’éditeur.
 *
 * Flux de données :
 *  - UI store (useUiStore) :
 *      • selectedClip : { trackId, sceneIndex } | null
 *      • closeClipEditor() : ferme le panneau
 *      • setSelectedTrack(id) : synchronise la sélection de piste globale
 *  - Project store (useProjectStore) :
 *      • project.session : structures des scènes & clips
 *      • updateMidiClipNotes(trackId, sceneIndex, notes)
 *      • renameClip(trackId, sceneIndex, name)
 *      • updateClipLoop(trackId, sceneIndex, { start, end } | null)
 *      • updateMidiClipLength(trackId, sceneIndex, lengthBeats)
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useUiStore } from "@/features/daw/state/ui.store";
import { useProjectStore } from "@/features/daw/state/project.store";
import { PianoRoll } from "./pianoroll/PianoRoll";
import { DrumClipEditor } from "./drumroll/DrumClipEditor";
import { useDrumMachineStore } from "@/features/daw/state/drum-machine.store";
import { MidiNote } from "@/core/audio-engine/types";

export const ClipEditor = memo(function ClipEditor() {
  /** Clip sélectionné côté UI (track + scène) */
  const selected = useUiStore((s) => s.selectedClip);

  /** Ferme le panneau d’édition de clip */
  const close = useUiStore((s) => s.closeClipEditor);

  /** Synchronise la piste sélectionnée globale (utile pour MIDI live, etc.) */
  const setSelectedTrack = useUiStore((s) => s.setSelectedTrack);

  /** Session complète du projet : scènes + clips */
  const session = useProjectStore((s) => s.project.session);

  /** Actions projet */
  const updateNotes = useProjectStore((s) => s.updateMidiClipNotes);
  const renameClip = useProjectStore((s) => s.renameClip);
  // Stable handlers to avoid recreations inside JSX conditionals
  const handleChangeNotes = useCallback(
    (notes: MidiNote[]) => {
      if (!selected) return;
      updateNotes(selected.trackId, selected.sceneIndex, notes);
    },
    [selected, updateNotes]
  );

  const handleRename = useCallback(
    (name: string) => {
      if (!selected) return;
      renameClip(selected.trackId, selected.sceneIndex, name);
    },
    [renameClip, selected]
  );

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

  /**
   * Effet : quand on ouvre un clip, on force la sélection de piste
   *          pour aligner le reste de l'UI (device panel, mixer, etc.)
   */
  useEffect(() => {
    if (selected?.trackId) {
      console.log("🎯 ClipEditor - selected:", selected);
      setSelectedTrack(selected.trackId);
    }
  }, [selected, setSelectedTrack]);

  /** Si aucun clip n’est sélectionné, ne rien afficher. */
  if (!selected) return null;

  // Heuristique: si cette piste a une config drums dans le store, on propose DrumClipEditor
  const hasDrumMapping = !!useDrumMachineStore.getState().byTrack[selected.trackId];

  return (
    <div className="mt-2 rounded-sm border border-neutral-700 bg-neutral-800 p-3">
      {!clip ? (
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-400">Aucun clip sélectionné</div>
          <button
            className="rounded-sm border border-neutral-600 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
            onClick={close}
          >
            Fermer
          </button>
        </div>
      ) : clip.type === "midi" ? (
        hasDrumMapping ? (
          <DrumClipEditor />
        ) : (
        <MidiClipPanel
          key={clip.id}
          name={clip.name ?? clip.id}
          notes={(clip.notes ?? []) as MidiNote[]}
          onChangeNotes={handleChangeNotes}
          onRename={handleRename}
          onClose={close}
          trackId={selected.trackId}
          sceneIndex={selected.sceneIndex}
          loop={
            clip.loop === true &&
            clip.loopStart !== undefined &&
            clip.loopEnd !== undefined
              ? { start: clip.loopStart, end: clip.loopEnd }
              : null
          }
          lengthBeats={clip.lengthBeats}
        />)
      ) : (
        <AudioClipEditor
          key={clip.id}
          initialName={clip.name ?? clip.id}
          sampleUrl={clip.sampleUrl ?? ""}
          onRename={handleRename}
          onClose={close}
        />
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*                      Panneau pour clip MIDI                         */
/* ------------------------------------------------------------------ */

const MidiClipPanel = memo(function MidiClipPanel({
  name,
  notes,
  onChangeNotes,
  onRename,
  onClose,
  trackId,
  sceneIndex,
  loop,
  lengthBeats,
}: {
  name: string;
  notes: MidiNote[];
  onChangeNotes: (notes: MidiNote[]) => void;
  onRename: (name: string) => void;
  onClose: () => void;
  trackId: string;
  sceneIndex: number;
  loop: { start: number; end: number } | null;
  lengthBeats?: number;
}) {
  /** Nom local editable dans l'input */
  const [localName, setLocalName] = useState(name);

  // Debug: log trackId
  useEffect(() => {
    console.log("📋 MidiClipPanel - trackId:", trackId, "sceneIndex:", sceneIndex);
  }, [trackId, sceneIndex]);

  /** Resynchroniser l'input si on change de clip */
  useEffect(() => {
    setLocalName(name);
  }, [name]);

  /** Actions liées aux propriétés du clip MIDI */
  const updateClipLoop = useProjectStore((s) => s.updateClipLoop);
  const updateClipLength = useProjectStore((s) => s.updateMidiClipLength);

  const handleLoopChange = useCallback(
    (next: { start: number; end: number } | null) => {
      updateClipLoop(trackId, sceneIndex, next);
    },
    [sceneIndex, trackId, updateClipLoop]
  );

  const handleLengthBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v)) return;
      updateClipLength(trackId, sceneIndex, Math.max(1, v | 0));
    },
    [sceneIndex, trackId, updateClipLength]
  );

  return (
    <div className="flex gap-3">
      {/* Header : type + édition de nom + actions */}
      <div className="flex flex-col items-center justify-between border">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            Clip MIDI
          </span>
        <div className="flex items-center gap-2">
          <input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            className="h-7 rounded-sm border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-sm border border-amber-500 bg-amber-500/10 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/20"
            onClick={() => onRename(localName)}
          >
            Renommer
          </button>
          <button
            className="rounded-sm border border-neutral-600 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Piano Roll principal :
          - édition des notes
          - longueur en beats
          - boucle (start/end)
      */}
      <PianoRoll
        notes={notes}
        onChange={onChangeNotes}
        lengthBeats={lengthBeats ?? 4}
        loop={loop}
        onLoopChange={handleLoopChange}
        trackId={trackId}
      />

      {/* Contrôle de longueur de clip en beats */}
      <div className="flex items-center gap-2 text-[11px] text-neutral-300">
        <span className="text-neutral-400">Longueur (beats)</span>
        <input
          type="number"
          min={1}
          step={1}
          className="h-6 w-20 rounded-sm border border-neutral-700 bg-neutral-800 px-1 text-[11px] text-neutral-200"
          defaultValue={lengthBeats ?? 4}
          onBlur={handleLengthBlur}
        />
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*                     Panneau pour clip Audio                         */
/* ------------------------------------------------------------------ */

function AudioClipEditor({
  initialName,
  sampleUrl,
  onRename,
  onClose,
}: {
  initialName: string;
  sampleUrl: string;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  /** Nom local du clip audio */
  const [name, setName] = useState(initialName);

  /** Resynchroniser si on change de clip audio */
  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header : type + champ de nom + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            Clip Audio
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 rounded-sm border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-sm border border-amber-500 bg-amber-500/10 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/20"
            onClick={() => onRename(name)}
          >
            Renommer
          </button>
          <button
            className="rounded-sm border border-neutral-600 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Placeholder audio : affichage simple de l’URL / état futur */}
      <div className="rounded-sm border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-300">
        <div>
          <span className="text-neutral-400">Source :</span>{" "}
          {sampleUrl || "(non défini)"}
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          Remplacement d&apos;échantillon à venir.
        </div>
      </div>
    </div>
  );
}
