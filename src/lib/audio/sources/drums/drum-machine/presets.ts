import type { DrumPreset } from "@/lib/audio/sources/drums/drum-machine/types"
import { KICK_909 } from "@/lib/audio/sources/drums/drum-machine/kick/kick-preset"
import { SNARE_DEFAULT } from "@/lib/audio/sources/drums/drum-machine/snare/snare-preset"
import {
  HIHAT_DEFAULT,
  HIHAT_OPEN_DEFAULT,
} from "@/lib/audio/sources/drums/drum-machine/hi-hat/hi-hat-preset";import {
  TOM_LOW,
  TOM_MID,
  TOM_HIGH,
  TOM_FLOOR,
} from "@/lib/audio/sources/drums/drum-machine/tom/tom-preset";
import { CRASH1_DEFAULT, CRASH2_DEFAULT, RIDE_DEFAULT, RIDEBELL_DEFAULT, SPLASH_DEFAULT } from "@/lib/audio/sources/drums/drum-machine/crash/crash-preset";
import { CHINA_DEFAULT } from "@/lib/audio/sources/drums/drum-machine/china/china-preset";

export const DEFAULT_PRESET: DrumPreset = {
  kick: KICK_909,
  snare: SNARE_DEFAULT,
  hh: HIHAT_DEFAULT,
  hhOpen: HIHAT_OPEN_DEFAULT,
  toms: {
    low: TOM_LOW,
    mid: TOM_MID,
    high: TOM_HIGH,
    floor: TOM_FLOOR,
  },
  crash1: CRASH1_DEFAULT,
  crash2: CRASH2_DEFAULT,
  ride: RIDE_DEFAULT,
  rideBell: RIDEBELL_DEFAULT,
  splash: SPLASH_DEFAULT,
  china: CHINA_DEFAULT,
}
