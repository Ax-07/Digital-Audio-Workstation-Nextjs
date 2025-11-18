// src/components/daw/controls/clip-editor/pianoroll/rendering/drawOverlay.ts

export function drawOverlayCanvas(
  overlay: HTMLCanvasElement,
  dpr: number,
  active: boolean,
  position: number | undefined,
  playheadBeat: number | undefined,
  playheadBeatRef: number | null,
  lengthBeats: number,
  timeToX: (beat: number) => number
) {
  const ctx = overlay.getContext("2d");
  if (!ctx) return;

  const W = overlay.width;
  const H = overlay.height;
  const hCss = H / dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.scale(dpr, dpr);

  // Position (startOffset) - trait vert vert
  if (typeof position === "number") {
    const clampedPos = Math.max(0, Math.min(lengthBeats, position));
    const xPos = timeToX(clampedPos) + 0.5;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(60, 255, 60, 0.9)";
    ctx.lineWidth = 2;
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, hCss);
    ctx.stroke();
  }

  // Playhead (suivi de lecture) - trait bleu
  const phBeat = active ? (typeof playheadBeat === "number" ? playheadBeat : playheadBeatRef) : null;
  if (active && typeof phBeat === "number") {
    const clampedBeat = Math.max(0, Math.min(lengthBeats, phBeat));
    const xPlay = timeToX(clampedBeat) + 0.5;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(96, 165, 250, 0.95)";
    ctx.lineWidth = 2;
    ctx.moveTo(xPlay, 0);
    ctx.lineTo(xPlay, hCss);
    ctx.stroke();
  }
}
