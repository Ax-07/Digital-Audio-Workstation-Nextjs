import { GenericTriggerFn } from "@/core/audio-engine/dsp/dsp-curves"

export type OfflineSourceRenderOpts = {
  sampleRate?: number          // défaut 48000
  durationMs?: number          // durée maximale de rendu
  velocity?: number            // 0..127 (si pertinent, ignoré sinon)
  startOffsetMs?: number       // sécurité planification (défaut 20ms)
  channels?: number            // nombre de canaux (défaut 1)
  postProcess?: (ctx: OfflineAudioContext, out: AudioNode) => void | Promise<void>
}

/**
 * Rendu offline générique pour toute source (drum, synth, bruit, etc.)
 * Permet d'intercaler un pipeline FX via postProcess.
 */
export async function renderSourceOffline<P>(
  trigger: GenericTriggerFn<P>,
  params: P,
  opts: OfflineSourceRenderOpts = {}
): Promise<Float32Array[]> {
  const sr = opts.sampleRate ?? 48000
  const durMs = opts.durationMs ?? 500
  const frames = Math.max(1, Math.floor((durMs / 1000) * sr))
  const channels = Math.max(1, opts.channels ?? 1)

  // 1) Contexte offline multi-canaux
  const offline = new OfflineAudioContext(channels, frames, sr)

  // 2) Sortie (point d'insertion FX chain custom)
  const out = offline.createGain()
  out.gain.value = 1
  out.connect(offline.destination)

  // 3) FX pipeline optionnel (ex: limiter, EQ pré-rendu)
  if (opts.postProcess) {
    await opts.postProcess(offline, out)
  }

  // 4) Déclenchement
  const vel = opts.velocity ?? 120
  const when = (opts.startOffsetMs ?? 20) / 1000
  trigger(offline, out, vel, when, params)

  // 5) Rendu
  const rendered = await offline.startRendering()

  // 6) Extraction canaux
  const result: Float32Array[] = []
  for (let ch = 0; ch < channels; ch++) {
    const arr = new Float32Array(rendered.length)
    rendered.copyFromChannel(arr, ch, 0)
    result.push(arr)
  }
  return result
}
