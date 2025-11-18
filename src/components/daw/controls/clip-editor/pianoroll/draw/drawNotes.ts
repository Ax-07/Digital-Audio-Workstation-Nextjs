// src/components/daw/controls/clip-editor/draw/drawNotes.ts

import type { DraftNote } from "../hit";

export type NotesDrawOptions = {
  notes: ReadonlyArray<DraftNote>;
  selectedIndices: number[];
  hoverIndex: number | null;
  keyWidth: number;
  timeToX: (beat: number) => number;
  pitchToY: (pitch: number) => number;
  pxPerBeat: number;
  pxPerSemitone: number;
};

export function drawNotes(ctx: CanvasRenderingContext2D, opts: NotesDrawOptions) {
  const { notes, selectedIndices, hoverIndex, timeToX, pitchToY, pxPerSemitone, keyWidth } = opts;
  const selSet = new Set(selectedIndices);

  ctx.save();

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const isSelected = selSet.has(i);
    const isHovered = i === hoverIndex;

    const x = timeToX(n.time) - keyWidth;
    const y = pitchToY(n.pitch);
    const w = timeToX(n.time + n.duration) - timeToX(n.time);
    const h = pxPerSemitone;

    // Colors based on selection and hover
    let fill = "#FBBF24"; // default orange
    let stroke = "#E5A413";

    if (isSelected) {
      fill = "#FFD02F"; // bright yellow
      stroke = "#FFE58F";
    } else if (isHovered) {
      fill = "#FACC15";
      stroke = "#FCD34D";
    }

    // Draw note body
    ctx.fillStyle = fill;
    ctx.fillRect(x, y + 2, Math.max(w, 4), h - 4);

    // Draw border
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 2.5, Math.max(w, 4) - 1, h - 5);

    // Velocity indicator (subtle bar at bottom)
    const velH = (n.velocity ?? 0.8) * 3;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(x, y + h - velH - 2, Math.max(w, 4), velH);
  }

  ctx.restore();
}
