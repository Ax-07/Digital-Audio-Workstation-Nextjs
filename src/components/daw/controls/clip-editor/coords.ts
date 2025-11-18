// src/components/daw/controls/clip-editor/coords.ts

/**
 * Coordinate conversion utilities for PianoRoll
 * All functions are pure and side-effect free
 */

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
  const raw = maxPitch - (yCss + scrollY) / pxPerSemitone;
  return Math.max(minPitch, Math.min(maxPitch, Math.round(raw)));
}
