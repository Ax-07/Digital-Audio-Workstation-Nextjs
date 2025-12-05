// src/components/daw/controls/clip-editor/pianoroll/hooks/useAutoFollow.ts

import { getGlobalRaf } from "@/core/audio-engine/core/global-raf";
import { useEffect, useRef } from "react";

export function useAutoFollow(
  active: boolean,
  followPlayhead: boolean,
  getPlayheadBeat: (() => number | null) | undefined,
  timeToX: (beat: number) => number,
  keyWidth: number,
  totalPxX: number,
  scrollX: number,
  setScrollX: (value: number | ((prev: number) => number)) => void,
  draw: () => void,
  wrapRef: React.RefObject<HTMLDivElement | null>
) {
  // Utilise la boucle rAF globale pour éviter une boucle dédiée
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Désabonne si conditions non remplies
    if (!active || !followPlayhead || !getPlayheadBeat) {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
      return;
    }
    const raf = getGlobalRaf();
    // Marges pour éviter scroll excessif (hysteresis)
    const margin = 24;
    unsubRef.current = raf.subscribe(() => {
      const playheadBeat = getPlayheadBeat();
      if (typeof playheadBeat !== "number") return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const viewW = wrap.clientWidth;
      if (viewW <= 0) return;
      const px = timeToX(playheadBeat) - keyWidth;
      let target: number | null = null;
      if (px > viewW - margin) {
        target = Math.min(totalPxX - viewW, scrollX + (px - (viewW - margin)));
      } else if (px < margin) {
        target = Math.max(0, scrollX + (px - margin));
      }
      if (target != null && !Number.isNaN(target) && Number.isFinite(target) && target !== scrollX) {
        setScrollX(target);
      }
      draw();
    });
    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [active, followPlayhead, getPlayheadBeat, timeToX, keyWidth, totalPxX, scrollX, setScrollX, draw, wrapRef]);
}
