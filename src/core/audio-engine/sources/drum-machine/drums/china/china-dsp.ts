import { renderSourceOffline } from "@/core/audio-engine/offline/render-source";
import { HatParams } from "../../types";
import { triggerHat } from "../hi-hat/hi-hat";

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
