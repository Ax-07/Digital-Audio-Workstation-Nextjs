// src/components/daw/controls/midi-clip-editor.tsx
"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useProjectStore } from "@/lib/stores/project.store";
import type { MidiNote } from "@/lib/audio/types";
import { useUiStore } from "@/lib/stores/ui.store";
import type { GridValue } from "@/lib/audio/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { PianoRoll } from "../clip-editor/pianoroll/PianoRoll";
import { DrumClipEditor } from "../clip-editor/drumroll/DrumClipEditor";
import { useDrumMachineStore } from "@/lib/stores/drum-machine.store";
import { getSessionPlayer } from "@/lib/audio/core/session-player";

export const MidiClipEditor = memo(function MidiClipEditor() {
  // UI store
  const selected = useUiStore((s) => s.selectedClip);
  const setSelectedTrack = useUiStore((s) => s.setSelectedTrack);
  const playingCells = useUiStore((s) => s.playingCells);
  const selectedTrackId = useUiStore((s) => s.selectedTrackId);

  // Project store
  const session = useProjectStore((s) => s.project.session);
  const renameClip = useProjectStore((s) => s.renameClip);
  const updateClipLoop = useProjectStore((s) => s.updateClipLoop);
  const updateClipLength = useProjectStore((s) => s.updateMidiClipLength);
  const updateMidiClipNotes = useProjectStore((s) => s.updateMidiClipNotes);
  const setClipStartOffset = useProjectStore((s) => s.setClipStartOffset);

  const [snap, setSnap] = useState<boolean>(true);
  const [grid, setGrid] = useState<GridValue>(16);

  const clip = useMemo(() => {
    if (!selected) return null;
    const sc = session?.scenes?.[selected.sceneIndex];
    if (!sc) return null;
    return sc.clips[selected.trackId] ?? null;
  }, [session, selected]);

  const isPlaying = useMemo(() => {
    if (!clip || !selected) return false;
    return !!playingCells[`${selected.trackId}:${selected.sceneIndex}`];
  }, [clip, playingCells, selected]);

  const midiClip = useMemo(() => {
    if (!clip) return null;
    if (clip.type !== "midi") return null;
    return clip;
  }, [clip]);

  const [localName, setLocalName] = useState(clip?.name ?? "");

  useEffect(() => {
    setLocalName(clip?.name ?? "");
  }, [clip?.name]);

  useEffect(() => {
    if (selected?.trackId != null && selectedTrackId !== selected.trackId) {
      setSelectedTrack(selected.trackId);
    }
  }, [selected?.trackId, selectedTrackId, setSelectedTrack]);

  const lengthBeats = midiClip?.lengthBeats ?? 4;

  const loopStart = clip?.loopStart ?? 0;
  const loopEnd = clip?.loopEnd ?? lengthBeats;
  const position = clip?.startOffset ?? loopStart;

  const loop =
    clip && clip.loopStart != null && clip.loopEnd != null
      ? { start: clip.loopStart, end: clip.loopEnd }
      : null;

  // Heuristique: si cette piste a un mapping drum, afficher DrumClipEditor
  const hasDrumMapping = useMemo(() => {
    if (!selected?.trackId) return false;
    const st = useDrumMachineStore.getState();
    return !!st.byTrack[selected.trackId];
  }, [selected?.trackId]);

  const handleLoopStartChange = useCallback(
    (value: number) => {
      if (!selected) return;
      updateClipLoop(selected.trackId, selected.sceneIndex, {
        start: value,
        end: loopEnd,
      });
    },
    [loopEnd, selected, updateClipLoop],
  );

  const handleLoopEndChange = useCallback(
    (value: number) => {
      if (!selected) return;
      updateClipLoop(selected.trackId, selected.sceneIndex, {
        start: loopStart,
        end: value,
      });
    },
    [loopStart, selected, updateClipLoop],
  );

  const handlePositionChange = useCallback(
    (value: number) => {
      if (!selected) return;
      const safe = Number.isFinite(value) ? value : 0;
      setClipStartOffset(selected.trackId, selected.sceneIndex, safe);
    },
    [selected, setClipStartOffset],
  );

  const onNotesChange = useCallback(
    (notes: MidiNote[]) => {
      if (!selected) return;
      updateMidiClipNotes(selected.trackId, selected.sceneIndex, notes);
    },
    [selected, updateMidiClipNotes],
  );

  const onDraftChange = useCallback(
    (_notes: MidiNote[]) => {
      if (!selected) return;
      // Optionnel : preview live
      try {
        getSessionPlayer().applyMidiDraft(
          selected.trackId,
          selected.sceneIndex,
          _notes,
        );
      } catch {}
    },
    [selected],
  );

  const onLoopChange = useCallback(
    (next: { start: number; end: number } | null) => {
      if (!selected) return;
      updateClipLoop(selected.trackId, selected.sceneIndex, next);
    },
    [selected, updateClipLoop],
  );

  const onLengthChangeStore = useCallback(
    (beats: number) => {
      if (!selected) return;
      updateClipLength(selected.trackId, selected.sceneIndex, beats);
    },
    [selected, updateClipLength],
  );



  return (
    <section id="midi-clip" className="flex gap-2 h-60">
      {!selected || !clip ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">
            Aucun clip sélectionné
          </p>
        </div>
      ) : (
        <>
          {hasDrumMapping ? (
            // Piste drums: on affiche uniquement l'éditeur de drum sans panneau gauche.
            midiClip ? (
              <DrumClipEditor />
            ) : (
              <Card className="flex-1 bg-neutral-900/50 border-neutral-800">
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Clip non MIDI</p>
                </div>
              </Card>
            )
          ) : (
            // Piste non drums: panneau gauche + piano roll
            <>
              <Card className="w-52 py-1 flex flex-col bg-neutral-900/50 border-neutral-800 overflow-y-auto">
                <CardContent className="p-2 pt-0 flex flex-col gap-2 text-xs">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="clip-name"
                      className="text-[9px] text-muted-foreground sr-only"
                    >
                      Nom
                    </Label>
                    <Input
                      id="clip-name"
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      onBlur={() =>
                        selected &&
                        renameClip(selected.trackId, selected.sceneIndex, localName)
                      }
                      className="h-6 text-[10px] bg-neutral-950/50 px-2"
                      placeholder="Nom du clip"
                    />
                  </div>
                  <Separator className="bg-neutral-800 my-0.5" />
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Button
                        size="sm"
                        variant={loop ? "default" : "outline"}
                        className="h-5 px-2 text-[9px]"
                        onClick={() => {
                          if (!selected) return;
                          if (loop) {
                            updateClipLoop(
                              selected.trackId,
                              selected.sceneIndex,
                              null,
                            );
                          } else {
                            updateClipLoop(
                              selected.trackId,
                              selected.sceneIndex,
                              { start: 0, end: 4 },
                            );
                          }
                        }}
                      >
                        Loop
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label htmlFor="position" className="text-[9px] text-muted-foreground">Pos</Label>
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
                        <Label htmlFor="clip-length" className="text-[9px] text-muted-foreground">Long</Label>
                        <Input
                          id="clip-length"
                          type="number"
                          className="h-6 text-[10px] bg-neutral-950/50 px-1.5"
                          value={lengthBeats}
                          step={1}
                          onChange={(e) =>
                            selected &&
                            updateClipLength(
                              selected.trackId,
                              selected.sceneIndex,
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label htmlFor="loop-start" className="text-[9px] text-muted-foreground">L.Start</Label>
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
                        <Label htmlFor="loop-end" className="text-[9px] text-muted-foreground">L.End</Label>
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
                    <Separator className="bg-neutral-800 my-0.5" />
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
                        onClick={() => setSnap((prev) => !prev)}
                      >
                        Snap
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {midiClip ? (
                <Card className="flex-1 bg-neutral-900/50 border-neutral-800 overflow-hidden">
                  <PianoRoll
                    notes={midiClip.notes as MidiNote[]}
                    lengthBeats={lengthBeats}
                    onChange={onNotesChange}
                    onDraftChange={onDraftChange}
                    loop={loop}
                    onLoopChange={onLoopChange}
                    position={position}
                    onPositionChange={handlePositionChange}
                    onLengthChange={onLengthChangeStore}
                    isPlaying={isPlaying}
                    followPlayhead={true}
                    grid={grid}
                    snap={snap}
                    trackId={selected.trackId}
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
        </>
      )}
    </section>
  );
});
