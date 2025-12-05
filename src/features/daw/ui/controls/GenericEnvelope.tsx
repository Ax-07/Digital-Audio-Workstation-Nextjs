// src/components/fx/GenericEnvelope.tsx
"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  GenericEnvelope,
  EnvelopePoint,
  EnvelopeCurve,
} from "@/core/audio-engine/envelopes/generic-envelope";
import { normalizeEnvelope, clamp } from "@/core/audio-engine/envelopes/generic-envelope";
import { BEATS_PER_BAR } from "@/core/audio-engine/core/transport-scheduler";

type EnvelopeTargetOption = { value: string; label?: string };

type Props = {
  envelope: GenericEnvelope;
  onChange: (env: GenericEnvelope) => void;
  className?: string;
  /** Nombre min de points (default: 2 / début & fin). */
  minPoints?: number;
  /** Nombre max de points (default: 12). */
  maxPoints?: number;
  /**
   * Liste des cibles possibles pour cette enveloppe. Si fournie, un sélecteur
   * apparaît dans l'en-tête pour choisir la cible courante.
   */
  targets?: ReadonlyArray<EnvelopeTargetOption>;
  /** Cible actuellement sélectionnée. Doit correspondre à l'une des `targets`. */
  target?: string;
  /** Callback lors d'un changement de cible. */
  onTargetChange?: (next: string) => void;
};

const WIDTH = 260;
const HEIGHT = 110;
const PADDING_X = 14;
const PADDING_Y = 12;

type Point = [number, number];

type DragState = {
  index: number;
  mode: "move"; // future: "time-only", "value-only" si tu veux
};

const CURVE_LABEL: Record<EnvelopeCurve, string> = {
  linear: "LIN",
  exp: "EXP",
  log: "LOG",
};

const CURVE_ORDER: EnvelopeCurve[] = ["linear", "exp", "log"];

/* ------------ utilitaires mapping t/value -> coords ------------ */

function pointToXY(p: EnvelopePoint): Point {
  const usableWidth = WIDTH - PADDING_X * 2;
  const usableHeight = HEIGHT - PADDING_Y * 2;
  const x = PADDING_X + clamp(p.t, 0, 1) * usableWidth;
  const y = PADDING_Y + (1 - clamp(p.value, 0, 1)) * usableHeight;
  return [x, y];
}

function xyToTV(
  x: number,
  y: number,
): { t: number; value: number } {
  const usableWidth = WIDTH - PADDING_X * 2;
  const usableHeight = HEIGHT - PADDING_Y * 2;

  const tx = clamp((x - PADDING_X) / Math.max(1, usableWidth), 0, 1);
  const vy = 1 - clamp((y - PADDING_Y) / Math.max(1, usableHeight), 0, 1);
  return { t: tx, value: vy };
}

/* ------------ snapping helpers (beats mode) ------------ */

function getSnapStep(envelope: GenericEnvelope): number | null {
  const timebase = envelope.timebase ?? "ms";
  if (timebase !== "beats" || !envelope.snap) return null;
  const totalBeats = envelope.totalBeats ?? 1;
  const grid = (envelope.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32;
  const denom = Math.max(1, totalBeats * grid);
  return 1 / denom;
}

function snapNormT(t: number, step: number): number {
  return clamp(Math.round(t / step) * step, 0, 1);
}

function snapAllPointsToGrid(env: GenericEnvelope): EnvelopePoint[] {
  const step = getSnapStep(env);
  if (!step) return env.points;
  const pts = env.points.map((p) => ({ ...p }));
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      pts[i].t = 0;
    } else if (i === n - 1) {
      pts[i].t = 1;
    } else {
      pts[i].t = snapNormT(pts[i].t, step);
    }
  }
  // Option: ne pas forcer d'unicité; on laisse des t égaux possibles.
  // Trions pour garantir l'ordre au cas où le snap inverse deux points.
  pts.sort((a, b) => a.t - b.t);
  return pts;
}

/* ------------ composant principal ------------ */

const GenericEnvelopeEditorComponent: React.FC<Props> = ({
  envelope,
  onChange,
  className,
  minPoints = 2,
  maxPoints = 12,
  targets,
  target,
  onTargetChange,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // on normalise toujours côté UI pour que le dessin soit stable.
  const env = useMemo(() => normalizeEnvelope(envelope), [envelope]);
  const points = env.points;

  // points en coordonnées SVG
  const svgPoints: Point[] = useMemo(
    () => points.map((p) => pointToXY(p)),
    [points],
  );

  const polyPointsStr = useMemo(
    () => svgPoints.map(([x, y]) => `${x},${y}`).join(" "),
    [svgPoints],
  );

  const areaPointsStr = useMemo(() => {
    if (!svgPoints.length) return "";
    const bottomY = HEIGHT - PADDING_Y;
    const firstX = svgPoints[0][0];
    const lastX = svgPoints[svgPoints.length - 1][0];
    return [
      `${firstX},${bottomY}`,
      polyPointsStr,
      `${lastX},${bottomY}`,
    ].join(" ");
  }, [svgPoints, polyPointsStr]);

  // Lignes verticales dynamiques (mesures / temps / subdivisions) en mode beats
  const dynamicBeatLines = useMemo(() => {
    if ((envelope.timebase ?? "ms") !== "beats") return null;
    const totalBeats = envelope.totalBeats ?? 1;
    const grid = (envelope.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32;
    const usableWidth = WIDTH - PADDING_X * 2;
    const y1 = PADDING_Y;
    const y2 = HEIGHT - PADDING_Y;
    const lines: React.ReactNode[] = [];

    const xFromBeat = (beatPos: number) => PADDING_X + clamp(beatPos / Math.max(1e-6, totalBeats), 0, 1) * usableWidth;
    const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

    // Mesures
    const maxMeasure = Math.floor(totalBeats / BEATS_PER_BAR);
    for (let m = 0; m <= maxMeasure; m++) {
      const pos = m * BEATS_PER_BAR;
      if (pos < 0 || pos > totalBeats + 1e-6) continue;
      const x = xFromBeat(pos);
      lines.push(
        <line key={`bar-${m}`} x1={x} y1={y1} x2={x} y2={y2} stroke="#e4e4e4" strokeOpacity={0.7} strokeWidth={0.9} />
      );
    }

    // Temps (beats) non-mesure
    const maxBeat = Math.floor(totalBeats);
    for (let b = 0; b <= maxBeat; b++) {
      if (b % BEATS_PER_BAR === 0) continue; // déjà tracé comme mesure
      const pos = b;
      const x = xFromBeat(pos);
      lines.push(
        <line key={`beat-${b}`} x1={x} y1={y1} x2={x} y2={y2} stroke="#acacac" strokeOpacity={0.6} strokeWidth={0.6} />
      );
    }

    // Subdivisions de grille (1/grid) non alignées sur beat ou mesure
    const totalSubs = Math.floor(totalBeats * grid);
    for (let j = 1; j < totalSubs; j++) {
      const pos = j / grid;
      if (pos > totalBeats - 1e-6) break;
      if (isInt(pos)) continue; // c'est un beat
      if (isInt(pos / BEATS_PER_BAR)) continue; // c'est une mesure
      const x = xFromBeat(pos);
      lines.push(
        <line key={`sub-${j}`} x1={x} y1={y1} x2={x} y2={y2} stroke="#888888" strokeOpacity={0.55} strokeWidth={0.4} />
      );
    }

    return <g>{lines}</g>;
  }, [envelope.timebase, envelope.totalBeats, envelope.grid]);

  // Lignes verticales adaptatives en mode ms (graduations majeures + mineures)
  const dynamicMsLines = useMemo(() => {
    if ((envelope.timebase ?? "ms") !== "ms") return null;
    const totalMs = Math.max(1, env.totalMs);
    const usableWidth = WIDTH - PADDING_X * 2;
    const y1 = PADDING_Y;
    const y2 = HEIGHT - PADDING_Y;

    const pxPerMs = usableWidth / totalMs;
    const targetPxMajor = 64; // espacement visé (~64px)
    const rawMajorMs = targetPxMajor / Math.max(1e-6, pxPerMs);

    const niceStep = (ms: number) => {
      const pow = Math.pow(10, Math.floor(Math.log10(ms)));
      const base = ms / pow;
      let niceBase: number;
      if (base <= 1) niceBase = 1;
      else if (base <= 2) niceBase = 2;
      else if (base <= 5) niceBase = 5;
      else niceBase = 10;
      return niceBase * pow;
    };

    const majorMs = Math.max(1, niceStep(rawMajorMs));
    // 4 subdivisions par défaut (quart de major)
    const minorMs = majorMs / 4;

    const toX = (ms: number) => PADDING_X + (ms / totalMs) * usableWidth;
    const lines: React.ReactNode[] = [];

    // Limiter le nombre de traits pour éviter la surcharge
    const maxLines = 500;
    let counter = 0;

    // Lignes majeures + labels
    for (let t = 0; t <= totalMs + 1e-6; t += majorMs) {
      const x = toX(t);
      const isSecond = Math.abs(t % 1000) < 1e-6;
      lines.push(
        <line
          key={`ms-major-${t}`}
          x1={x}
          y1={y1}
          x2={x}
          y2={y2}
          stroke={isSecond ? "#555555" : "#3a3a3a"}
          strokeOpacity={isSecond ? 0.7 : 0.6}
          strokeWidth={isSecond ? 1 : 0.8}
        />
      );
      // Label en haut
      const label = t >= 1000 ? `${(t / 1000).toFixed(Math.abs((t / 1000) - Math.round(t / 1000)) < 1e-6 ? 0 : 1)}s` : `${Math.round(t)}ms`;
      lines.push(
        <text
          key={`ms-label-${t}`}
          x={x + 2}
          y={y1 + 9}
          fill="#9ca3af"
          fontSize={9}
          style={{ userSelect: "none" }}
        >
          {label}
        </text>
      );
      if (++counter > maxLines) break;
    }

    // Lignes mineures
    for (let t = 0; t <= totalMs + 1e-6; t += minorMs) {
      // ne pas dupliquer les majeures
      if (Math.abs((t / majorMs) - Math.round(t / majorMs)) < 1e-6) continue;
      const x = toX(t);
      lines.push(
        <line
          key={`ms-minor-${t}`}
          x1={x}
          y1={y1}
          x2={x}
          y2={y2}
          stroke="#2a2a2a"
          strokeOpacity={0.55}
          strokeWidth={0.5}
        />
      );
      if (++counter > maxLines) break;
    }

    return <g pointerEvents="none">{lines}</g>;
  }, [envelope.timebase, env.totalMs]);

  /* ------------ helpers mutation enveloppe ------------ */

  const updatePoints = useCallback(
    (updater: (pts: EnvelopePoint[]) => EnvelopePoint[]) => {
      const next: GenericEnvelope = {
        totalMs: env.totalMs,
        timebase: envelope.timebase ?? "ms",
        totalBeats: envelope.totalBeats ?? 1,
        grid: (envelope.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32,
        snap: !!envelope.snap,
        points: updater(env.points).map((p) => ({
          t: clamp(p.t, 0, 1),
          value: clamp(p.value, 0, 1),
          curve: p.curve ?? "linear",
        })),
      };
      onChange(next);
    },
    [envelope.grid, envelope.snap, envelope.timebase, envelope.totalBeats, env.totalMs, env.points, onChange],
  );

  const handleTotalChange = useCallback(
    (ms: number) => {
      onChange({
        ...env,
        totalMs: Math.max(1, ms),
      });
    },
    [env, onChange],
  );

  const handleBeatsChange = useCallback(
    (beats: number) => {
      const nextBase: GenericEnvelope = { ...env, timebase: "beats", totalBeats: Math.max(1 / 32, beats) };
      const snappedPts = snapAllPointsToGrid(nextBase);
      onChange({ ...nextBase, points: snappedPts });
    },
    [env, onChange],
  );

  const handleGridChange = useCallback(
    (grid: 1 | 2 | 4 | 8 | 16 | 32) => {
      const nextBase: GenericEnvelope = { ...env, grid };
      const snappedPts = snapAllPointsToGrid(nextBase);
      onChange({ ...nextBase, points: snappedPts });
    },
    [env, onChange],
  );

  const handleTimebaseChange = useCallback(
    (tb: "ms" | "beats") => {
      if (tb === (envelope.timebase ?? "ms")) return;
      if (tb === "beats") {
        const base: GenericEnvelope = { ...env, timebase: "beats", totalBeats: envelope.totalBeats ?? 1, grid: (envelope.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32, snap: envelope.snap ?? true };
        const snapped = snapAllPointsToGrid(base);
        onChange({ ...base, points: snapped });
      } else {
        onChange({ ...env, timebase: "ms" });
      }
    },
    [env, envelope.grid, envelope.snap, envelope.timebase, envelope.totalBeats, onChange],
  );

  const addPointAt = useCallback(
    (x: number, y: number) => {
      if (env.points.length >= maxPoints) return;
      const { t, value } = xyToTV(x, y);
      let tSnap = t;
      const timebase = envelope.timebase ?? "ms";
      if (timebase === "beats" && envelope.snap) {
        const totalBeats = envelope.totalBeats ?? 1;
        const grid = (envelope.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32;
        const step = 1 / Math.max(1, totalBeats * grid);
        tSnap = Math.round(t / step) * step;
      }
      // insère en gardant l’ordre par t
      updatePoints((pts) => {
        const clone = pts.slice();
        clone.push({ t: clamp(tSnap, 0, 1), value, curve: "linear" });
        clone.sort((a, b) => a.t - b.t);
        return clone;
      });
    },
    [envelope.grid, envelope.snap, envelope.timebase, envelope.totalBeats, env.points.length, maxPoints, updatePoints],
  );

  const removePoint = useCallback(
    (index: number) => {
      if (env.points.length <= minPoints) return;
      // on ne supprime pas le premier ni le dernier pour garder début/fin.
      if (index === 0 || index === env.points.length - 1) return;
      updatePoints((pts) => pts.filter((_, i) => i !== index));
      setSelectedIndex((prev) =>
        prev >= index ? Math.max(0, prev - 1) : prev,
      );
    },
    [env.points.length, minPoints, updatePoints],
  );

  const changeCurveAt = useCallback(
    (index: number, curve: EnvelopeCurve) => {
      updatePoints((pts) =>
        pts.map((p, i) =>
          i === index ? { ...p, curve } : p,
        ),
      );
    },
    [updatePoints],
  );

  /* ------------ drag global (pointermove / pointerup) ------------ */

  useEffect(() => {
    if (!drag) return;

    const handleMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const idx = drag.index;
      if (idx < 0 || idx >= env.points.length) return;

      const { t, value } = xyToTV(x, y);
      let tSnap = t;
      const timebase = envelope.timebase ?? "ms";
      let step: number | null = null;
      if (timebase === "beats" && envelope.snap) {
        const totalBeats = envelope.totalBeats ?? 1;
        const grid = (envelope.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32;
        step = 1 / Math.max(1, totalBeats * grid);
        tSnap = Math.round(t / step) * step;
      }

      updatePoints((pts) => {
        const next = pts.slice();
        const p = { ...next[idx] };

        // verrouille t du premier / dernier point (début & fin)
        if (idx === 0 || idx === next.length - 1) {
          p.t = idx === 0 ? 0 : 1;
          p.value = value;
        } else {
          // on limite t entre les voisins pour éviter les croisements
          const prevT = next[idx - 1].t;
          const nextT = next[idx + 1].t;
          const margin = step ? 0 : 0.01; // en mode snap beats: pas de marge pour rester sur la grille
          p.t = clamp(tSnap, prevT + margin, nextT - margin);
          p.value = value;
        }
        next[idx] = p;
        return next;
      });
    };

    const handleUp = () => setDrag(null);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, env.points.length, updatePoints, envelope.grid, envelope.snap, envelope.timebase, envelope.totalBeats]);

  /* ------------ handlers SVG ------------ */

  const onBackgroundDoubleClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      addPointAt(x, y);
    },
    [addPointAt],
  );

  const onHandleDown = useCallback(
    (index: number) =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        // Alt + clic pour supprimer un point
        if (e.altKey || e.metaKey) {
          removePoint(index);
          return;
        }
        setSelectedIndex(index);
        setDrag({ index, mode: "move" });
      },
    [removePoint],
  );

  /* ------------ util affichage ------------ */

  const ms = (v: number) => `${Math.round(v)} ms`;
  const beatsLabel = (v: number) => `${Number(v.toFixed(2))} beats`;

  const selectedPoint =
    points[selectedIndex] ?? points[0];

  const selectedCurve =
    (selectedPoint && selectedPoint.curve) || "linear";

  const cycleCurve = useCallback(() => {
    if (!selectedPoint) return;
    const current = selectedPoint.curve ?? "linear";
    const idx = CURVE_ORDER.indexOf(current);
    const nextCurve =
      CURVE_ORDER[(idx + 1) % CURVE_ORDER.length];
    changeCurveAt(selectedIndex, nextCurve);
  }, [selectedPoint, selectedIndex, changeCurveAt]);

  return (
    <div
      className={[
        "rounded-xl border border-neutral-800 bg-neutral-950/95 px-3 pt-2 pb-3",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.7),0_18px_30px_rgba(0,0,0,0.85)]",
        className ?? "",
      ].join(" ")}
    >
      {/* header */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            Envelope
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-teal-400/90">
            Multi-Point
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-6 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200"
            value={envelope.timebase ?? "ms"}
            onChange={(e) => handleTimebaseChange(e.target.value as "ms" | "beats")}
          >
            <option value="ms">ms</option>
            <option value="beats">beats</option>
          </select>
        {targets && targets.length > 0 && onTargetChange && (
          <select
            className="h-6 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200"
            value={target ?? targets[0]!.value}
            onChange={(e) => onTargetChange(e.target.value)}
          >
            {targets.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label ?? opt.value}
              </option>
            ))}
          </select>
        )}
        </div>
      </div>

      {/* dessin */}
      <svg
        ref={svgRef}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="rounded-md bg-linear-to-b from-neutral-950 to-neutral-900/95 ring-1 ring-neutral-800/80"
      >
        <defs>
          <pattern
            id="envGrid"
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 14 0 L 0 0 0 14"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.13"
              strokeWidth="0.6"
            />
          </pattern>

          <linearGradient id="envLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
          <linearGradient id="envFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* zone cliquable (double-clic pour ajouter un point) */}
        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={HEIGHT}
          fill="transparent"
          onDoubleClick={onBackgroundDoubleClick}
          style={{ cursor: "crosshair" }}
        />

        {/* grille dynamique en ms (graduations adaptatives) */}
        {dynamicMsLines}

        {/* lignes dynamiques beats (mesure/temps/subdiv) */}
        {dynamicBeatLines}

        {/* lignes horizontales d'aide (valeurs 25/50/75%) dans la zone utile */}
        <g pointerEvents="none">
          {[0.25, 0.5, 0.75].map((v) => {
            const y = PADDING_Y + (1 - v) * (HEIGHT - PADDING_Y * 2);
            return (
              <line
                key={`h-${v}`}
                x1={PADDING_X}
                x2={WIDTH - PADDING_X}
                y1={y}
                y2={y}
                stroke="#ffffff"
                strokeOpacity={v === 0.5 ? 0.12 : 0.08}
                strokeWidth={0.6}
              />
            );
          })}
        </g>

        {svgPoints.length >= 2 && (
          <>
            <polygon
              points={areaPointsStr}
              fill="url(#envFill)"
            />
            <polyline
              points={polyPointsStr}
              fill="none"
              stroke="#22c55e"
              strokeOpacity={0.22}
              strokeWidth={6}
            />
            <polyline
              points={polyPointsStr}
              fill="none"
              stroke="url(#envLine)"
              strokeWidth={2}
            />
          </>
        )}

        {/* handles */}
        {svgPoints.map(([x, y], idx) => (
          <g
            key={idx}
            onPointerDown={onHandleDown(idx)}
            style={{ cursor: "grab" }}
          >
            {/* hit area plus large */}
            <circle cx={x} cy={y} r={9} fill="transparent" />
            {/* halo sélection */}
            {idx === selectedIndex && (
              <circle
                cx={x}
                cy={y}
                r={7.5}
                fill="transparent"
                stroke="#22c55e"
                strokeOpacity={0.9}
                strokeWidth={1.4}
              />
            )}
            {/* point */}
            <circle
              cx={x}
              cy={y}
              r={5}
              fill="#020617"
              stroke="#22c55e"
              strokeWidth={1}
            />
          </g>
        ))}
      </svg>

      {/* barre de contrôle sous le dessin */}
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
        {/* durée totale */}
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.16em] text-neutral-500">
            Duration
          </span>
          {((envelope.timebase ?? "ms") === "ms") ? (
            <>
              <input
                type="range"
                min={10}
                max={10000}
                step={10}
                value={env.totalMs}
                onChange={(e) => handleTotalChange(Number(e.target.value))}
                className="h-1.5 w-32 cursor-pointer accent-teal-500"
              />
              <span className="tabular-nums text-neutral-200">{ms(env.totalMs)}</span>
            </>
          ) : (
            <>
              <select
                className="h-6 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200"
                value={String(envelope.totalBeats ?? 1)}
                onChange={(e) => handleBeatsChange(Number(e.target.value))}
              >
                {[0.25, 0.5, 1, 2, 4, 8].map((b) => (
                  <option key={b} value={b}>{beatsLabel(b)}</option>
                ))}
              </select>
              <span className="uppercase tracking-[0.16em] text-neutral-500">Grid</span>
              <select
                className="h-6 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200"
                value={String(((envelope.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32))}
                onChange={(e) => handleGridChange(Number(e.target.value) as 1 | 2 | 4 | 8 | 16 | 32)}
              >
                {[1,2,4,8,16,32].map((g) => (
                  <option key={g} value={g}>{`1/${g}`}</option>
                ))}
              </select>
              <label className="ml-2 inline-flex items-center gap-1 text-neutral-300">
                <input
                  type="checkbox"
                  className="accent-teal-500"
                  checked={!!envelope.snap}
                  onChange={(e) => {
                    const next: GenericEnvelope = { ...env, snap: e.target.checked };
                    const pts = e.target.checked ? snapAllPointsToGrid(next) : next.points;
                    onChange({ ...next, points: pts });
                  }}
                />
                <span>Snap</span>
              </label>
            </>
          )}
        </div>

        {/* courbe segment sélectionné */}
        <button
          type="button"
          onClick={cycleCurve}
          className="rounded-full border border-teal-500/60 bg-neutral-900/80 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-teal-300 hover:bg-neutral-800/80"
        >
          Curve: {CURVE_LABEL[selectedCurve]}
        </button>
      </div>

      {/* hint pour ajouter / supprimer */}
      <div className="mt-1 flex justify-between text-[9px] text-neutral-500/80">
        <span>Double-clic sur la grille pour ajouter un point.</span>
        <span>Alt-clic sur un point pour le supprimer.</span>
      </div>
    </div>
  );
};

export const GenericEnvelopeEditor = memo(GenericEnvelopeEditorComponent);
