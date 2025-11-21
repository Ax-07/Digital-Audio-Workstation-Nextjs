// src/components/daw/controls/clip-editor/draw/drawKeyboard.ts

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // indices of sharp notes

export type KeyboardDrawOptions = {
  wCss: number;
  hCss: number;
  keyWidth: number;
  scrollY: number;
  pxPerSemitone: number;
  minPitch: number;
  maxPitch: number;
  pitchToY: (pitch: number) => number;
  pressedPitch: number | null;
  hoverPitch: number | null;
};

export function drawKeyboard(ctx: CanvasRenderingContext2D, opts: KeyboardDrawOptions) {
  const { keyWidth, minPitch, maxPitch, pitchToY, pressedPitch, hoverPitch, pxPerSemitone } = opts;

  ctx.save();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, keyWidth, opts.hCss);

  // Draw separator line
  ctx.strokeStyle = "#404040";
  ctx.beginPath();
  ctx.moveTo(keyWidth - 0.5, 0);
  ctx.lineTo(keyWidth - 0.5, opts.hCss);
  ctx.stroke();

  // Draw keys
  for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
    const y = pitchToY(pitch);
    const h = pxPerSemitone;
    if (y + h < 0 || y > opts.hCss) continue;

    const mod = pitch % 12;
    const isBlack = BLACK_KEYS.includes(mod);
    const isPressed = pitch === pressedPitch;
    const isHovered = pitch === hoverPitch;

    // Base color
    let fillColor = isBlack ? "#111111" : "#f5f5f5";
    if (isPressed) fillColor = "#707070";
    else if (isHovered) fillColor = isBlack ? "#282828" : "#e0e0e0";

    ctx.fillStyle = fillColor;
    ctx.fillRect(0, y, isBlack ? keyWidth * 0.65 : keyWidth, h);

    // Border
    ctx.strokeStyle = isBlack ? "#1f1f1f" : "#303030";
    ctx.strokeRect(0.5, y + 0.5, (isBlack ? keyWidth * 0.65 : keyWidth) - 1, h - 1);

    // Label (only for C notes or when sufficient space)
    if (mod === 0 || pxPerSemitone >= 18) {
      const octave = Math.floor(pitch / 12) - 1;
      const label = `${NOTE_NAMES[mod]}${octave}`;
      ctx.fillStyle = isBlack ? "#888" : "#444";
      ctx.font = "9px ui-sans-serif, system-ui";
      ctx.fillText(label, 4, y + h / 2 + 3);
    }
  }

  ctx.restore();
}
