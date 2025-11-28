import type { HatParams } from "@/lib/audio/sources/drums/drum-machine/types";
import { triggerHat } from "@/lib/audio/sources/drums/drum-machine/hi-hat/hi-hat";
import { renderSourceOffline } from "@/lib/audio/offline/render-source";

/**
 * Pour l'instant on réutilise la synthèse du hi-hat
 * mais avec des presets plus longs / plus “trash” (CHINA_DEFAULT).
 * Si tu veux un algo vraiment différent, on pourra le spécialiser plus tard.
 */
export function triggerChina(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: HatParams
) {
  triggerHat(ctx, output, velocity, when, p);
}

/** Rendu offline pour DrumWavePreview */
export async function renderChinaArray(
  params: HatParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
): Promise<Float32Array> {
  const ch = await renderSourceOffline<HatParams>(triggerChina, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  });
  return ch[0];
}
