// src/components/daw/controls/pianoroll/coords

export function timeToX(beat: number, pxPerBeat: number, scrollX: number, keyWidth: number): number {
  return keyWidth + beat * pxPerBeat - scrollX;
}

export function xToTime(xCss: number, pxPerBeat: number, scrollX: number, keyWidth: number): number {
  return (xCss - keyWidth + scrollX) / pxPerBeat;
}

export function pitchToY(pitch: number, maxPitch: number, pxPerSemitone: number, scrollY: number): number {
  return (maxPitch - pitch) * pxPerSemitone - scrollY;
}

export function yToPitch(yCss: number, minPitch: number, maxPitch: number, pxPerSemitone: number, scrollY: number): number {
  const val = maxPitch - (yCss + scrollY) / pxPerSemitone;
  return Math.max(minPitch, Math.min(maxPitch, val));
}
