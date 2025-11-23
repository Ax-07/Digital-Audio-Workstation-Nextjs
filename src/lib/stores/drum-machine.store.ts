// src/lib/stores/drum-machine.store.ts
import { create } from "zustand/react";

/**
 * Mapping of drum instruments to MIDI note numbers.
 */
export type DrumMapping = {
  readonly kick: number[];
  readonly snare: number[];
  readonly hh: number[];
};

/**
 * State and actions for the drum machine store.
 */
export type DrumMachineState = {
  byTrack: Readonly<Record<string, DrumMapping>>;
};

/**
 * Actions for the drum machine store.
 */
export type DrumMachineActions = {
  /**
   * Get the drum mapping for a specific track.
   * @param trackId 
   * @returns 
   */
  getMapping: (trackId: string) => DrumMapping;
  /**
   * Set the drum mapping for a specific track.
   * @param trackId 
   * @param mapping 
   * @returns 
   */
  setMapping: (trackId: string, mapping: Partial<DrumMapping>) => void;
};

/**
 * Combined type for the drum machine store.
 */
export type DrumMachineStore = DrumMachineState & DrumMachineActions;

/**
 * Default drum mapping.
 */
const DEFAULT_MAPPING: DrumMapping = {
  kick: [36, 35],
  snare: [38, 40],
  hh: [42, 44, 46],
};

/**
 * Zustand store for managing drum machine mappings.
 */
export const useDrumMachineStore = create<DrumMachineStore>((set, get) => ({
  byTrack: {},
  getMapping: (trackId: string) => {
    const m = get().byTrack[trackId];
    return m ? m : DEFAULT_MAPPING;
  },
  setMapping: (trackId: string, mapping: Partial<DrumMapping>) =>
    set((s) => {
      const prev = s.byTrack[trackId] ?? DEFAULT_MAPPING;
      const next: DrumMapping = {
        kick: mapping.kick ?? prev.kick,
        snare: mapping.snare ?? prev.snare,
        hh: mapping.hh ?? prev.hh,
      };
      return { byTrack: { ...s.byTrack, [trackId]: next } };
    }),
}));
