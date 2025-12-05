// src/components/daw/controls/clip-editor/pianoroll/draw/drawLoopBar.ts

export type LoopRange = { start: number; end: number } | null | undefined;

export type TopBarDrawOptions = {
  wCss: number;
  keyWidth: number;
  topBarHeight: number;
  timeToX: (beat: number) => number;
  activeLoop: LoopRange;
  positionStart: number;
  clipLength: number;
};

type LoopBarDrawOptions = {
  wCss: number;
  keyWidth: number;
  barHeight: number;
  timeToX: (beat: number) => number;
  activeLoop: LoopRange;
};
type PositionBarDrawOptions = {
  wCss: number;
  keyWidth: number;
  barHeight: number;
  timeToX: (beat: number) => number;
  positionStart: number;
};
type ClipLengthBarDrawOptions = {
  wCss: number;
  keyWidth: number;
  barHeight: number;
  timeToX: (beat: number) => number;
  clipLength: number;
};

export function drawTopBar(ctx: CanvasRenderingContext2D, opts: TopBarDrawOptions) {
  const { wCss, keyWidth, topBarHeight, timeToX, activeLoop, positionStart, clipLength } = opts;

  const barHeight = Math.max(1, Math.floor(topBarHeight / 3));
  ctx.save();
  // Background (inclut zone clavier) pour cohérence visuelle
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(keyWidth, 0, wCss - keyWidth, topBarHeight);

  // Séparateur inférieur
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(0, topBarHeight);
  ctx.lineTo(wCss, topBarHeight);
  ctx.stroke();

  // Clip length (tier 0)
  ctx.save();
  ctx.translate(keyWidth, 0);
  drawClipLengthBar(ctx, { wCss, keyWidth, barHeight, timeToX, clipLength });
  ctx.restore();

  // Position (tier 1)
  ctx.save();
  ctx.translate(keyWidth, barHeight);
  drawPositionBar(ctx, { wCss, keyWidth, barHeight, timeToX, positionStart });
  ctx.restore();

  // Loop (tier 2)
  ctx.save();
  ctx.translate(keyWidth, barHeight * 2);
  drawLoopBar(ctx, { wCss, keyWidth, barHeight, timeToX, activeLoop });
  ctx.restore();

  ctx.restore();
}

function drawLoopBar(ctx: CanvasRenderingContext2D, opts: LoopBarDrawOptions) {
  const { keyWidth, barHeight, timeToX, activeLoop } = opts;
  // Fond subtil spécifique à cette tier (optionnel)
  // ctx.fillStyle = "rgba(255,255,255,0.03)";
  // ctx.fillRect(0, 0, (wCss ?? 0) - keyWidth, barHeight);
  if (activeLoop && activeLoop.end > activeLoop.start) {
    const xLoopStart = timeToX(activeLoop.start) - keyWidth;
    const xLoopEnd = timeToX(activeLoop.end) - keyWidth;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(xLoopStart, 0, Math.max(0, xLoopEnd - xLoopStart), barHeight);
    ctx.fillStyle = "#FFD02F";
    ctx.fillRect(xLoopStart - 2, 0, 4, barHeight);
    ctx.fillRect(xLoopEnd - 2, 0, 4, barHeight);
    ctx.fillStyle = "rgba(255,208,47,0.12)";
    ctx.fillRect(xLoopStart, 0, Math.max(0, xLoopEnd - xLoopStart), barHeight);
  }
}

function drawPositionBar(ctx: CanvasRenderingContext2D, opts: PositionBarDrawOptions) {
  const { keyWidth, barHeight, timeToX, positionStart } = opts;
  const px = timeToX(positionStart) - keyWidth;
  ctx.fillStyle = "rgba(255,0,0,0.1)";
  ctx.fillRect(px, 0, 2, barHeight);
  ctx.strokeStyle = "rgba(255,0,0,0.9)";
  ctx.beginPath();
  ctx.moveTo(px + 0.5, 0);
  ctx.lineTo(px + 0.5, barHeight);
  ctx.stroke();
}

function drawClipLengthBar(ctx: CanvasRenderingContext2D, opts: ClipLengthBarDrawOptions) {
  const { keyWidth, barHeight, timeToX, clipLength } = opts;
  const clipLengthEnd = timeToX(clipLength) - keyWidth;
  ctx.fillStyle = "rgba(0,255,0,0.1)";
  ctx.fillRect(0, 0, clipLengthEnd, barHeight);
  ctx.strokeStyle = "rgba(0,255,0,0.9)";
  ctx.beginPath();
  ctx.moveTo(clipLengthEnd + 0.5, 0);
  ctx.lineTo(clipLengthEnd + 0.5, barHeight);
  ctx.stroke();
}