// src/components/daw/controls/pianoroll/hit.ts

export type Hit = { index: number; mode: "move" | "resize" } | { index: null; mode: null };

export type NoteLike = { time: number; duration: number; pitch: number };

export function getHitAt(
  xCss: number,
  yCss: number,
  notes: ReadonlyArray<NoteLike>,
  opts: {
    keyWidth: number;
    pxPerBeat: number;
    pxPerSemitone: number;
    timeToX: (b: number) => number;
    pitchToY: (p: number) => number;
  }
): Hit {
  const { keyWidth, pxPerBeat, pxPerSemitone, timeToX, pitchToY } = opts;
  if (xCss < keyWidth) return { index: null, mode: null };
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const nx = timeToX(n.time);
    const ny = pitchToY(n.pitch);
    const nw = Math.max(4, n.duration * pxPerBeat);
    const nh = pxPerSemitone - 2;
    if (xCss >= nx && xCss <= nx + nw && yCss >= ny && yCss <= ny + nh) {
      if (xCss >= nx + nw - 6) return { index: i, mode: "resize" };
      return { index: i, mode: "move" };
    }
  }
  return { index: null, mode: null };
}
