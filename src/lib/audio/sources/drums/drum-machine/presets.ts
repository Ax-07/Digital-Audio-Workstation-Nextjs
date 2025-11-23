import type { DrumPreset } from "@/lib/audio/sources/drums/drum-machine/types"
import { KICK_DEFAULT } from "@/lib/audio/sources/drums/drum-machine/kick/kick-preset"
import { SNARE_DEFAULT } from "@/lib/audio/sources/drums/drum-machine/snare/snare-preset"
import { HIHAT_DEFAULT } from "@/lib/audio/sources/drums/drum-machine/hi-hat/hi-hat-preset"

export const DEFAULT_PRESET: DrumPreset = {
  kick: KICK_DEFAULT,
  snare: SNARE_DEFAULT,
  hh: HIHAT_DEFAULT,
}
