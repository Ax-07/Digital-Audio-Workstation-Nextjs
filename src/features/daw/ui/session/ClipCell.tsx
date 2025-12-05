// src/components/daw/session/ClipCell.tsx

"use client";

import { PlayIcon, SquareIcon } from "lucide-react";
import { memo, useMemo, useEffect, useState } from "react";

/**
 * ClipCellState
 * -------------
 * Représente l’état logique du slot dans la grille Session :
 *
 *  - "empty"   : aucun clip dans la case
 *  - "stopped" : il y a un clip, mais il ne joue pas
 *  - "playing" : le clip est en lecture
 *  - "queued"  : le clip est en file d’attente (quantize) pour démarrer
 */
export type ClipCellState = "empty" | "stopped" | "playing" | "queued";

/**
 * ClipCellType
 * ------------
 * Catégorie du clip pour la couleur / hint visuel :
 *
 *  - "audio"
 *  - "midi"
 *  - "drum"
 */
export type ClipCellType = "audio" | "midi" | "drum";

/**
 * ClipCellProps
 * -------------
 * Pure composant UI pour une cellule de Session (type Ableton).
 *
 * Important :
 *  - aucune logique audio
 *  - se contente d’afficher un état + renvoyer des callbacks
 */
export type ClipCellProps = {
  state?: ClipCellState;
  type?: ClipCellType;
  label?: string;
  color?: string; // couleur custom (override des couleurs par défaut)
  isArmed?: boolean;

  // Interaction principale (click sur la cellule)
  onClick?: () => void;
  onAltClick?: () => void;
  disabled?: boolean;

  // Queue (état logique externe)
  queued?: boolean;
  onQueueToggle?: () => void;

  // Bouton Play / Stop interne (en haut à droite)
  onPlay?: () => void;
  onStop?: () => void;

  // Animation de progression
  progressSeconds?: number;
  isLoop?: boolean;
  progressDelaySeconds?: number;
};

/**
 * ClipCell
 * --------
 * Cellule cliquable pour la grille Session :
 *
 * - fond + contour colorés selon type
 * - halo différent pour playing / queued
 * - petit bouton Play/Stop flottant
 * - barre de progression optionnelle (loop / one-shot)
 *
 * Note :
 *  - Si on fournit onStop sans onPlay → interprété comme "Stop Slot" (Ableton-like)
 */
export const ClipCell = memo(function ClipCell({
  state = "empty",
  type = "audio",
  label,
  color,
  isArmed = false,
  onClick,
  onAltClick,
  disabled,
  queued = false,
  onQueueToggle,
  onPlay,
  onStop,
  progressSeconds,
  isLoop = false,
  progressDelaySeconds = 0,
}: ClipCellProps) {
  /**
   * Détermination de la couleur de base selon le type de clip.
   * Peut être override par la prop `color` pour un highlight custom.
   */
  const baseColor = useMemo(() => {
    if (color) return color;
    switch (type) {
      case "midi":
        return "#88C0D0"; // bleu clair (MIDI)
      case "drum":
        return "#D08770"; // orange doux (drums)
      case "audio":
      default:
        return "#A3BE8C"; // vert désaturé (audio)
    }
  }, [color, type]);

  /** Est-ce qu’il y a un contenu dans la cellule ? */
  const isFilled = state !== "empty";

  /**
   * Slot de type "STOP" :
   * - aucune lecture (state !== "playing")
   * - onStop défini
   * - pas d’onPlay → interprété comme bouton Stop
   */
  const isStopSlot = !onPlay && !!onStop && state !== "playing";

  /**
   * Flag "scheduled" pour le cas où une progress bar va démarrer
   * après un délai (quantize) → sert au halo / ring visuel.
   */
  const scheduled = progressDelaySeconds > 0;

  /**
   * Détermination de l’anneau lumineux (ring) autour de la cellule :
   *  - playing : halo plus fort (amber-400)
   *  - queued/scheduled : halo plus léger (amber-300)
   */
  const borderGlow =
    state === "playing"
      ? "ring-1 ring-amber-400/80"
      : state === "queued" || queued || scheduled
        ? "ring-1 ring-amber-300/70"
        : "";

  /** Fond de la cellule (différent si clip présent ou non) */
  const bg = isFilled ? "bg-neutral-800" : "bg-neutral-900/60";

  /** Hover seulement si la cellule n’est pas disabled */
  const hover = disabled ? "" : "hover:bg-neutral-800/80";

  /** Curseur / opacité selon disabled */
  const cursor = disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer";

  /** Classe d’animation quand la cellule est en lecture */
  const anim = state === "playing" ? "clip-playing-anim" : "";

  /**
   * started
   * -------
   * Drive le moment où l’animation de progression est autorisée à démarrer.
   * - false → avant le launch quantifié
   * - true  → la barre peut commencer à tourner
   */
  const [started, setStarted] = useState(progressDelaySeconds <= 0);

  useEffect(() => {
    if (started) return; // déjà démarré

    if (progressDelaySeconds <= 0) {
      // pas de délai, on démarre dans la micro-tâche suivante
      Promise.resolve().then(() => setStarted(true));
      return () => {};
    }

    // Cas avec délai : timer basique en ms
    const id = window.setTimeout(
      () => setStarted(true),
      Math.round(progressDelaySeconds * 1000),
    );
    return () => window.clearTimeout(id);
  }, [progressDelaySeconds, started]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        label
          ? `Clip ${label}`
          : isStopSlot
            ? "Stop slot"
            : "Empty clip"
      }
      aria-pressed={state === "playing"}
      aria-disabled={disabled || undefined}
      onClick={(e) => {
        if (disabled) return;

        // Alt ou Meta → interaction "secondaire" (queue / alt-click)
        if (
          (e as React.MouseEvent).altKey ||
          (e as React.MouseEvent).metaKey
        ) {
          onAltClick?.();
          onQueueToggle?.();
        } else {
          // click normal
          onClick?.();
        }
      }}
      className={`h-full group relative aspect-square w-full select-none rounded-[6px] border border-neutral-700/80 ${bg} ${hover} ${cursor} transition-colors ${borderGlow} ${anim}`}
    >
      {/* Contour interne coloré en fonction du type / couleur (si slot non vide) */}
      {isFilled && (
        <div
          aria-hidden
          className="absolute inset-0 rounded-[5px]"
          style={{ boxShadow: `inset 0 0 0 1px ${baseColor}` }}
        />
      )}

      {/* LED "armed" (ex: piste prête à enregistrer / monitorer) */}
      {isArmed && (
        <div className="absolute right-1.5 top-1.5 z-50 h-2 w-2 rounded-full bg-amber-900 shadow-[0_0_6px_rgba(255,47,47,0.9)]" />
      )}

      {/* Bouton Play / Stop flottant dans la cellule */}
      {isFilled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={
            state === "playing"
              ? "Stop"
              : isStopSlot
                ? "Stop track"
                : "Play"
          }
          onClick={(e) => {
            // Empêche le click de remonter au container (qui gère onClick général)
            e.stopPropagation();

            if (state === "playing") {
              onStop?.();
            } else if (isStopSlot) {
              onStop?.();
            } else {
              onPlay?.();
            }
          }}
          className={`
            absolute right-1.5 top-1/2 -translate-y-1/2
            p-0.5 rounded-[3px] border text-[9px] leading-4
            ${
              state === "playing"
                ? "border-amber-400 bg-amber-400/20 text-amber-300"
                : isStopSlot
                  ? "border-red-500/80 bg-red-900/40 text-red-300"
                  : "border-neutral-600 bg-neutral-700/60 text-neutral-300"
            }
            ${
              state === "queued" || scheduled
                ? "ring-2 ring-red-400 animate-pulse"
                : ""
            }
          `}
        >
          {state === "playing" || isStopSlot ? (
            <SquareIcon size={10} fill="currentColor" />
          ) : (
            <PlayIcon size={10} fill="currentColor" />
          )}
        </button>
      )}

      {/* Label de clip en bas (nom, numéro de scène, etc.) */}
      {label && (
        <div className="pointer-events-none absolute inset-x-1 bottom-1 truncate text-[10px] leading-tight text-neutral-300">
          {label}
        </div>
      )}

      {/* Barre de progression animée (CSS, voir .clip-progress-bar dans le global CSS) */}
      {state === "playing" &&
        progressSeconds &&
        progressSeconds > 0 &&
        started && (
          <div
            aria-hidden
            className="clip-progress-bar"
            style={{
              // durées d’animation passées via CSS custom property
              ["--clipDur" as unknown as string]: `${progressSeconds}s`,
              animationIterationCount: isLoop ? "infinite" : 1,
              animationDelay: `${Math.max(0, progressDelaySeconds)}s`,
            }}
          />
        )}
    </div>
  );
});
