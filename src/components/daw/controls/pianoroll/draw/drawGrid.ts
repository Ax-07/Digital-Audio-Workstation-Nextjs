// src/components/daw/controls/pianoroll/draw/drawGrid.ts

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  opts: {
    wCss: number;
    hCss: number;
    keyWidth: number;
    scrollX: number;
    pxPerBeat: number;
    grid: 4 | 8 | 12 | 16 | 24 | 32;
    timeToX: (b: number) => number;
  }
) {
  const { wCss, hCss, keyWidth, scrollX, pxPerBeat, grid, timeToX } = opts;
  const beatsVisible = Math.ceil((wCss + scrollX) / pxPerBeat);
  const firstBeat = Math.floor(scrollX / pxPerBeat);

  // Alternating bar background (slight tint every other bar)
  const firstBar = Math.floor(firstBeat / 4) * 4;
  const lastBar = Math.ceil(beatsVisible / 4) * 4;
  for (let b = firstBar; b <= lastBar; b += 4) {
    const x0 = timeToX(b) - keyWidth;
    const x1 = timeToX(b + 4) - keyWidth;
    if (Math.floor(b / 4) % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      ctx.fillRect(x0, 0, x1 - x0, hCss);
    }
  }

  for (let b = firstBeat; b <= beatsVisible; b++) {
    const x = timeToX(b);
    const isBar = b % 4 === 0;

    ctx.beginPath();
    ctx.strokeStyle = isBar ? "#555555" : "#303030";
    ctx.moveTo(x - keyWidth + 0.5, 0);
    ctx.lineTo(x - keyWidth + 0.5, hCss);
    ctx.stroke();

    // Dynamic subdivisions based on zoom level
    // At low zoom, show only beats; medium zoom shows 1/8; high zoom shows 1/16
    const maxSubdiv = pxPerBeat >= 96 ? grid / 4 : pxPerBeat >= 48 ? Math.min(grid / 4, 2) : 1;
    const step = 1 / maxSubdiv;
    for (let s = 1; s < maxSubdiv; s++) {
      const xs = timeToX(b + s * step);
      ctx.beginPath();
      ctx.strokeStyle = maxSubdiv > 2 ? "#262626" : "#2c2c2c";
      ctx.moveTo(xs - keyWidth + 0.5, 0);
      ctx.lineTo(xs - keyWidth + 0.5, hCss);
      ctx.stroke();
    }

    if (isBar) {
      const barIndex = b / 4 + 1;
      ctx.fillStyle = "#a3a3a3";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(`${barIndex}`, x - keyWidth + 3, 2);
    }
  }
}
