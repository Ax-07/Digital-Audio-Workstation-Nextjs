// src/components/daw/controls/clip-editor/draw/drawNotes.ts

import type { DraftNote } from "../../types";

export type NotesDrawOptions = {
  notes: ReadonlyArray<DraftNote>;
  selectedSet: ReadonlySet<number>;
  hoverIndex: number | null;
  keyWidth: number;
  timeToX: (beat: number) => number;
  pitchToY: (pitch: number) => number;
  pxPerBeat: number;
  pxPerSemitone: number;
};

export function drawNotes(ctx: CanvasRenderingContext2D, opts: NotesDrawOptions) {
  const { notes, selectedSet, hoverIndex, timeToX, pitchToY, pxPerSemitone, keyWidth } = opts;

  ctx.save();

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const isSelected = selectedSet.has(i);
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

    // Align note exactly to pitch row top; keep minimal 1px inset for crisp stroke
    const noteW = Math.max(w, 4);
    const insetTop = 0; // could be 1 if slight padding desired
    const insetBottom = 0;
    const drawY = y + insetTop;
    const drawH = h - insetTop - insetBottom;

    ctx.fillStyle = fill;
    ctx.fillRect(x, drawY, noteW, drawH);

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, drawY + 0.5, noteW - 1, drawH - 1);

    // Velocity indicator (small bar at bottom inside the note)
    const velH = (n.velocity ?? 0.8) * 3;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(x, drawY + drawH - velH - 1, noteW, velH);
  }

  ctx.restore();
}
