// src/components/daw/controls/clip-editor/pianoroll/rendering/drawBase.ts

import { drawKeyboard } from "./draw/drawKeyboard";
import { drawGrid } from "./draw/drawGrid";
import { drawNotes } from "./draw/drawNotes";
import { drawTopBar } from "./draw/drawTopBar";
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
  const W = canvas.width;                   // Largeur du canvas en pixels
  const H = canvas.height;                  // Hauteur du canvas en pixels
  const wCss = W / renderCtx.dpr;           // Largeur en CSS pixels ( dpr: device pixel ratio )
  const hCss = H / renderCtx.dpr;           // Hauteur en CSS pixels
  const contentY = renderCtx.topBarHeight;  // Hauteur de la barre supérieure en CSS pixels
  const contentH = hCss - contentY;         // Hauteur de la zone de contenu (keyboard + grid) en CSS pixels

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.scale(renderCtx.dpr, renderCtx.dpr);

  // Background
  ctx.fillStyle = "#181818";
  ctx.fillRect(0, 0, wCss, hCss);

  // Top bar (isolated draw)
  drawTopBar(ctx, {
    wCss,
    keyWidth: renderCtx.keyWidth,
    topBarHeight: renderCtx.topBarHeight,
    timeToX: renderCtx.timeToX,
    activeLoop: renderCtx.loopState ?? renderCtx.loop,
    positionStart: renderCtx.positionStart,
    clipLength: renderCtx.lengthBeats,
  });

  ctx.save();
  // Keyboard gutter (below loop bar)
  ctx.beginPath();
  ctx.rect(0, contentY, renderCtx.keyWidth, contentH);
  ctx.clip();
  ctx.translate(0, contentY);
  // Keyboard gutter
  drawKeyboard(ctx, {
    wCss,
    hCss: contentH,
    keyWidth: renderCtx.keyWidth,
    scrollY: renderCtx.scrollY,
    pxPerSemitone: renderCtx.pxPerSemitone,
    minPitch: renderCtx.minPitch,
    maxPitch: renderCtx.maxPitch,
    // Translate applied: need local coordinate (global - contentY)
    pitchToY: (p: number) => renderCtx.pitchToY(p) - contentY,
    pressedPitch: drawState.pressedPitch,
    hoverPitch: drawState.hoverPitch,
  });
  ctx.restore();

  // Grid + notes area
  ctx.save();
  ctx.translate(renderCtx.keyWidth, contentY);

  drawGrid(ctx, {
    wCss,
    hCss: contentH,
    keyWidth: renderCtx.keyWidth,
    scrollX: renderCtx.scrollX,
    scrollY: renderCtx.scrollY,
    pxPerBeat: renderCtx.pxPerBeat,
    grid: renderCtx.grid,
    timeToX: renderCtx.timeToX,
    pxPerSemitone: renderCtx.pxPerSemitone,
    minPitch: renderCtx.minPitch,
    maxPitch: renderCtx.maxPitch,
    pitchToY: (p: number) => renderCtx.pitchToY(p) - contentY,
  });

  // Full-height loop highlight inside grid (draw AFTER grid background so it is visible)
  const activeLoop = renderCtx.loopState ?? renderCtx.loop;
  if (activeLoop && activeLoop.end > activeLoop.start) {
    const gx0 = renderCtx.timeToX(activeLoop.start) - renderCtx.keyWidth; // local grid coords
    const gx1 = renderCtx.timeToX(activeLoop.end) - renderCtx.keyWidth;
    const gw = Math.max(0, gx1 - gx0);
    // base subtle band
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(gx0, 0, gw, contentH);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,208,47,1)";
    ctx.moveTo(gx0, 0);
    ctx.lineTo(gx0, contentH);
    ctx.moveTo(gx0 + gw, 0);
    ctx.lineTo(gx0 + gw, contentH);
    ctx.stroke();
    ctx.restore();
  }

  // Full-height position line (offset du clip)
  const pxPos = renderCtx.timeToX(renderCtx.positionStart) - renderCtx.keyWidth;
  ctx.save();
  ctx.strokeStyle = "rgba(255,0,0,0.9)";
  ctx.beginPath();
  ctx.moveTo(pxPos + 0.5, 0);
  ctx.lineTo(pxPos + 0.5, contentH);
  ctx.stroke();
  ctx.restore();

  // Full-height clip length line
  const pxClipEnd = renderCtx.timeToX(renderCtx.lengthBeats) - renderCtx.keyWidth;
  ctx.save();
  ctx.strokeStyle = "rgba(0,255,0,0.9)";
  ctx.beginPath();
  ctx.moveTo(pxClipEnd + 0.5, -20);
  ctx.lineTo(pxClipEnd + 0.5, contentH + 12);
  ctx.stroke();
  ctx.restore();

  // Viewport culling
  const x0Beat = Math.max(0, renderCtx.xToTime(renderCtx.keyWidth));
  const x1Beat = renderCtx.xToTime(wCss);
  const y0Pitch = renderCtx.yToPitch(contentY);
  const y1Pitch = renderCtx.yToPitch(hCss);

  culledBuffer.length = 0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const nEnd = n.time + n.duration;
    if (nEnd < x0Beat || n.time > x1Beat) continue;
    if (n.pitch < y1Pitch || n.pitch > y0Pitch) continue;
    culledBuffer.push(n);
  }

  // Local pitchToY inside grid context: subtract contentY because context is translated
  const pitchToYLocal = (p: number) => renderCtx.pitchToY(p) - contentY;
  drawNotes(ctx, {
    notes: culledBuffer,
    selectedSet: renderCtx.selectedSet,
    hoverIndex: drawState.hoverNote,
    keyWidth: renderCtx.keyWidth,
    timeToX: renderCtx.timeToX,
    pitchToY: pitchToYLocal,
    pxPerBeat: renderCtx.pxPerBeat,
    pxPerSemitone: renderCtx.pxPerSemitone,
  });

  // Ghost note preview
  // La zone d'activation de la note ghost se trouve dans le fichier pointerMoveHandler.ts aux lignes 223-232.
  // La sensibilité du snap de la ghost note se règle dans le fichier useSnapGrid.ts aux lignes 7-14.
  
  if (!drawState.pointerStart && drawState.ghost) {
    const g = drawState.ghost; // { time, pitch }
    const gx = renderCtx.timeToX(g.time);
    const gy = renderCtx.pitchToY(g.pitch) - contentY;
    const gw = renderCtx.pxPerBeat / renderCtx.grid;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#7aa2ff";  // ← Couleur bleue
    ctx.fillRect(gx - renderCtx.keyWidth, gy + 2, Math.max(8, gw - 2), Math.max(4, renderCtx.pxPerSemitone - 4));
    ctx.globalAlpha = 1;
  }

  // Rectangle selection
  if (drawState.rectangleSelection) {
    const m = drawState.rectangleSelection;
    const rx = Math.min(m.x0, m.x1) - renderCtx.keyWidth;
    const ry = Math.min(m.y0, m.y1) - contentY;
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
    const hy = g.yCss - contentY + 0.5;
    ctx.save();
    ctx.strokeStyle = "rgba(255,208,47,0.4)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(vx, 0);
    ctx.lineTo(vx, contentH);
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
    ctx.fillText(lblPitch, Math.max(0, Math.min(wCss - renderCtx.keyWidth - 30, vx + 6)), Math.min(contentH - 2, hy + 12));
    ctx.restore();
  }

  ctx.restore();

  return { visible: culledBuffer.length, total: notes.length };
}
