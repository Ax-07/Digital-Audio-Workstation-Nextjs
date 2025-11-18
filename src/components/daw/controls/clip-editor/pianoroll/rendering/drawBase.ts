// src/components/daw/controls/clip-editor/pianoroll/rendering/drawBase.ts

import { drawKeyboard } from "../draw/drawKeyboard";
import { drawGrid } from "../draw/drawGrid";
import { drawNotes } from "../draw/drawNotes";
import type { DraftNote } from "../types";
import type { RenderContext, DrawState } from "./renderContext";

export function drawBaseCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  notes: DraftNote[],
  renderCtx: RenderContext,
  drawState: DrawState,
  culledBuffer: DraftNote[]
): { visible: number; total: number } {
  const W = canvas.width;
  const H = canvas.height;
  const wCss = W / renderCtx.dpr;
  const hCss = H / renderCtx.dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.scale(renderCtx.dpr, renderCtx.dpr);

  // Background
  ctx.fillStyle = "#181818";
  ctx.fillRect(0, 0, wCss, hCss);

  // Keyboard gutter
  drawKeyboard(ctx, {
    wCss,
    hCss,
    keyWidth: renderCtx.keyWidth,
    scrollY: renderCtx.scrollY,
    pxPerSemitone: renderCtx.pxPerSemitone,
    minPitch: renderCtx.minPitch,
    maxPitch: renderCtx.maxPitch,
    pitchToY: renderCtx.pitchToY,
    pressedPitch: drawState.pressedPitch,
    hoverPitch: drawState.hoverPitch,
  });

  // Grid + notes area
  ctx.save();
  ctx.translate(renderCtx.keyWidth, 0);

  drawGrid(ctx, {
    wCss,
    hCss,
    keyWidth: renderCtx.keyWidth,
    scrollX: renderCtx.scrollX,
    pxPerBeat: renderCtx.pxPerBeat,
    grid: renderCtx.grid,
    timeToX: renderCtx.timeToX,
  });

  // Loop shading (top band)
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0, 0, wCss - renderCtx.keyWidth, renderCtx.loopBarHeight);
  ctx.strokeStyle = "#404040";
  ctx.beginPath();
  ctx.moveTo(0, renderCtx.loopBarHeight + 0.5);
  ctx.lineTo(wCss - renderCtx.keyWidth, renderCtx.loopBarHeight + 0.5);
  ctx.stroke();

  // Loop region
  const activeLoop = renderCtx.loopState ?? renderCtx.loop;
  if (activeLoop && activeLoop.end > activeLoop.start) {
    const lx0 = renderCtx.timeToX(activeLoop.start) - renderCtx.keyWidth;
    const lx1 = renderCtx.timeToX(activeLoop.end) - renderCtx.keyWidth;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(lx0, 0, lx1 - lx0, hCss);
    // Loop handles
    ctx.fillStyle = "#FFD02F";
    ctx.fillRect(lx0 - 2, 0, 4, renderCtx.loopBarHeight);
    ctx.fillRect(lx1 - 2, 0, 4, renderCtx.loopBarHeight);
    ctx.fillStyle = "rgba(255,208,47,0.12)";
    ctx.fillRect(lx0, 0, Math.max(0, lx1 - lx0), renderCtx.loopBarHeight);
  }

  // Viewport culling
  const x0Beat = Math.max(0, renderCtx.xToTime(renderCtx.keyWidth));
  const x1Beat = renderCtx.xToTime(wCss);
  const y0Pitch = renderCtx.yToPitch(0);
  const y1Pitch = renderCtx.yToPitch(hCss);

  culledBuffer.length = 0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const nEnd = n.time + n.duration;
    if (nEnd < x0Beat || n.time > x1Beat) continue;
    if (n.pitch < y1Pitch || n.pitch > y0Pitch) continue;
    culledBuffer.push(n);
  }

  drawNotes(ctx, {
    notes: culledBuffer,
    selectedIndices: renderCtx.selected,
    hoverIndex: drawState.hoverNote,
    keyWidth: renderCtx.keyWidth,
    timeToX: renderCtx.timeToX,
    pitchToY: renderCtx.pitchToY,
    pxPerBeat: renderCtx.pxPerBeat,
    pxPerSemitone: renderCtx.pxPerSemitone,
  });

  // Ghost note preview
  if (!drawState.pointerStart && drawState.ghost) {
    const g = drawState.ghost;
    const gx = renderCtx.timeToX(g.time);
    const gy = renderCtx.pitchToY(g.pitch);
    const gw = renderCtx.pxPerBeat / renderCtx.grid;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#7aa2ff";
    ctx.fillRect(gx - renderCtx.keyWidth, gy + 2, Math.max(8, gw - 2), Math.max(4, renderCtx.pxPerSemitone - 4));
    ctx.globalAlpha = 1;
  }

  // Rectangle selection
  if (drawState.rectangleSelection) {
    const m = drawState.rectangleSelection;
    const rx = Math.min(m.x0, m.x1) - renderCtx.keyWidth;
    const ry = Math.min(m.y0, m.y1);
    const rw = Math.abs(m.x1 - m.x0);
    const rh = Math.abs(m.y1 - m.y0);
    ctx.fillStyle = "rgba(255,208,47,0.1)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = "rgba(255,208,47,0.6)";
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(0, rw - 1), Math.max(0, rh - 1));
    ctx.setLineDash([]);
  }

  // Drag guides
  if (drawState.dragGuide) {
    const g = drawState.dragGuide;
    const vx = g.xCss - renderCtx.keyWidth + 0.5;
    const hy = g.yCss + 0.5;
    ctx.save();
    ctx.strokeStyle = "rgba(255,208,47,0.4)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(vx, 0);
    ctx.lineTo(vx, hCss);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(wCss - renderCtx.keyWidth, hy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#FFD02F";
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    const lblTime = g.beat.toFixed(3);
    const lblPitch = String(g.pitch);
    ctx.fillText(lblTime, Math.max(0, Math.min(wCss - renderCtx.keyWidth - 40, vx + 6)), Math.max(10, hy - 6));
    ctx.fillText(lblPitch, Math.max(0, Math.min(wCss - renderCtx.keyWidth - 30, vx + 6)), Math.min(hCss - 2, hy + 12));
    ctx.restore();
  }

  ctx.restore();

  return { visible: culledBuffer.length, total: notes.length };
}
