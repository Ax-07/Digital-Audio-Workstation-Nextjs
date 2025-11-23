// src/lib/audio/offline/render-drum.ts
type TriggerFn<P> = (
  ctx: BaseAudioContext,        // OfflineAudioContext ou AudioContext
  output: AudioNode,
  velocity: number,             // 0..127
  when: number,                 // secondes
  params: P
) => void

export type OfflineRenderOpts = {
  sampleRate?: number       // défaut 48000
  durationMs?: number       // défaut 500 ms
  velocity?: number         // défaut 120
  startOffsetMs?: number    // sécurité planif (défaut 20 ms)
}

export async function renderDrumOffline<P>(
  trigger: TriggerFn<P>,
  params: P,
  opts: OfflineRenderOpts = {}
) {
  const sr = opts.sampleRate ?? 48000
  const durMs = opts.durationMs ?? 500
  const frames = Math.max(1, Math.floor((durMs / 1000) * sr))

  // 1) Contexte offline
  const offline = new OfflineAudioContext(1, frames, sr)

  // 2) Sortie simple (tu peux intercaler ton FX rack ici si tu veux)
  const out = offline.createGain()
  out.gain.value = 1
  out.connect(offline.destination)

  // 3) Déclenchement via TON moteur
  const vel = opts.velocity ?? 120
  const when = (opts.startOffsetMs ?? 20) / 1000
  trigger(offline, out, vel, when, params)

  // 4) Rendu
  const rendered = await offline.startRendering()

  // 5) Extraction du canal mono en Float32Array
  const arr = new Float32Array(rendered.length)
  rendered.copyFromChannel(arr, 0, 0)
  return arr
}
