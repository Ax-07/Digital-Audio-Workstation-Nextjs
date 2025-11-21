// src/components/daw/controls/clip-editor/pianoroll/hooks/useCoordinates.ts

import { useCallback } from "react";
import * as coords from "../core/coords";

export function useCoordinates(
  keyWidth: number,
  pxPerBeat: number,
  pxPerSemitone: number,
  scrollX: number,
  scrollY: number,
  minPitch: number,
  maxPitch: number
) {
  const timeToX = useCallback(
    (beat: number) => coords.timeToX(beat, pxPerBeat, scrollX, keyWidth),
    [keyWidth, pxPerBeat, scrollX]
  );

  const xToTime = useCallback(
    (xCss: number) => coords.xToTime(xCss, pxPerBeat, scrollX, keyWidth),
    [keyWidth, pxPerBeat, scrollX]
  );

  const pitchToY = useCallback(
    (pitch: number) => coords.pitchToY(pitch, maxPitch, pxPerSemitone, scrollY),
    [maxPitch, pxPerSemitone, scrollY]
  );

  const yToPitch = useCallback(
    (yCss: number) => coords.yToPitch(yCss, minPitch, maxPitch, pxPerSemitone, scrollY),
    [maxPitch, minPitch, pxPerSemitone, scrollY]
  );

  return { timeToX, xToTime, pitchToY, yToPitch };
}
