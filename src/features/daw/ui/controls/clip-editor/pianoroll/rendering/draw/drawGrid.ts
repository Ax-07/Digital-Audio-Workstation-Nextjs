// src/components/daw/controls/clip-editor/draw/drawGrid.ts

export type GridDrawOptions = {
  wCss: number;
  hCss: number;
  keyWidth: number;
  scrollX: number;
  pxPerBeat: number;
  grid: number;
  timeToX: (beat: number) => number;
  pxPerSemitone: number;
  scrollY: number; // vertical scroll in pixels
  minPitch: number;
  maxPitch: number;
  pitchToY: (pitch: number) => number; // local (already translated) pitch→y
};

export function drawGrid(ctx: CanvasRenderingContext2D, opts: GridDrawOptions) {
  const { wCss, hCss, keyWidth, pxPerBeat, grid, timeToX, pxPerSemitone, minPitch, maxPitch, pitchToY } = opts;

  ctx.save();

  // Background
  ctx.fillStyle = "#181818";
  ctx.fillRect(0, 0, wCss - keyWidth, hCss);

  // Vertical grid lines (time)
  const step = 1 / grid;
  const maxBeats = Math.ceil((wCss + opts.scrollX) / pxPerBeat);

  for (let beat = 0; beat <= maxBeats; beat += step) {
    const x = timeToX(beat) - keyWidth;
    if (x < 0) continue;
    if (x > wCss - keyWidth) break;

    // Major lines every 4 beats (1 bar)
    const isMajor = Math.abs(beat % 4) < 0.001;
    // Beat lines every 1 beat
    const isBeat = Math.abs(beat % 1) < 0.001;

    let color = "#262626"; // subdivision
    if (isMajor) color = "#3f3f46"; // bar
    else if (isBeat) color = "#303030"; // beat

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, hCss);
    ctx.stroke();
  }

  // Horizontal pitch lines using pitchToY for perfect alignment with notes & keyboard.
  for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
    const rowTop = pitchToY(pitch); // already local (global - contentY)
    // Only draw if visible.
    if (rowTop + pxPerSemitone < 0 || rowTop > hCss) continue;
    ctx.strokeStyle = "#202028";
    ctx.beginPath();
    ctx.moveTo(0, rowTop + 0.5);
    ctx.lineTo(wCss - keyWidth, rowTop + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}
