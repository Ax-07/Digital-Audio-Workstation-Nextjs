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

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useProjectStore } from "@/features/daw/state/project.store";
import { useUiStore } from "@/features/daw/state/ui.store";
import { PianoRoll } from "./pianoroll/PianoRoll";
import { useTransportScheduler } from "@/core/audio-engine/core/transport-scheduler";
import { GridValue, MidiNote } from "@/core/audio-engine/types";
import { getSessionPlayer } from "@/core/audio-engine/core/session-player";
import { Card, CardContent } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Button } from "@/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

// 👇 petit hook interne pour suivre le beat global
function useGlobalBeatFloat() {
  const scheduler = useTransportScheduler();
  const [beat, setBeat] = useState<number>(() => scheduler.getBeatFloat());

  useEffect(() => {
    let lastBeat = scheduler.getBeatFloat();
    let lastUpdate = performance.now();

    // 60 fps max ≈ 16ms, et threshold de changement de beat
    const MIN_DT = 16;          // en ms
    const MIN_DB = 1 / 128;     // changement minimum en beats

    const unsubscribe = scheduler.subscribe(() => {
      const now = performance.now();
      const currentBeat = scheduler.getBeatFloat();

      // Ne met à jour que si assez de temps écoulé ET/ou beat suffisamment différent
      if (
        now - lastUpdate < MIN_DT &&
        Math.abs(currentBeat - lastBeat) < MIN_DB
      ) {
        return;
      }

      lastUpdate = now;
      lastBeat = currentBeat;
      setBeat(currentBeat);
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
  const scheduler = useTransportScheduler();
  // UI store
  const selected = useUiStore((s) => s.selectedClip);
  const setSelectedTrack = useUiStore((s) => s.setSelectedTrack);
  const playingCells = useUiStore((s) => s.playingCells);

  // Project store
  const session = useProjectStore((s) => s.project.session);
  const renameClip = useProjectStore((s) => s.renameClip);
  const updateClipLoop = useProjectStore((s) => s.updateClipLoop);
  const updateClipLength = useProjectStore((s) => s.updateMidiClipLength);
  const updateMidiClipNotes = useProjectStore((s) => s.updateMidiClipNotes);
  const setClipStartOffset = useProjectStore((s) => s.setClipStartOffset);

  const [snap, setSnap] = useState<boolean>(true);
  const [grid, setGrid] = useState<GridValue>(16);
  /** Suivi du beat global */
  const globalBeat = useGlobalBeatFloat();

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
   * Clip en cours de lecture ?
   * 
   */
  const isPlaying = useMemo(() => {
    if (!clip || !selected) return false;
    return !!playingCells[`${selected.trackId}:${selected.sceneIndex}`];
  }, [clip, playingCells, selected]);

  // Option : si tu as plusieurs types de clip (audio / midi)
  const midiClip = useMemo(() => {
    if (!clip) return null;
    if (clip.type !== "midi") return null; // adapte au besoin
    return clip;
  }, [clip]);

  /** 
   * Nom local editable - on utilise une key pour forcer le reset de l'input 
   * quand on change de clip, évitant ainsi le setState dans un effect 
   */
  const clipKey = selected ? `${selected.trackId}:${selected.sceneIndex}` : "no-clip";
  const [localName, setLocalName] = useState("");

  /**
   * Effet : quand on ouvre un clip, on force la sélection de piste
   *          pour aligner le reste de l'UI (device panel, mixer, etc.)
   */
  const selectedTrackId = useUiStore((s) => s.selectedTrackId);
  useEffect(() => {
    if (selected?.trackId != null && selectedTrackId !== selected.trackId) {
      setSelectedTrack(selected.trackId);
    }
  }, [selected?.trackId, selectedTrackId, setSelectedTrack]);

  const lengthBeats = midiClip?.lengthBeats ?? 4;

  // Valeurs dérivées pour la loop et la position
  const loopStart = clip?.loopStart ?? 0;
  const loopEnd = clip?.loopEnd ?? lengthBeats;

  // Position = offset de départ de lecture dans le clip
  const position = clip?.startOffset ?? loopStart;

  const loop =
    clip && clip.loopStart != null && clip.loopEnd != null ? { start: clip.loopStart, end: clip.loopEnd } : null;

  // 👇 calcul du playhead local dans le clip (en beats clip-local)
  const localPlayheadBeat = useMemo(
    () => (isPlaying ? computeClipLocalBeat(globalBeat, loopStart, loopEnd, position) : null),
    [isPlaying, globalBeat, loopStart, loopEnd, position]
  );

  const handleLoopStartChange = useCallback(
    (value: number) => {
      if (!selected) return;
      updateClipLoop(selected.trackId, selected.sceneIndex, { start: value, end: loopEnd });
    },
    [loopEnd, selected, updateClipLoop]
  );

  const handleLoopEndChange = useCallback(
    (value: number) => {
      if (!selected) return;
      updateClipLoop(selected.trackId, selected.sceneIndex, { start: loopStart, end: value });
    },
    [loopStart, selected, updateClipLoop]
  );

  // Position = startOffset, offset de lecture dans la loop/clip
  const handlePositionChange = useCallback(
    (value: number) => {
      if (!selected) return;
      const safe = Number.isFinite(value) ? value : 0;
      setClipStartOffset(selected.trackId, selected.sceneIndex, safe);
    },
    [selected, setClipStartOffset]
  );

  // Stable handlers for PianoRoll
  const onNotesChange = useCallback(
    (notes: MidiNote[]) => {
      if (!selected) return;
      updateMidiClipNotes(selected.trackId, selected.sceneIndex, notes);
    },
    [selected, updateMidiClipNotes]
  );

  const onDraftChange = useCallback(
    (notes: MidiNote[]) => {
      if (!selected) return;
      try {
        getSessionPlayer().applyMidiDraft(selected.trackId, selected.sceneIndex, notes);
      } catch {}
    },
    [selected]
  );

  const onLoopChange = useCallback(
    (next: { start: number; end: number } | null) => {
      if (!selected) return;
      updateClipLoop(selected.trackId, selected.sceneIndex, next);
    },
    [selected, updateClipLoop]
  );

  const onSeekTransport = useCallback(
    (beat: number) => {
      scheduler.setBeatFloat(beat);
    },
    [scheduler]
  );

  const onLengthChangeStore = useCallback(
    (beats: number) => {
      if (!selected) return;
      updateClipLength(selected.trackId, selected.sceneIndex, beats);
    },
    [selected, updateClipLength]
  );

  return (
    <section id="midi-clip" className="flex gap-2 h-60">
      {!selected || !clip ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Aucun clip sélectionné</p>
        </div>
      ) : (
        <>
          {/* Panneau d'infos à gauche */}
          <Card className="w-52 py-1 flex flex-col bg-neutral-900/50 border-neutral-800 overflow-y-auto">
            <CardContent className="p-2 pt-0 flex flex-col gap-2 text-xs">
              {/* Nom du clip */}
              <div className="space-y-0.5">
                <Label htmlFor="clip-name" className="text-[9px] text-muted-foreground sr-only">
                  Nom
                </Label>
                <Input
                  key={clipKey} // 👈 Force reset quand on change de clip
                  id="clip-name"
                  defaultValue={clip?.name ?? ""}
                  onChange={(e) => setLocalName(e.target.value)}
                  onBlur={() => selected && renameClip(selected.trackId, selected.sceneIndex, localName)}
                  className="h-6 text-[10px] bg-neutral-950/50 px-2"
                  placeholder="Nom du clip"
                />
              </div>

              <Separator className="bg-neutral-800 my-0.5" />

              {/* Loop + Position en ligne */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Button
                    size="sm"
                    variant={loop ? "default" : "outline"}
                    className="h-5 px-2 text-[9px]"
                    onClick={() => {
                      if (!selected) return;
                      if (loop) {
                        updateClipLoop(selected.trackId, selected.sceneIndex, null);
                      } else {
                        updateClipLoop(selected.trackId, selected.sceneIndex, { start: 0, end: 4 });
                      }
                    }}
                  >
                    Loop
                  </Button>
                </div>

                {/* Position + Longueur sur même ligne */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-0.5">
                    <Label htmlFor="position" className="text-[9px] text-muted-foreground">
                      Pos
                    </Label>
                    <Input
                      id="position"
                      type="number"
                      className="h-6 text-[10px] bg-neutral-950/50 px-1.5"
                      value={position}
                      step={0.25}
                      onChange={(e) => handlePositionChange(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label htmlFor="clip-length" className="text-[9px] text-muted-foreground">
                      Long
                    </Label>
                    <Input
                      id="clip-length"
                      type="number"
                      className="h-6 text-[10px] bg-neutral-950/50 px-1.5"
                      value={lengthBeats}
                      step={1}
                      onChange={(e) =>
                        selected && updateClipLength(selected.trackId, selected.sceneIndex, Number(e.target.value))
                      }
                    />
                  </div>
                </div>

                {/* Loop Start/End sur même ligne */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-0.5">
                    <Label htmlFor="loop-start" className="text-[9px] text-muted-foreground">
                      L.Start
                    </Label>
                    <Input
                      id="loop-start"
                      type="number"
                      className="h-6 text-[10px] bg-neutral-950/50 px-1.5"
                      value={loopStart}
                      step={0.25}
                      onChange={(e) => handleLoopStartChange(Number(e.target.value))}
                      disabled={!loop}
                    />
                  </div>

                  <div className="space-y-0.5">
                    <Label htmlFor="loop-end" className="text-[9px] text-muted-foreground">
                      L.End
                    </Label>
                    <Input
                      id="loop-end"
                      type="number"
                      className="h-6 text-[10px] bg-neutral-950/50 px-1.5"
                      value={loopEnd}
                      step={0.25}
                      onChange={(e) => handleLoopEndChange(Number(e.target.value))}
                      disabled={!loop}
                    />
                  </div>
                </div>
              </div>

              <Separator className="bg-neutral-800 my-0.5" />

              {/* Grid & Snap compact */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Select value={String(grid)} onValueChange={(v) => setGrid(Number(v) as GridValue)}>
                    <SelectTrigger id="grid-select" className="h-6 text-[10px] bg-neutral-950/50" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1/1</SelectItem>
                      <SelectItem value="2">1/2</SelectItem>
                      <SelectItem value="4">1/4</SelectItem>
                      <SelectItem value="8">1/8</SelectItem>
                      <SelectItem value="16">1/16</SelectItem>
                      <SelectItem value="32">1/32</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={snap ? "default" : "outline"}
                    className="h-5 px-2 text-[9px] shrink-0"
                    onClick={() => setSnap(!snap)}
                  >
                    Snap
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Zone principale : Piano Roll */}
          {midiClip ? (
            <Card className="flex-1 bg-neutral-900/50 border-neutral-800 overflow-hidden">
              <PianoRoll
                notes={(midiClip?.notes ?? []) as MidiNote[]}
                lengthBeats={lengthBeats}
                onChange={onNotesChange}
                onDraftChange={onDraftChange}
                loop={loop}
                onLoopChange={onLoopChange}
                position={position}
                getPlayheadBeat={localPlayheadBeat !== null ? () => localPlayheadBeat : undefined}
                followPlayhead={isPlaying}
                isPlaying={isPlaying}
                grid={grid}
                snap={snap}
                onSeek={onSeekTransport}
                onPositionChange={handlePositionChange}
                onLengthChange={onLengthChangeStore}
                trackId={selected?.trackId}
              />
            </Card>
          ) : (
            <Card className="flex-1 bg-neutral-900/50 border-neutral-800">
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Clip non MIDI</p>
              </div>
            </Card>
          )}
        </>
      )}
    </section>
  );
});
