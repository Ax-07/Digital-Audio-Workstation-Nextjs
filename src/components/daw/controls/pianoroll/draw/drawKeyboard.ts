// src/components/daw/controls/pianoroll/draw/drawKeyboard.ts

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  opts: {
    wCss: number;
    hCss: number;
    keyWidth: number;
    scrollY: number;
    pxPerSemitone: number;
    minPitch: number;
    maxPitch: number;
    pitchToY: (p: number) => number;
    pressedPitch: number | null;
    hoverPitch: number | null;
  }
) {
  const {
    wCss,
    hCss,
    keyWidth,
    scrollY,
    pxPerSemitone,
    minPitch,
    maxPitch,
    pitchToY,
    pressedPitch,
    hoverPitch,
  } = opts;

  const label = (pitch: number): string => {
    const names = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ] as const;
    const n = names[pitch % 12];
    const o = Math.floor(pitch / 12) - 1;
    return `${n}${o}`;
  };

  const rowsVisible = Math.ceil((hCss + scrollY) / pxPerSemitone);
  for (let p = 0; p <= rowsVisible; p++) {
    const pitch = maxPitch - Math.floor((p * pxPerSemitone + scrollY) / pxPerSemitone);
    if (pitch < minPitch || pitch > maxPitch) continue;
    const y = pitchToY(pitch);
    const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
    const isPressed = pressedPitch === pitch;
    const isHoveredRow = hoverPitch === pitch;

    // white key base (full width)
    ctx.fillStyle = isPressed ? "#6f6f6f" : "#f3f3f3";
    ctx.fillRect(0, y, keyWidth, pxPerSemitone);
    // subtle left edge for depth
    ctx.beginPath();
    ctx.strokeStyle = "#d0d0d0";
    ctx.moveTo(0.5, y);
    ctx.lineTo(0.5, y + pxPerSemitone);
    ctx.stroke();

    // Background shading on grid side for black-key rows (helps vertical orientation)
    if (isBlack) {
      ctx.fillStyle = "rgba(0,0,0,0.04)";
      ctx.fillRect(keyWidth, y, wCss - keyWidth, pxPerSemitone);
    }

    // black key overlay (narrower, centered like a real piano)
    if (isBlack) {
      const hoverBlack = hoverPitch === pitch && !isPressed;
      ctx.fillStyle = isPressed ? "#1a1a1a" : hoverBlack ? "#151515" : "#0f0f0f";
      ctx.fillRect(0, y, keyWidth, pxPerSemitone);
    }

    // hover overlay on grid side
    if (isHoveredRow) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(keyWidth, y, wCss - keyWidth, pxPerSemitone);
    }

    // row separator across keyboard and grid
    ctx.beginPath();
    ctx.strokeStyle = "#2b2b2b";
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(wCss, y + 0.5);
    ctx.stroke();

    // C labels
    if (pitch % 12 === 0 && pxPerSemitone >= 10) {
      ctx.fillStyle = "#7a7a7a";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(label(pitch), 6, y + pxPerSemitone / 2);
    }
  }

  // vertical separator
  ctx.beginPath();
  ctx.strokeStyle = "#404040";
  ctx.moveTo(opts.keyWidth + 0.5, 0);
  ctx.lineTo(opts.keyWidth + 0.5, opts.hCss);
  ctx.stroke();
}
