import { renderSourceOffline } from "@/core/audio-engine/offline/render-source"
import {
  clamp,
  alignToSample,
  safeWhen,
  velToGain,
  makeDistortionCurve,
  makeExpoSweepCurve,
} from "@/core/audio-engine/dsp/dsp-curves"
import { KickParams } from "../../types"

/**
 * Génère un kick dans un contexte audio donné.
 * Tous les layers (body, tail, sub, tok, noise) sont mixés
 * dans une chaîne de disto / EQ / filtre / DC puis vers `output`.
 */
export function triggerKick(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,   // 0..127
  when: number,
  p: KickParams
) {
  // ---------------------------------------------------------------------------
  // Normalisation des paramètres / valeurs par défaut
  // ---------------------------------------------------------------------------

  const vel01 = clamp(velocity / 127, 0, 1)

  // Vélocité → level (simple mapping)
  // On applique la courbe de vélocité sur `vel01` puis on l'applique au niveau
  // au lieu d'appeler `velToGain` sur la valeur finale (ce qui fausse l'échelle).
  const velToAmp = p.velToAmp ?? 1
  const baseLevel = p.level ?? 0.9
  const velGain = velToGain(100)
  const levelScalar = baseLevel * (1 - velToAmp + velToAmp * velGain)
  const amp = levelScalar

  const waveform: OscillatorType = p.waveform ?? "sine"

  const pitchStartHz = Math.max(1, p.pitchStartHz)
  const pitchEndHz = Math.max(1, p.pitchEndHz)

  const sweepMs = p.sweepMs ?? (p.pitchDecaySec ? p.pitchDecaySec * 1000 : 60)
  const sweepCurve = p.sweepCurve ?? 0.5

  const decayMs = p.decayMs ?? (p.ampDecaySec ? p.ampDecaySec * 1000 : 250)
  const atkMs = p.ampAttackMs ?? (p.ampAttackSec ? p.ampAttackSec * 1000 : 2)
  const holdMs = p.ampHoldMs ?? 0
  const ampCurve = p.ampCurve ?? 0.0 // 0..1, 0 = expo-ish

  // Pré-disto
  const preDrive = p.preDrive ?? 1
  const preTone = clamp(p.preTone ?? 0.5, 0, 1)

  const clickLevel = p.clickLevel ?? 0
  const clickMs = p.clickMs ?? 6

  const hpDC = p.hpDC ?? 0.995
  const hpCutFreqHz = p.hpCutFreqHz ?? 28

  const shelfFreqHz = p.shelfFreqHz ?? 2500
  const shelfGainDb = p.shelfGainDb ?? 0
  // IMPORTANT : actif par défaut
  const shelfBypass = p.shelfBypass ?? false

  const clipThreshold = clamp(p.clipThreshold ?? 0.9, 0.6, 1.0)
  const clipSoftness = clamp(p.clipSoftness ?? 0, 0, 1)
  const clipBypass = p.clipBypass ?? false

  // Mapping disto : si aucun distMode fourni mais drive>0, on choisit "soft"
  const distMode: KickParams["distMode"] =
    p.distMode ?? ((p.drive ?? 0) > 0.1 ? "soft" : "off")

  // Amount par défaut = drive si distAmount absent
  const baseDistAmount = p.distAmount ?? (p.drive ?? 0)
  const baseDistMix = clamp(p.distMix ?? 1, 0, 1)
  const baseDistTone = clamp(p.distTone ?? 0.5, 0, 1)

  const velToDist = p.velToDist ?? 0
  const velToTone = p.velToTone ?? 0

  const distAmount =
    baseDistAmount * (1 + (vel01 - 0.5) * velToDist * 1.0)
  const distMix = clamp(baseDistMix, 0, 1)
  const distTone = clamp(
    baseDistTone + (vel01 - 0.5) * velToTone * 0.5,
    0,
    1
  )

  // Enveloppe de disto (sur le wet)
  const distEnvEnabled = p.distEnvEnabled ?? false
  const distEnvAttackMs = p.distEnvAttackMs ?? 2
  const distEnvHoldMs = p.distEnvHoldMs ?? 0
  const distEnvDecayMs = p.distEnvDecayMs ?? 80
  const distEnvAmount = clamp(p.distEnvAmount ?? 0.6, 0, 1)

  const postFilterType = p.postFilterType ?? "none"
  const postFilterFreqHz = p.postFilterFreqHz ?? 0
  const postFilterQ = p.postFilterQ ?? 0.707

  const preDelayMs = p.preDelayMs ?? 20

  // Sub layer
  const subEnabled = p.subEnabled ?? false
  const subLevel = p.subLevel ?? 0
  const subWaveform: OscillatorType = p.subWaveform ?? "sine"
  const subFollowPitch = p.subFollowPitch ?? true
  const subFreqHz =
    p.subFreqHz ??
    (subFollowPitch ? pitchEndHz : 45)
  const subAttackMs = p.subAttackMs ?? 5
  const subDecayMs = p.subDecayMs ?? 400
  const subDrive = p.subDrive ?? 0

  // Tail layer
  const tailEnabled = p.tailEnabled ?? false
  const tailLevel = p.tailLevel ?? 0
  const tailWaveform: OscillatorType = p.tailWaveform ?? waveform
  const tailStartHz = p.tailStartHz ?? pitchStartHz
  const tailEndHz = p.tailEndHz ?? pitchEndHz
  const tailSweepMs = p.tailSweepMs ?? sweepMs
  const tailSweepCurve = p.tailSweepCurve ?? sweepCurve
  const tailDecayMs = p.tailDecayMs ?? decayMs

  // Tok layer
  const tokEnabled = p.tokEnabled ?? false
  const tokLevel = p.tokLevel ?? 0
  const tokWaveform: OscillatorType = p.tokWaveform ?? "square"
  const tokHz = p.tokHz ?? 600
  const tokSweepMs = p.tokSweepMs ?? 0
  const tokDecayMs = p.tokDecayMs ?? 40
  const tokDrive = p.tokDrive ?? 0

  // Noise layer
  const noiseEnabled = p.noiseEnabled ?? false
  const noiseLevel = p.noiseLevel ?? 0
  const noiseColor = p.noiseColor ?? "white"
  const noiseDecayMs = p.noiseDecayMs ?? 60
  const noiseHpHz = p.noiseHpHz ?? 2000
  const noiseBpHz = p.noiseBpHz ?? 4000
  const noiseBpQ = p.noiseBpQ ?? 2.0

  // ---------------------------------------------------------------------------
  // Timing
  // ---------------------------------------------------------------------------

  const sr = ctx.sampleRate
  const t0 = alignToSample(safeWhen(ctx, when, preDelayMs / 1000), sr)

  const bodyEndMs = atkMs + holdMs + decayMs
  const tailEndMs = tailEnabled ? tailDecayMs : 0
  const subEndMs = subEnabled ? subDecayMs : 0
  const tokEndMs = tokEnabled ? tokDecayMs : 0
  const clickEndMs = clickLevel > 0 ? clickMs : 0
  const noiseEndMs = noiseEnabled ? noiseDecayMs : 0

  const longestMs = Math.max(
    bodyEndMs,
    tailEndMs,
    subEndMs,
    tokEndMs,
    clickEndMs,
    noiseEndMs,
    sweepMs,
    tailSweepMs
  )
  const tEnd = t0 + longestMs / 1000 + 0.05

  // ---------------------------------------------------------------------------
  // Bus de mixage avant FX (tous les layers y arrivent)
  // ---------------------------------------------------------------------------

  const preFXBus = ctx.createGain()
  preFXBus.gain.setValueAtTime(1, t0)

  // ---------------------------------------------------------------------------
  // BODY LAYER : osc principal + enveloppe d’amp + sweep de pitch
  // ---------------------------------------------------------------------------

  const bodyOsc = ctx.createOscillator()
  bodyOsc.type = waveform

  // Pitch envelope pour le body
  const bodyFreqCurve = makeExpoSweepCurve(
    pitchStartHz,
    pitchEndHz,
    sweepCurve,
    256
  )
  bodyOsc.frequency.setValueAtTime(pitchStartHz, t0)
  bodyOsc.frequency.setValueCurveAtTime(bodyFreqCurve, t0, sweepMs / 1000)
  bodyOsc.frequency.setValueAtTime(pitchEndHz, t0 + sweepMs / 1000)

  // Enveloppe d’amp avec attack/hold/decay + curve
  const bodyGain = ctx.createGain()
  const atk = Math.max(0.0005, atkMs / 1000)
  const hold = Math.max(0, holdMs / 1000)
  const dec = Math.max(0.001, decayMs / 1000)

  const bodyFloor = 0.0005

  bodyGain.gain.setValueAtTime(0, t0)
  // Attack linéaire
  bodyGain.gain.linearRampToValueAtTime(amp, t0 + atk)
  // Hold
  if (hold > 0) {
    bodyGain.gain.setValueAtTime(amp, t0 + atk + hold)
  }
  // Decay avec une courbe entre linéaire et expo
  const tDecayEnd = t0 + atk + hold + dec
  if (ampCurve <= 0.1) {
    // expo-ish
    bodyGain.gain.exponentialRampToValueAtTime(bodyFloor, tDecayEnd)
  } else if (ampCurve >= 0.9) {
    // linéaire
    bodyGain.gain.linearRampToValueAtTime(0, tDecayEnd)
  } else {
    // mix lin/expo
    const mid = t0 + atk + hold + dec * 0.5
    bodyGain.gain.exponentialRampToValueAtTime(amp * 0.25, mid)
    bodyGain.gain.exponentialRampToValueAtTime(bodyFloor, tDecayEnd)
  }

  // FIX: Silence absolu avant le stop pour éviter le clic (amplifié par la disto)
  // Cela évite les artefacts de phase variables lors du chevauchement avec le kick suivant
  bodyGain.gain.linearRampToValueAtTime(0, tEnd)

  bodyOsc.connect(bodyGain)
  bodyGain.connect(preFXBus)

  bodyOsc.start(t0)
  bodyOsc.stop(tEnd)

  // ---------------------------------------------------------------------------
  // TAIL LAYER : body tonal secondaire (hardstyle / frenchcore)
  // ---------------------------------------------------------------------------

  if (tailEnabled && tailLevel > 0) {
    const tailOsc = ctx.createOscillator()
    tailOsc.type = tailWaveform

    const tailFreqCurve = makeExpoSweepCurve(
      Math.max(1, tailStartHz),
      Math.max(1, tailEndHz),
      tailSweepCurve,
      256
    )
    tailOsc.frequency.setValueAtTime(Math.max(1, tailStartHz), t0)
    tailOsc.frequency.setValueCurveAtTime(
      tailFreqCurve,
      t0,
      tailSweepMs / 1000
    )
    tailOsc.frequency.setValueAtTime(
      Math.max(1, tailEndHz),
      t0 + tailSweepMs / 1000
    )

    const tailGain = ctx.createGain()
    const tailAmp = tailLevel * velGain
    tailGain.gain.setValueAtTime(0, t0)
    tailGain.gain.linearRampToValueAtTime(tailAmp, t0 + 0.003)
    tailGain.gain.exponentialRampToValueAtTime(
      0.0005,
      t0 + Math.max(0.01, tailDecayMs / 1000)
    )
    tailGain.gain.linearRampToValueAtTime(0, tEnd)

    tailOsc.connect(tailGain)
    tailGain.connect(preFXBus)

    tailOsc.start(t0)
    tailOsc.stop(tEnd)
  }

  // ---------------------------------------------------------------------------
  // SUB LAYER : sous-basse interne
  // ---------------------------------------------------------------------------

  if (subEnabled && subLevel > 0) {
    const subOsc = ctx.createOscillator()
    subOsc.type = subWaveform

    const subFreq = Math.max(20, Math.min(200, subFreqHz))
    subOsc.frequency.setValueAtTime(subFreq, t0)

    const subGain = ctx.createGain()
    const subAmp = subLevel * velGain
    const subAtk = Math.max(0.0005, subAttackMs / 1000)
    subGain.gain.setValueAtTime(0, t0)
    subGain.gain.linearRampToValueAtTime(subAmp, t0 + subAtk)
    subGain.gain.exponentialRampToValueAtTime(
      0.0005,
      t0 + Math.max(0.01, subDecayMs / 1000)
    )
    subGain.gain.linearRampToValueAtTime(0, tEnd)

    // petit drive local sur le sub
    if (subDrive > 0) {
      const subShaper = ctx.createWaveShaper()
      const subCurve = makeDistortionCurve(subDrive)
      const c2 = new Float32Array(subCurve.length)
      c2.set(subCurve as ArrayLike<number>)
      subShaper.curve = c2
      subShaper.oversample = "2x"

      subOsc.connect(subGain)
      subGain.connect(subShaper)
      subShaper.connect(preFXBus)
    } else {
      subOsc.connect(subGain)
      subGain.connect(preFXBus)
    }

    subOsc.start(t0)
    subOsc.stop(tEnd)
  }

  // ---------------------------------------------------------------------------
  // TOK LAYER : attaque très courte, style hardstyle/gabber
  // ---------------------------------------------------------------------------

  if (tokEnabled && tokLevel > 0) {
    const tokOsc = ctx.createOscillator()
    tokOsc.type = tokWaveform

    const tokStartHz = tokSweepMs && tokSweepMs > 0 ? tokHz * 2 : tokHz
    tokOsc.frequency.setValueAtTime(tokStartHz, t0)
    if (tokSweepMs > 0) {
      tokOsc.frequency.linearRampToValueAtTime(
        tokHz,
        t0 + tokSweepMs / 1000
      )
    }

    const tokGain = ctx.createGain()
    const tokAmp = tokLevel * velGain
    tokGain.gain.setValueAtTime(tokAmp, t0)
    tokGain.gain.exponentialRampToValueAtTime(
      0.0005,
      t0 + Math.max(0.005, tokDecayMs / 1000)
    )
    tokGain.gain.linearRampToValueAtTime(0, tEnd)

    // Filtre LP pour limiter les harmoniques aigues du tok
    const tokLp = ctx.createBiquadFilter()
    tokLp.type = "lowpass"
    tokLp.frequency.setValueAtTime(Math.min(8000, tokHz * 4), t0)
    tokLp.Q.setValueAtTime(0.707, t0)

    if (tokDrive > 0) {
      const tokShaper = ctx.createWaveShaper()
      const tokCurve = makeDistortionCurve(tokDrive)
      const cTok = new Float32Array(tokCurve.length)
      cTok.set(tokCurve as ArrayLike<number>)
      tokShaper.curve = cTok
      tokShaper.oversample = "2x"

      tokOsc.connect(tokGain)
      tokGain.connect(tokShaper)
      tokShaper.connect(tokLp)
      tokLp.connect(preFXBus)
    } else {
      tokOsc.connect(tokGain)
      tokGain.connect(tokLp)
      tokLp.connect(preFXBus)
    }

    tokOsc.start(t0)
    tokOsc.stop(tEnd)
  }

  // ---------------------------------------------------------------------------
  // DISTORSION / FX CHAIN
  // preFXBus -> preDriveShaper -> dist (dry/wet) -> shelf -> HP -> postFilter -> DC
  // ---------------------------------------------------------------------------

  // Tone simple avant disto (LP macro)
  const preToneFilter = ctx.createBiquadFilter()
  preToneFilter.type = "lowpass"
  const preToneMin = 3000
  const preToneMax = 18000
  const preToneFreq = preToneMin + (preToneMax - preToneMin) * preTone
  preToneFilter.frequency.setValueAtTime(preToneFreq, t0)
  preToneFilter.Q.setValueAtTime(0.707, t0)

  // Pre-drive / pre-shaper (bypass si preDrive proche de 0)
  if (preDrive > 0.01) {
    const preDriveShaper = ctx.createWaveShaper()
    const preCurveSrc = makeDistortionCurve(preDrive)
    const preCurve = new Float32Array(preCurveSrc.length)
    preCurve.set(preCurveSrc as ArrayLike<number>)
    preDriveShaper.curve = preCurve
    preDriveShaper.oversample = "2x"

    preFXBus.connect(preDriveShaper)
    preDriveShaper.connect(preToneFilter)
  } else {
    // Bypass : connexion directe
    preFXBus.connect(preToneFilter)
  }

  // Distorsion principale (wave shaper)
  const distShaper = ctx.createWaveShaper()

  let distCurve: Float32Array
  const amt = Math.max(0, distAmount)

  if (distMode === "off" || amt <= 0.0001) {
    // courbe quasi linéaire
    distCurve = makeDistortionCurve(0)
  } else if (distMode === "soft") {
    distCurve = makeDistortionCurve(amt)
  } else if (distMode === "hard") {
    distCurve = makeDistortionCurve(amt * 1.5)
  } else if (distMode === "fold") {
    const len = 1024
    distCurve = new Float32Array(len)
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * 2 - 1
      const f = x * (1 + amt)
      distCurve[i] = 1 - Math.abs(((f + 1) % 4) - 2)
    }
  } else {
    // "bit" (quantization)
    const len = 1024
    distCurve = new Float32Array(len)
    const steps = 16 + Math.floor(amt * 4)
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * 2 - 1
      const q = 1 / steps
      distCurve[i] = Math.round(x / q) * q
    }
  }

  const distCurveCopy = new Float32Array(distCurve.length)
  distCurveCopy.set(distCurve as ArrayLike<number>)
  distShaper.curve = distCurveCopy
  distShaper.oversample = "2x"

  // Tone dans la branche wet (LP dépendant de distTone)
  const distToneFilter = ctx.createBiquadFilter()
  distToneFilter.type = "lowpass"
  const toneMin = 1000
  const toneMax = 16000
  const toneFreq = toneMin + (toneMax - toneMin) * distTone
  distToneFilter.frequency.setValueAtTime(toneFreq, t0)
  distToneFilter.Q.setValueAtTime(0.707, t0)

  // Clipper
  const clipper = ctx.createWaveShaper()
  const clipCurve = new Float32Array(1024)
  if (clipBypass) {
    // courbe linéaire
    for (let i = 0; i < clipCurve.length; i++) {
      const x = (i / (clipCurve.length - 1)) * 2 - 1
      clipCurve[i] = x
    }
  } else {
    // Hard clip ou soft-ish clip selon clipSoftness
    for (let i = 0; i < clipCurve.length; i++) {
      const x = (i / (clipCurve.length - 1)) * 2 - 1
      let y = x
      const th = clipThreshold

      if (clipSoftness <= 0.001) {
        // hard clip
        y = Math.max(-th, Math.min(th, x)) / th
      } else {
        // soft-ish : compresse progressivement autour du seuil
        const k = 1 + clipSoftness * 10
        const s = Math.max(-th, Math.min(th, x))
        y = (s / th) / (1 + k * Math.abs(s / th))
      }

      clipCurve[i] = y
    }
  }
  clipper.curve = clipCurve
  clipper.oversample = "2x"

  // Dry/wet disto
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  const baseWet = distMix

  dryGain.gain.setValueAtTime(1 - distMix, t0)
  wetGain.gain.setValueAtTime(baseWet, t0)
  const distMixBus = ctx.createGain()

  preToneFilter.connect(dryGain)
  dryGain.connect(distMixBus)

  preToneFilter.connect(distShaper)
  distShaper.connect(distToneFilter)
  distToneFilter.connect(clipper)
  clipper.connect(wetGain)
  wetGain.connect(distMixBus)

  // Enveloppe sur le wet de la disto (attaque moins saturée, decay plus saturé)
  if (distEnvEnabled && baseWet > 0 && distEnvAmount > 0) {
    const A = Math.max(0, distEnvAttackMs / 1000)
    const H = Math.max(0, distEnvHoldMs / 1000)
    const D = Math.max(0, distEnvDecayMs / 1000)

    const start = t0
    const attackEnd = start + A
    const holdEnd = attackEnd + H
    const decayEnd = holdEnd + D

    const minWet = baseWet * (1 - distEnvAmount) // moins de disto pendant l’attaque

    wetGain.gain.cancelScheduledValues(start)
    wetGain.gain.setValueAtTime(minWet, start)

    // Attack : on reste à minWet (si tu veux une vraie courbe, tu peux bouger)
    wetGain.gain.linearRampToValueAtTime(minWet, attackEnd)

    // Hold
    wetGain.gain.setValueAtTime(minWet, holdEnd)

    // Decay vers full wet
    wetGain.gain.linearRampToValueAtTime(baseWet, decayEnd)
    wetGain.gain.setValueAtTime(baseWet, tEnd)
  }

  // Shelf post-disto
  const shelf = ctx.createBiquadFilter()
  shelf.type = "highshelf"
  shelf.frequency.setValueAtTime(shelfFreqHz, t0)
  shelf.gain.setValueAtTime(shelfGainDb, t0)

  // High-pass (x2) pour resserrer l’infra
  const hp1 = ctx.createBiquadFilter()
  hp1.type = "highpass"
  hp1.frequency.setValueAtTime(hpCutFreqHz, t0)
  hp1.Q.setValueAtTime(0.707, t0)

  const hp2 = ctx.createBiquadFilter()
  hp2.type = "highpass"
  hp2.frequency.setValueAtTime(hpCutFreqHz, t0)
  hp2.Q.setValueAtTime(0.707, t0)

  // Post-filter optionnel
  let postFilterOut: AudioNode = hp2
  if (postFilterType !== "none" && postFilterFreqHz > 0) {
    const postFilter = ctx.createBiquadFilter()
    postFilter.frequency.setValueAtTime(postFilterFreqHz, t0)
    postFilter.Q.setValueAtTime(postFilterQ, t0)

    switch (postFilterType) {
      case "lp":
        postFilter.type = "lowpass"
        break
      case "hp":
        postFilter.type = "highpass"
        break
      case "bp":
        postFilter.type = "bandpass"
        break
      case "notch":
        postFilter.type = "notch"
        break
      default:
        postFilter.type = "lowpass"
        break
    }

    hp2.connect(postFilter)
    postFilterOut = postFilter
  }

  // DC block final
  const dcBlock = ctx.createIIRFilter([1, -1], [1, -hpDC])
  // Chaînage global FX
  if (shelfBypass) {
    distMixBus.connect(hp1)
  } else {
    distMixBus.connect(shelf)
    shelf.connect(hp1)
  }
  hp1.connect(hp2)
  postFilterOut.connect(dcBlock)

  // Final make-up gain (configurable par preset)
  // Permet d'ajuster le niveau de sortie sans modifier la chaîne interne.
  const finalMakeupGain = p.makeupGain ?? 1.0
  const finalGain = ctx.createGain()
  finalGain.gain.setValueAtTime(finalMakeupGain, t0)
  dcBlock.connect(finalGain)
  finalGain.connect(output)

  // ---------------------------------------------------------------------------
  // CLICK SINUS SIMPLE (post-disto mais dans EQ / HP / DC)
  // ---------------------------------------------------------------------------

  if (clickLevel > 0.001) {
    const clickOsc = ctx.createOscillator()
    clickOsc.type = "sine"
    // Fréquence réduite pour un click moins agressif
    clickOsc.frequency.setValueAtTime(1500, t0)

    const clickGain = ctx.createGain()
    clickGain.gain.setValueAtTime(clickLevel * vel01, t0)
    clickGain.gain.exponentialRampToValueAtTime(
      0.0005,
      t0 + Math.max(0.001, clickMs / 1000)
    )
    clickGain.gain.linearRampToValueAtTime(0, tEnd)

    // Filtre LP pour adoucir le click
    const clickLp = ctx.createBiquadFilter()
    clickLp.type = "lowpass"
    clickLp.frequency.setValueAtTime(3000, t0)
    clickLp.Q.setValueAtTime(0.707, t0)

    if (shelfBypass) {
      clickOsc.connect(clickGain).connect(clickLp).connect(hp1)
    } else {
      clickOsc.connect(clickGain).connect(clickLp).connect(shelf)
    }

    clickOsc.start(t0)
    clickOsc.stop(
      t0 + Math.max(0.001, clickMs / 1000) + 0.01
    )
  }

  // ---------------------------------------------------------------------------
  // NOISE LAYER (transient noisy)
  // ---------------------------------------------------------------------------

  if (noiseEnabled && noiseLevel > 0) {
    const dur = tEnd - t0
    const noiseBuffer = ctx.createBuffer(1, Math.ceil(dur * sr), sr)
    const data = noiseBuffer.getChannelData(0)

    // bruit blanc (on pourrait raffiner pour "pink")
    // FIX: Utilisation d'un générateur déterministe pour garantir le même son à chaque trigger
    let seed = 123456789
    for (let i = 0; i < data.length; i++) {
      seed = (1664525 * seed + 1013904223) % 4294967296
      data[i] = (seed / 4294967296) * 2 - 1
    }

    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = noiseBuffer
    noiseSource.loop = false

    const noiseFilter = ctx.createBiquadFilter()
    if (noiseColor === "band") {
      noiseFilter.type = "bandpass"
      noiseFilter.frequency.setValueAtTime(noiseBpHz, t0)
      noiseFilter.Q.setValueAtTime(noiseBpQ, t0)
    } else {
      // white/pink → HP
      noiseFilter.type = "highpass"
      noiseFilter.frequency.setValueAtTime(noiseHpHz, t0)
      noiseFilter.Q.setValueAtTime(0.707, t0)
    }

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(noiseLevel * vel01, t0)
    noiseGain.gain.exponentialRampToValueAtTime(
      0.0005,
      t0 + Math.max(0.001, noiseDecayMs / 1000)
    )
    noiseGain.gain.linearRampToValueAtTime(0, tEnd)

    // on ajoute le bruit à la sortie finale (post-FX), pour ne pas le re-filtrer
    noiseSource
      .connect(noiseFilter)
      .connect(noiseGain)
      .connect(output)

    noiseSource.start(t0)
    noiseSource.stop(tEnd)
  }

  // Retourne une fonction pour couper le son (choke)
  return {
    stop: (stopTime: number) => {
      // Fade out rapide (5ms) pour éviter le clic
      try {
        // On utilise finalMakeupGain car .value peut ne pas être à jour
        const currentGain = finalMakeupGain
        finalGain.gain.cancelScheduledValues(stopTime)
        finalGain.gain.setValueAtTime(currentGain, stopTime)
        finalGain.gain.linearRampToValueAtTime(0, stopTime + 0.005)
        
        // Arrêt des oscillateurs un peu après pour être sûr
        const killTime = stopTime + 0.01
        bodyOsc.stop(killTime)
        // On pourrait arrêter les autres, mais le gain à 0 suffit
      } catch {
        // Ignorer si déjà arrêté
      }
    }
  }
}

/**
 * Rendu offline du kick pour affichage (DrumWavePreview)
 */
export async function renderKickArray(
  params: KickParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
) {
  const chans = await renderSourceOffline<KickParams>(triggerKick, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  })
  return chans[0]
}
