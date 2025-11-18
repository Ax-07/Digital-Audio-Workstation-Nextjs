// --- petit knob rotatif réutilisable ---------------------------------------

import { useState, useRef, useCallback, useEffect } from "react";

type KnobProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: (v: number) => string;
  onChange: (v: number) => void;
};

const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  display = (v) => String(Math.round(v)),
  onChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const startVal = useRef(value);
  const startY = useRef(0);

  const ratio = (value - min) / (max - min || 1);
  const angle = -135 + ratio * 270; // -135° .. +135°

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      startY.current = e.clientY;
      startVal.current = value;
      setDragging(true);
    },
    [value],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      const dy = e.clientY - startY.current;
      const range = max - min;
      const delta = (-dy / 120) * range; // sensibilité
      let next = startVal.current + delta;
      if (step > 0) {
        next = Math.round(next / step) * step;
      }
      next = Math.max(min, Math.min(max, next));
      onChange(next);
    };
    const handleUp = () => setDragging(false);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, max, min, onChange, step]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-linear-to-br from-neutral-900 via-neutral-800 to-neutral-900 shadow-[0_2px_6px_rgba(0,0,0,0.8)] ring-1 ring-black/70"
        onPointerDown={onPointerDown}
      >
        {/* halo */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(45,212,191,0.55),transparent_55%)] opacity-40" />
        {/* corps */}
        <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 ring-1 ring-neutral-700/80">
          {/* repères */}
          <div className="absolute inset-[3px] rounded-full border border-neutral-700/70 border-dashed opacity-40" />
          {/* aiguille */}
          <div
            className="h-3 w-0.5 rounded-full bg-teal-300 shadow-[0_0_6px_rgba(45,212,191,0.7)]"
            style={{ transform: `rotate(${angle}deg) translateY(-4px)` }}
          />
        </div>
      </div>
      <span className="text-[9px] uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </span>
      <span className="text-[10px] tabular-nums text-neutral-200">
        {display(value)}
      </span>
    </div>
  );
};

export default Knob;