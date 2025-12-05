import { CHINA_DEFAULT } from "./drums/china/china-preset";
import { CRASH1_DEFAULT, CRASH2_DEFAULT, RIDE_DEFAULT, RIDEBELL_DEFAULT, SPLASH_DEFAULT } from "./drums/crash/crash-preset";
import { HIHAT_DEFAULT, HIHAT_OPEN_DEFAULT } from "./drums/hi-hat/hi-hat-preset";
import { KICK_909 } from "./drums/kick/kick-preset";
import { SNARE_DEFAULT } from "./drums/snare/snare-preset";
import { TOM_FLOOR, TOM_HIGH, TOM_LOW, TOM_MID } from "./drums/tom/tom-preset";
import { DrumPreset } from "./types";

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
