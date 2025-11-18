/* MasterBus: wraps master gain + analyser for monitoring.
   Follows audio instructions: single analyser (fftSize 1024, smoothing 0.7).
   No allocations in render loop; buffers pre-created.

   FR :
   MasterBus
   ---------
   Rôle :
   - Se branche sur le masterGain de l’AudioEngine pour analyser le signal global.
   - Fournit :
       • un niveau RMS + peak en linéaire (0..1)
       • un LUFS K-weighted approximatif (lecture plus rare, ≤ 10 Hz)
   - Respecte les contraintes perf :
       • un seul AnalyserNode
       • fftSize = 1024, smoothing = 0.7
       • aucun new / alloc dans la boucle de rendu (buffers précréés)
*/

import { AudioEngine } from "@/lib/audio/core/audio-engine";

export type MasterAnalysis = {
  readonly rms: number;  // niveau RMS (linéaire 0..1)
  readonly peak: number; // valeur de crête (linéaire 0..1)
};

/**
 * MasterBus
 * ---------
 * Singleton qui encapsule :
 * - un AnalyserNode raccordé au masterGain de l’audio engine
 * - des buffers réutilisables pour :
 *    • time-domain (analyse RMS/peak)
 *    • freq-domain (approx LUFS)
 *    • pondération K (K-weighting) pré-calculée par bin
 */
export class MasterBus {
  private static _instance: MasterBus | null = null;

  /** Analyser principal branché sur la sortie master */
  private _analyser: AnalyserNode | null = null;

  /** Buffer time-domain float réutilisé pour le calcul RMS/peak */
  private _timeDomain: Float32Array | null = null;

  /** Buffer byte-domain réutilisé, pour éviter allocations à chaque lecture */
  private _byteDomain: Uint8Array | null = null;

  /** Dernier résultat RMS/peak stocké (utile si read() est appelé avant init()) */
  private _last: MasterAnalysis = { rms: 0, peak: 0 };

  /** Buffer freq-domain réutilisé pour l’estimation LUFS */
  private _freqDomain: Float32Array | null = null;

  /** Pondération K (gain^2 par bin) pré-calculée une fois au démarrage */
  private _kWeightSq: Float32Array | null = null; // per-bin (linear gain squared)
  
  /**
   * Wrapper de compatibilité pour éviter un souci de typage TS avec getByteTimeDomainData.
   * Certaines libs TS attendent un autre type générique,
   * on passe donc par un cast souple ici.
   */
  private _getByte(an: AnalyserNode, arr: Uint8Array): void {
    (an as unknown as { getByteTimeDomainData(a: Uint8Array): void }).getByteTimeDomainData(arr);
  }

  /** Accès singleton au MasterBus */
  static ensure(): MasterBus {
    if (!this._instance) this._instance = new MasterBus();
    return this._instance;
  }

  /**
   * Initialise le MasterBus :
   * - crée l’AnalyserNode
   * - le connecte au masterGain (post-fader)
   * - alloue les buffers nécessaires (time, byte, freq, poids K)
   *
   * Appel idempotent : si déjà initialisé, ne fait rien.
   */
  init(): void {
    if (this._analyser) return;

    const engine = AudioEngine.ensure();
    if (!engine.context || !engine.masterGain) return;

    const analyser = engine.context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;

    // On se branche après le master gain, pour analyser le mix global
    engine.masterGain.connect(analyser);
    this._analyser = analyser;

    // Allocation des buffers (une seule fois) à partir d’ArrayBuffer
    // Time-domain floats
    const ab = new ArrayBuffer(analyser.fftSize * 4);
    this._timeDomain = new Float32Array(ab);

    // Byte-domain (0..255) pour getByteTimeDomainData
    const bb = new ArrayBuffer(analyser.fftSize);
    this._byteDomain = new Uint8Array(bb);

    // Freq-domain floats pour LUFS (getFloatFrequencyData)
    const fb = new ArrayBuffer(analyser.frequencyBinCount * 4);
    this._freqDomain = new Float32Array(fb);

    // Pré-calcul de la pondération K (approx.) par bin
    // On applique un filtre très simplifié :
    //   - < 100 Hz : -12 dB
    //   - 100..2k  : 0 dB
    //   - 2k..8k   : +4 dB
    //   - > 8k     : +2 dB
    const k = new Float32Array(analyser.frequencyBinCount);
    const rate = engine.context.sampleRate;
    for (let i = 0; i < k.length; i++) {
      const freq = (i * rate) / analyser.fftSize; // approx centre de bin
      let wDb = 0;
      if (freq < 100) wDb = -12;
      else if (freq < 2000) wDb = 0;
      else if (freq < 8000) wDb = 4;
      else wDb = 2;
      const wLin = Math.pow(10, wDb / 20);
      k[i] = wLin * wLin; // on stocke directement le gain au carré (domaine de puissance)
    }
    this._kWeightSq = k;
  }

  /**
   * Lit un snapshot RMS + peak (linéaire 0..1) du signal master.
   *
   * - Utilise getByteTimeDomainData pour limiter la taille des buffers
   * - Convertit en floats [-1..1]
   * - Calcule RMS et peak sur la fenêtre actuelle
   *
   * Aucun new/alloc ici : on réutilise les buffers.
   */
  read(): MasterAnalysis {
    if (!this._analyser || !this._timeDomain || !this._byteDomain) return this._last;

    // Récupération des samples 0..255 dans le buffer byte réutilisé
    this._getByte(this._analyser, this._byteDomain as unknown as Uint8Array);

    const floats = this._timeDomain;
    const bytes = this._byteDomain;

    // Conversion en [-1..1]
    for (let i = 0; i < bytes.length; i++) {
      floats[i] = (bytes[i] - 128) / 128;
    }

    // Calcul RMS + peak
    let sumSq = 0;
    let peak = 0;
    const buf = floats;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sumSq += v * v;
      if (v > peak) peak = v;
    }

    const rms = Math.sqrt(sumSq / buf.length);
    this._last = { rms, peak };
    return this._last;
  }

  /**
   * Approximation du LUFS K-weighted "short-term".
   *
   * - Utilise getFloatFrequencyData (valeurs en dBFS par bin)
   * - Convertit chaque bin en puissance linéaire
   * - Applique la pondération K pré-calculée (w²)
   * - Moyenne la puissance pondérée, puis convertit en dB (10 log10)
   * - Ajoute une porte brute à -70 LUFS :
   *     • si niveau trop faible → retourne -Infinity (gated)
   *
   * NB :
   * - À appeler à une fréquence limitée (≤ 10 Hz) pour éviter du coût inutile.
   * - C’est une approximation : pas une implémentation EBU R128 exacte.
   */
  readKWeightedLufs(): number {
    if (!this._analyser || !this._freqDomain || !this._kWeightSq) return -Infinity;

    // getFloatFrequencyData : remplit _freqDomain avec les niveaux par bin en dBFS
    (this._analyser as unknown as { getFloatFrequencyData(a: Float32Array): void })
      .getFloatFrequencyData(this._freqDomain);

    let sumPower = 0;
    const bins = this._freqDomain;
    const w = this._kWeightSq;
    const n = bins.length;

    for (let i = 0; i < n; i++) {
      const db = bins[i];
      // Si le bin est très faible (<= -120 dBFS), on l’ignore.
      if (db <= -120) continue;

      // dB amplitude → amplitude lin → puissance (amp²)
      const amp = Math.pow(10, db / 20);
      const p = amp * amp;
      sumPower += p * w[i];
    }

    const avgPower = sumPower / Math.max(1, n);
    if (avgPower <= 0) return -Infinity;

    const lufs = 10 * Math.log10(avgPower);

    // Porte grossière à -70 LUFS pour ne pas afficher de valeurs insignifiantes
    return lufs < -70 ? -Infinity : lufs;
  }
}

/**
 * Helper ergonomique pour récupérer le singleton MasterBus.
 * (Aligné avec les helpers type `useAudioEngine`, `useMixerCore`, etc.)
 */
export function useMasterBus(): MasterBus {
  return MasterBus.ensure();
}
