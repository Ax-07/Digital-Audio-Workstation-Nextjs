// src/components/daw/controls/clip-editor/pianoroll/hooks/useSnapGrid.ts

import { GridValue } from "@/lib/audio/types";
import { useCallback } from "react";

export function useSnapGrid(snap: boolean, grid: GridValue) {
  const snapBeat = useCallback(
    (beat: number) => {
      if (!snap) return beat;
      const step = 1 / grid;
      return Math.floor(beat / step) * step;
    },
    [snap, grid]
  );

  return { snapBeat };
}
