import type { HatParams } from "@/lib/audio/sources/drums/drum-machine/types";
import { triggerHat } from "@/lib/audio/sources/drums/drum-machine/hi-hat/hi-hat";
import { renderSourceOffline } from "@/lib/audio/offline/render-source";

/**
 * Déclenche un Crash 1.
 * On utilise le même DSP que le hi-hat, mais avec d'autres paramètres.
 */
export function triggerCrash1(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: HatParams,
) {
  // simple proxy vers triggerHat
  triggerHat(ctx, output, velocity, when, p);
}

/**
 * Rendu offline pour DrumWavePreview.
 */
export async function renderCrash1Array(
  params: HatParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number },
): Promise<Float32Array> {
  const chans = await renderSourceOffline<HatParams>(triggerCrash1, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  });
  return chans[0];
}

export function triggerCrash2(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: HatParams
) {
  triggerHat(ctx, output, velocity, when, p);
}

export async function renderCrash2Array(
  params: HatParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
): Promise<Float32Array> {
  const out = await renderSourceOffline(triggerCrash2, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  });
  return out[0];
}

export function triggerRide(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: HatParams
) {
  // Même DSP que le hi-hat / crash mais nom différent pour clarité
  triggerHat(ctx, output, velocity, when, p);
}

export async function renderRideArray(
  params: HatParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number },
): Promise<Float32Array> {
  const chans = await renderSourceOffline<HatParams>(triggerRide, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  });
  return chans[0];
}

export function triggerRideBell(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: HatParams
) {
  triggerHat(ctx, output, velocity, when, p);
}

export async function renderRideBellArray(
  params: HatParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
): Promise<Float32Array> {
  const out = await renderSourceOffline(triggerRideBell, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  });
  return out[0];
}

export function triggerSplash(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: HatParams
) {
  triggerHat(ctx, output, velocity, when, p);
}

export async function renderSplashArray(
  params: HatParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
): Promise<Float32Array> {
  const out = await renderSourceOffline(triggerSplash, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  });
  return out[0];
}