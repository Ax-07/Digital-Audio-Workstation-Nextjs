// src/lib/utils/canvas.ts
export function setupCanvas2D(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const { clientWidth, clientHeight } = canvas
  const w = Math.max(1, Math.floor(clientWidth * dpr))
  const h = Math.max(1, Math.floor(clientHeight * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}
