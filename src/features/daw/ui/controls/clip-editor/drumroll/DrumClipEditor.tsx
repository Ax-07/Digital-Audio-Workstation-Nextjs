"use client";

import { memo, useCallback, useMemo, useState, useEffect } from "react";
import { useUiStore } from "@/features/daw/state/ui.store";
import { useProjectStore } from "@/features/daw/state/project.store";
import { DrumRoll } from "./DrumRoll";
import { GridValue, MidiNote } from "@/core/audio-engine/types";
import { AudioEngine } from "@/core/audio-engine/core/audio-engine";
import { getSessionPlayer } from "@/core/audio-engine/core/session-player";
import { Card, CardContent } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { buildMetalTuning, buildRockTuning } from "@/core/audio-engine/sources/drum-machine/tuning-presets";
import { drumMachine } from "@/core/audio-engine/sources/drum-machine/drum-machine";


export const DrumClipEditor = memo(function DrumClipEditor() {
  // UI selection courante (trackId, sceneIndex)
  const selected = useUiStore((s) => s.selectedClip);
  // const playingCells = useUiStore((s) => s.playingCells);

  // Projet (clip courant)
  const session = useProjectStore((s) => s.project.session);
  const renameClip = useProjectStore((s) => s.renameClip);
  const updateClipLoop = useProjectStore((s) => s.updateClipLoop);
  const updateClipLength = useProjectStore((s) => s.updateMidiClipLength);
  const updateMidiClipNotes = useProjectStore((s) => s.updateMidiClipNotes);
  const setClipStartOffset = useProjectStore((s) => s.setClipStartOffset);

  const [grid, setGrid] = useState<GridValue>(16);
const [tuningValue, setTuningValue] = useState<string | undefined>(undefined);

  const clip = useMemo(() => {
    if (!selected) return null;
    const sc = session?.scenes?.[selected.sceneIndex];
    if (!sc) return null;
    return sc.clips[selected.trackId] ?? null;
  }, [session, selected]);

  const midiClip = useMemo(() => (clip && clip.type === "midi" ? clip : null), [clip]);
  const lengthBeats = midiClip?.lengthBeats ?? 4;
  const position = clip?.startOffset ?? clip?.loopStart ?? 0;
  const loop =
    clip && clip.loopStart != null && clip.loopEnd != null ? { start: clip.loopStart, end: clip.loopEnd } : null;

  const [localName, setLocalName] = useState(clip?.name ?? "");

  // Sync nom local (async to avoid sync setState-in-effect warning)
  useEffect(() => {
    const name = clip?.name ?? "";
    // schedule update to next tick to avoid cascading renders in the current phase
    const t = window.setTimeout(() => setLocalName(name), 0);
    return () => clearTimeout(t);
  }, [clip?.name]);

  const onNotesChange = useCallback(
    (notes: MidiNote[]) => {
      if (!selected) return;
      updateMidiClipNotes(selected.trackId, selected.sceneIndex, notes);
    },
    [selected, updateMidiClipNotes]
  );

  const onLengthChange = useCallback(
    (beats: number) => {
      if (!selected) return;
      updateClipLength(selected.trackId, selected.sceneIndex, beats);
    },
    [selected, updateClipLength]
  );

  const handleLoopStartChange = useCallback(
    (value: number) => {
      if (!selected || !clip) return;
      const end = clip.loopEnd ?? lengthBeats;
      updateClipLoop(selected.trackId, selected.sceneIndex, { start: value, end });
    },
    [clip, lengthBeats, selected, updateClipLoop]
  );

  const handleLoopEndChange = useCallback(
    (value: number) => {
      if (!selected || !clip) return;
      const start = clip.loopStart ?? 0;
      updateClipLoop(selected.trackId, selected.sceneIndex, { start, end: value });
    },
    [clip, selected, updateClipLoop]
  );

  const handlePositionChange = useCallback(
    (value: number) => {
      if (!selected) return;
      const safe = Number.isFinite(value) ? value : 0;
      setClipStartOffset(selected.trackId, selected.sceneIndex, safe);
    },
    [selected, setClipStartOffset]
  );

  const selectedTrackId = selected?.trackId;

  const preview = useCallback(
    async (pitch: number) => {
      try {
        if (!selectedTrackId) return;
        const eng = AudioEngine.ensure();
        await eng.init();
        await eng.resume();
        const sp = getSessionPlayer();
        const mt = await sp.getMidiTrackForPreview(selectedTrackId);
        mt.noteOn(pitch, 0.9, false);
      } catch {}
    },
    [selectedTrackId]
  );

  if (!selected || !clip) {
    return (
      <section className="flex gap-2 h-60">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Aucun clip sélectionné</p>
        </div>
      </section>
    );
  }

  if (!midiClip) {
    return (
      <section className="flex gap-2 h-60">
        <Card className="flex-1 bg-neutral-900/50 border-neutral-800">
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Clip non MIDI</p>
          </div>
        </Card>
      </section>
    );
  }

  // const isPlaying = !!playingCells[`${selected.trackId}:${selected.sceneIndex}`];

  return (
    <section id="drum-clip" className="flex flex-1 gap-2 h-60">
      {/* Panneau gauche (mêmes contrôles essentiels que l’éditeur MIDI) */}
      <Card className="w-52 py-1 flex flex-col bg-neutral-900/50 border-neutral-800 overflow-y-auto">
        <CardContent className="p-2 pt-0 flex flex-col gap-2 text-xs">
          <div className="space-y-0.5">
            <Label htmlFor="clip-name" className="text-[9px] text-muted-foreground sr-only">
              Nom
            </Label>
            <Input
              id="clip-name"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => renameClip(selected.trackId, selected.sceneIndex, localName)}
              className="h-6 text-[10px] bg-neutral-950/50 px-2"
              placeholder="Nom du clip"
            />
          </div>

          <Separator className="bg-neutral-800 my-0.5" />

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
                onChange={(e) => onLengthChange(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label htmlFor="loop-start" className="text-[9px] text-muted-foreground">
                L.Start
              </Label>
              <Input
                id="loop-start"
                type="number"
                className="h-6 text-[10px] bg-neutral-950/50 px-1.5"
                value={loop?.start ?? 0}
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
                value={loop?.end ?? lengthBeats}
                step={0.25}
                onChange={(e) => handleLoopEndChange(Number(e.target.value))}
                disabled={!loop}
              />
            </div>
          </div>

          <Separator className="bg-neutral-800 my-0.5" />

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Select value={String(grid)} onValueChange={(v) => setGrid(Number(v) as GridValue)}>
                <SelectTrigger id="grid-select" className="h-6 text-[10px] bg-neutral-950/50" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">1/4</SelectItem>
                  <SelectItem value="8">1/8</SelectItem>
                  <SelectItem value="12">1/8T</SelectItem>
                  <SelectItem value="16">1/16</SelectItem>
                  <SelectItem value="24">1/16T</SelectItem>
                  <SelectItem value="32">1/32</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={loop ? "default" : "outline"}
                className="h-5 px-2 text-[9px] shrink-0"
                onClick={() =>
                  updateClipLoop(selected.trackId, selected.sceneIndex, loop ? null : { start: 0, end: 4 })
                }
              >
                Loop
              </Button>
            </div>
            <Select
              value={tuningValue}
              onValueChange={(v) => {
                if (!selected) return;

                // v du genre "rock:48" ou "metal:50"
                const [mode, noteStr] = v.split(":");
                const root = Number(noteStr);

                try {
                  applyTuning(selected.trackId, root, mode === "metal" ? "metal" : "rock");
                } catch (e) {
                  console.error("Error applying tuning", e);
                }

                setTuningValue(undefined); // reset placeholder
              }}
            >
              <SelectTrigger id="tuning-presets-select" className="h-6 text-[10px] bg-neutral-950/50">
                <SelectValue placeholder="Tuning Presets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rock:48">Rock – C (Do)</SelectItem>
                <SelectItem value="rock:50">Rock – D (Ré)</SelectItem>
                <SelectItem value="rock:55">Rock – G (Sol)</SelectItem>
                <SelectItem value="metal:48">Metal – C (Do)</SelectItem>
                <SelectItem value="metal:50">Metal – D (Ré)</SelectItem>
                <SelectItem value="metal:55">Metal – G (Sol)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Zone principale : Drum Roll grid */}
      <Card className="w-full bg-neutral-900/50 border-neutral-800 overflow-hidden">
        <DrumRoll
          notes={midiClip.notes as MidiNote[]}
          lengthBeats={lengthBeats}
          grid={grid}
          onChange={onNotesChange}
          onPreview={preview}
        />
      </Card>
    </section>
  );
});

type TuningMode = "rock" | "metal";

function applyTuning(trackId: string, rootNote: number, mode: TuningMode) {
  const patch = mode === "metal" ? buildMetalTuning(rootNote) : buildRockTuning(rootNote);

  drumMachine.setTrackPreset(trackId, patch);
}
