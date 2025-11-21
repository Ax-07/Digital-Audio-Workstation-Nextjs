// src/components/daw/controls/clip-editor/pianoroll/state/usePianoRollViewport.ts
import { useCallback, useEffect, useRef, useState } from "react";

export type ViewportState = {
  scrollX: number;
  scrollY: number;
  pxPerBeat: number;
  pxPerSemitone: number;
};

export type ViewportAPI = ViewportState & {
  setScrollX: (v: number | ((prev: number) => number)) => void;
  setScrollY: (v: number | ((prev: number) => number)) => void;
  setPxPerBeat: (v: number) => void;
  setPxPerSemitone: (fn: (prev: number) => number) => void;
};

/**
 * Encapsule la logique de viewport (scroll & zoom) du Piano Roll.
 * - Gère scrollX / scrollY localement
 * - Délègue la gestion contrôlée / non contrôlée de pxPerBeat & pxPerSemitone au parent via setters fournis
 * - Gère le wheel via un listener natif non-passif sur le wrapper (wrapRef)
 */
export function usePianoRollViewport(params: {
  minPitch: number;
  maxPitch: number;
  lengthBeats: number;
  keyWidth: number; // réservé pour futures évolutions
  pxPerBeat: number;
  setPxPerBeat: (v: number) => void;
  pxPerSemitone: number;
  setPxPerSemitone: (fn: (prev: number) => number) => void;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}): ViewportAPI {
  const {
    minPitch,
    maxPitch,
    lengthBeats,
    keyWidth, // eslint-disable-line @typescript-eslint/no-unused-vars
    pxPerBeat,
    setPxPerBeat,
    pxPerSemitone,
    setPxPerSemitone,
    wrapRef,
  } = params;

  // Scroll local (interne uniquement au viewport)
  const [scrollXState, setScrollXState] = useState(0);
  const [scrollYState, setScrollYState] = useState(0);

  // Refs pour avoir les valeurs courantes dans le listener natif
  const scrollXRef = useRef(0);
  const scrollYRef = useRef(0);
  const pxPerBeatRef = useRef(pxPerBeat);
  const pxPerSemitoneRef = useRef(pxPerSemitone);

  // Sync des refs quand les valeurs externes changent
  useEffect(() => {
    pxPerBeatRef.current = pxPerBeat;
  }, [pxPerBeat]);

  useEffect(() => {
    pxPerSemitoneRef.current = pxPerSemitone;
  }, [pxPerSemitone]);

  // Setters qui gardent refs + state synchronisés
  const setScrollX = useCallback(
    (v: number | ((prev: number) => number)) => {
      if (typeof v === "function") {
        setScrollXState((prev) => {
          const next = v(prev);
          scrollXRef.current = next;
          return next;
        });
      } else {
        scrollXRef.current = v;
        setScrollXState(v);
      }
    },
    [],
  );

  const setScrollY = useCallback(
    (v: number | ((prev: number) => number)) => {
      if (typeof v === "function") {
        setScrollYState((prev) => {
          const next = v(prev);
          scrollYRef.current = next;
          return next;
        });
      } else {
        scrollYRef.current = v;
        setScrollYState(v);
      }
    },
    [],
  );

  // Listener natif sur le wrapper (et plus sur le canvas)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // On empêche le scroll global
      e.preventDefault();

      const delta = e.deltaY;

      const viewportH = el.clientHeight || 0;
      const viewportW = el.clientWidth || 640;

      const contentHeight =
        (maxPitch - minPitch + 1) * pxPerSemitoneRef.current;
      const maxScrollY = Math.max(0, contentHeight - viewportH);

      const totalPxX = lengthBeats * pxPerBeatRef.current;
      const maxScrollX = Math.max(0, totalPxX - viewportW);

      // Scroll vertical (aucun modificateur)
      if (
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        setScrollY((prev) => {
          let next = prev + Math.sign(delta) * 20;
          next = Math.max(0, Math.min(maxScrollY, next));
          return next;
        });
        return;
      }

      // Scroll horizontal (Shift)
      if (e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        setScrollX((prev) => {
          let next = prev + delta * 0.5;
          next = Math.max(0, Math.min(maxScrollX, next));
          return next;
        });
        return;
      }

      // Zoom horizontal (Ctrl / Cmd)
      if (e.ctrlKey || e.metaKey) {
        let next = pxPerBeatRef.current * (1 - delta * 0.001);
        next = Math.max(16, Math.min(192, next));
        setPxPerBeat(next);
        pxPerBeatRef.current = next;
        return;
      }

      // Zoom vertical (Alt)
      if (e.altKey) {
        setPxPerSemitone((prev) => {
          let next = prev * (1 - delta * 0.001);
          next = Math.max(6, Math.min(24, next));
          pxPerSemitoneRef.current = next;
          return next;
        });
        return;
      }
    };

    // ⚠️ listener non-passif pour autoriser preventDefault
    el.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [
    wrapRef,
    minPitch,
    maxPitch,
    lengthBeats,
    setScrollX,
    setScrollY,
    setPxPerBeat,
    setPxPerSemitone,
  ]);

  // onWheel React : plus utilisé, gardé juste pour compat
  const onWheel = useCallback(() => {
    // noop
  }, []);

  return {
    scrollX: scrollXState,
    scrollY: scrollYState,
    pxPerBeat,
    pxPerSemitone,
    setScrollX,
    setScrollY,
    setPxPerBeat,
    setPxPerSemitone,
  };
}
