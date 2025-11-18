// src/lib/audio/core/session-player/types.ts

import type { MidiNote } from "@/lib/audio/types";

/**
 * Représente un clip actif (audio ou MIDI) dans le lecteur de session.
 */
export type ActiveClip = {
  type: "audio" | "midi";
  clipId: string;
  stop: () => void;
  stopAt?: (whenSec: number) => void;
  whenSec?: number;
  bpm?: number;
};

/**
 * Représente une boucle MIDI active avec son état de scheduling.
 */
export type MidiLoopInfo = {
  unsub: () => void;
  when0: number;
  loopLenSec: number;
  nextIndex: number;
  notesCycle: MidiNote[];
  lastScheduledWhen?: number;
  lastLoopStart?: number;
  lastLoopEnd?: number;
  lastRefreshAt?: number;
};

/**
 * Options de démarrage pour un clip audio.
 */
export type AudioClipOptions = {
  loop?: boolean;
  loopStartSec?: number;
  loopEndSec?: number;
  stopAfterSec?: number;
};

/**
 * Configuration d'instrument pour une piste MIDI.
 */
export type InstrumentConfig = {
  kind: "simple-synth" | "dual-synth";
  params: Record<string, unknown>;
};

