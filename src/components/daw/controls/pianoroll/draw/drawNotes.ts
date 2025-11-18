// src/components/daw/controls/pianoroll/draw/drawNotes.ts

import type { MidiNote } from "@/lib/audio/types";

type DraftNote = MidiNote & { __id: number };

export function drawNotes(
  ctx: CanvasRenderingContext2D,
  opts: {
    notes: ReadonlyArray<DraftNote>;
    selectedIndices?: ReadonlyArray<number> | ReadonlySet<number> | null;
    hoverIndex: number | null;
    keyWidth: number;
    timeToX: (b: number) => number;
    pitchToY: (p: number) => number;
    pxPerBeat: number;
    pxPerSemitone: number;
  }
) {
  const { notes, selectedIndices, hoverIndex, keyWidth, timeToX, pitchToY, pxPerBeat, pxPerSemitone } = opts;

  let selectedSet: ReadonlySet<number> | null = null;
  if (selectedIndices) {
    selectedSet = selectedIndices instanceof Set ? selectedIndices : new Set(selectedIndices);
  }

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const x = timeToX(n.time);
    const y = pitchToY(n.pitch) + 1;
    const w = Math.max(4, n.duration * pxPerBeat - 2);
    const h = Math.max(5, pxPerSemitone - 3);

    const isSelected = selectedSet ? selectedSet.has(i) : false;
    const isHovered = i === hoverIndex;

    let base = "#FBBF24";
    let border = "#E5A413";
    if (isSelected) {
      base = "#FFD02F";
      border = "#FFE58F";
    } else if (isHovered) {
      base = "#FACC15";
      border = "#FDE68A";
    }

    ctx.fillStyle = base;
    ctx.fillRect(x - keyWidth, y, w, h);

    ctx.strokeStyle = border;
    ctx.strokeRect(x - keyWidth + 0.5, y + 0.5, w - 1, h - 1);

    // resize handle
    ctx.fillStyle = "#FFF7D1";
    ctx.fillRect(x - keyWidth + w - 3, y + 1, 2, h - 2);
  }
}
