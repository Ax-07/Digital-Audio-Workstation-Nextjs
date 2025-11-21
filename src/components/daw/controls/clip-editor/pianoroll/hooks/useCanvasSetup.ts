// src/components/daw/controls/clip-editor/pianoroll/hooks/useCanvasSetup.ts

import { useEffect, type RefObject } from "react";

export function useCanvasSetup(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>,
  wrapRef: RefObject<HTMLDivElement | null>,
  ctxRef: RefObject<CanvasRenderingContext2D | null>,
  dpr: number,
  draw: () => void,
  onResize?: (width: number, height: number) => void
) {
  useEffect(() => {
    const cvs = canvasRef.current;
    const parent = wrapRef.current;
    if (!cvs || !parent) return;

    const ctx = cvs.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
    if (!ctx) return;
    ctxRef.current = ctx;

    const overlay = overlayCanvasRef.current;

    const sizeCanvas = () => {
      const rect = parent.getBoundingClientRect();
      const wCss = rect.width || parent.clientWidth || 640;
      const hCss = rect.height || parent.clientHeight || 260;
      const w = Math.max(1, Math.floor(wCss));
      const h = Math.max(120, Math.floor(hCss));

      cvs.width = Math.floor(w * dpr);
      cvs.height = Math.floor(h * dpr);
      cvs.style.width = `${w}px`;
      cvs.style.height = `${h}px`;

      if (overlay) {
        overlay.width = Math.floor(w * dpr);
        overlay.height = Math.floor(h * dpr);
        overlay.style.width = `${w}px`;
        overlay.style.height = `${h}px`;
      }

      onResize?.(w, h);
      draw();
    };

    sizeCanvas();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sizeCanvas);
      ro.observe(parent);
    }

    return () => {
      ro?.disconnect();
    };
  }, [canvasRef, overlayCanvasRef, wrapRef, ctxRef, dpr, draw, onResize]);
}
