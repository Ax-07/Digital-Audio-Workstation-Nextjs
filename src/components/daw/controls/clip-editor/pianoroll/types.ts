// src/components/daw/controls/clip-editor/pianoroll/types.ts

import type { GridValue, MidiNote } from "@/lib/audio/types";

export type DraftNote = MidiNote & { __id: number };

export type PianoRollProps = {
  notes: ReadonlyArray<MidiNote>; // liste des notes (time, pitch, duration, velocity, etc.)
  lengthBeats?: number; // longueur du clip en beats
  onChange?: (notes: MidiNote[]) => void; // callback quand les notes sont modifiées
  onDraftChange?: (notes: MidiNote[]) => void; // callback pendant le drag / preview
  loop?: { start: number; end: number } | null; // région de loop clip-local
  onLoopChange?: (loop: { start: number; end: number } | null) => void; // 
  position?: number; // en beats, offset de lecture
  getPlayheadBeat?: () => number | null;
  onSeek?: (beat: number) => void;
  onLengthChange?: (beats: number) => void;
  onPositionChange?: (beat: number) => void;
  followPlayhead?: boolean;
  isPlaying?: boolean;

  // Contrôles optionnels (controlled/uncontrolled)
  grid?: GridValue;
  onGridChange?: (next: GridValue) => void;
  snap?: boolean;
  onSnapChange?: (next: boolean) => void;
  pxPerBeat?: number; // 16–192 recommandé
  onPxPerBeatChange?: (next: number) => void;

  // Identifiant de la piste pour preview MIDI
  trackId?: string;
};

export type DragMode =
  | null
  | "move"
  | "resize"
  | "rectangleSelection"
  | "loopStart"
  | "loopEnd"
  | "loopMove"
  | "setPlayhead"
  | "resizeClip";

export type CursorType = "default" | "pointer" | "ew-resize" | "crosshair";

export type PointerStartState = {
  x: number;
  y: number;
  noteIndex: number | null;
  initial: DraftNote[];
  loopStart?: number;
  loopEnd?: number;
  initialLength?: number;
} | null;

export type RectangleSelectionState = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} | null;

export type DragGuideState = {
  xCss: number;
  yCss: number;
  beat: number;
  pitch: number;
} | null;

export type LoopDragState = {
  kind: "start" | "end" | "move";
  x0: number;
  initial: { start: number; end: number };
} | null;

export type PerfStats = {
  lastDrawMs: number;
  avgMs: number;
  samples: number;
  visible: number;
  total: number;
  lastUpdate: number;
};

/**
 * État d’interaction courant dans le PianoRoll.
 */
export type InteractionState = {
  /** Touche clavier pressée (MIDI) */
  pressedKey: number | null;
  /** Note en hover (MIDI) */
  hoverPitch: number | null;
  /** Note en hover (index) */
  hoverNote: number | null;
  /** Note fantôme (en cours de création via clavier MIDI) */
  ghost: { time: number; pitch: number } | null;
  /** État au début du pointerDown */
  pointerStart: PointerStartState;
  /** */
  rectangleSelection: RectangleSelectionState;
  /** */
  dragGuide: DragGuideState;
  /** */
  loopDrag: LoopDragState;
  /** Liste des indices de notes sélectionnées */
  selected: number[];
  /** Mode de drag actif (move, resize, loop...) */
  dragMode: DragMode;
  /** Curseur courant (CSS) */
  cursor: CursorType;
  /** Cache du rect du canvas pour éviter recalculs fréquents */
  canvasRectCache: DOMRect | null;
};
