import type { SnareParams } from "@/lib/audio/sources/drums/drum-machine/types"

export const SNARE_DEFAULT: SnareParams = {
	noiseDurSec: 0.2,
	bpFreqHz: 1800,
	bpQ: 0.8,
	hpFreqHz: 700,
	ampAttackSec: 0.003,
	ampPeak: 0.7,
	ampDecaySec: 0.18,
}

export const SNARE_TIGHT: Partial<SnareParams> = {
	noiseDurSec: 0.15,
	bpFreqHz: 2200,
	bpQ: 1.2,
	hpFreqHz: 900,
	ampPeak: 0.75,
}
