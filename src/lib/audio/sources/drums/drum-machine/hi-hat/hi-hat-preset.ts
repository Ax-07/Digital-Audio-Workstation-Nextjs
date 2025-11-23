import type { HatParams } from "@/lib/audio/sources/drums/drum-machine/types"

export const HIHAT_DEFAULT: HatParams = {
	noiseDurSec: 0.08,
	hpFreqHz: 8000,
	ampAttackSec: 0.002,
	ampPeak: 0.4,
	ampDecaySec: 0.06,
}

export const HIHAT_BRIGHT: Partial<HatParams> = {
	hpFreqHz: 9000,
	ampPeak: 0.5,
	ampDecaySec: 0.08,
}
