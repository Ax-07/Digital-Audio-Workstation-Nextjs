// src/lib/stores/drum-machine.store.ts
import { create } from "zustand/react";

/**
 * Mapping of drum instruments to MIDI note numbers.
 */
export type DrumMapping = {
  readonly kick: number[];
  readonly snare: number[];
  readonly hh: number[];
  readonly hhOpen: number[];
  readonly tomLow: number[];
  readonly tomMid: number[];
  readonly tomHigh: number[];
  readonly tomFloor: number[];
  readonly crash1: number[];
  readonly china: number[];
  readonly ride1: number[];
  readonly rideBell: number[];
  readonly splash: number[];
  readonly crash2: number[];
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
  // 42 = closed hi-hat, 44 = pedal, 46 = open hi-hat
  hh: [42, 44],
  hhOpen: [46],
  tomLow: [41],
  tomMid: [45],
  tomHigh: [48],
  tomFloor: [43],
  crash1: [49],
  china: [52],
  ride1: [51],
  rideBell: [53],
  splash: [55],
  crash2: [57]
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
        hhOpen: mapping.hhOpen ?? prev.hhOpen ?? [46],
        tomLow: mapping.tomLow ?? prev.tomLow,
        tomMid: mapping.tomMid ?? prev.tomMid,
        tomHigh: mapping.tomHigh ?? prev.tomHigh,
        tomFloor: mapping.tomFloor ?? prev.tomFloor,
        crash1: mapping.crash1 ?? prev.crash1,
        china: mapping.china ?? prev.china,
        ride1: mapping.ride1 ?? prev.ride1,
        rideBell: mapping.rideBell ?? prev.rideBell,
        splash: mapping.splash ?? prev.splash,
        crash2: mapping.crash2 ?? prev.crash2,
      };
      return { byTrack: { ...s.byTrack, [trackId]: next } };
    }),
}));
