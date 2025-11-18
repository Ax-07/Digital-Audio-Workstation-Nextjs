// src/components/daw/controls/clip-editor/pianoroll/hooks/useAutoFollow.ts

import { useEffect, useRef } from "react";

export function useAutoFollow(
  active: boolean,
  followPlayhead: boolean,
  playheadBeat: number | undefined,
  timeToX: (beat: number) => number,
  keyWidth: number,
  totalPxX: number,
  scrollX: number,
  setScrollX: (value: number | ((prev: number) => number)) => void,
  draw: () => void,
  wrapRef: React.RefObject<HTMLDivElement | null>
) {
  const rafPendingRef = useRef(false);

  useEffect(() => {
    if (!active || !followPlayhead) return;
    if (typeof playheadBeat !== "number") return;

    if (!rafPendingRef.current) {
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        const wrap = wrapRef.current;
        if (wrap && typeof playheadBeat === "number") {
          const px = timeToX(playheadBeat) - keyWidth;
          const margin = 24;
          const viewW = wrap.clientWidth;

          if (px > viewW - margin) {
            const target = Math.min(totalPxX - viewW, scrollX + (px - (viewW - margin)));
            if (!Number.isNaN(target) && Number.isFinite(target)) setScrollX(Math.max(0, target));
          } else if (px < margin) {
            const target = Math.max(0, scrollX + (px - margin));
            if (!Number.isNaN(target) && Number.isFinite(target)) setScrollX(Math.max(0, target));
          }
        }
        draw();
      });
    }
  }, [active, followPlayhead, playheadBeat, timeToX, keyWidth, totalPxX, scrollX, setScrollX, draw, wrapRef]);
}
