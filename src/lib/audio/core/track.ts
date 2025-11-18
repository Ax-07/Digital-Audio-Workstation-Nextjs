import type { FxDecl } from "@/lib/audio/types";

/**
 * TrackNodeChain
 * ---------------
 * Chaîne de traitement audio pour une piste :
 * - Gestion du gain, pan, mute/solo
 * - Mesure du signal (meter RMS / peak)
 * - Envois A/B vers les bus de retour
 * - Chaîne d’effets pour retours (reverb/delay simples)
 * - Chaîne d’effets d’insert par piste (gain/eq/delay/reverb)
 *
 * L’idée est d’avoir, pour chaque piste, un petit graphe de nodes
 * encapsulé ici, afin de garder le moteur audio structuré et
 * éviter les allocations dynamiques dans le rendu.
 */
export class TrackNodeChain {
  readonly id: string;

  private ctx: AudioContext;
  private destination: AudioNode;

  // Core chaîne piste : InputGain -> Analyser -> Pan -> Destination
  private gainNode: GainNode;
  private analyser: AnalyserNode;
  private panNode: StereoPannerNode;

  // Buffers réutilisés pour le meter (éviter les allocs constantes)
  private meterBuffer: Float32Array;
  private meterBytes: Uint8Array;

  // Envois vers retours A/B (post-fader)
  private sendA: GainNode;
  private sendB: GainNode;
  private sendsConnected = false;

  // Chaîne FX pour retours (convolver/delay)
  private fxIn: GainNode | null = null;
  private fxOut: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private delay: DelayNode | null = null;
  private lastDelayTime: number | null = null;
  private lastReverbDecay: number | null = null;
  private lastReverbDuration: number | null = null;
  private isReturnChain = false;

  // Chaîne d’insert FX par piste :
  // gain -> trackFxIn -> [nodes FX]* -> trackFxOut -> analyser -> pan
  private trackFxIn: GainNode | null = null;
  private trackFxOut: GainNode | null = null;
  private trackFxNodes: AudioNode[] = [];
  private trackFxType = new WeakMap<AudioNode, string>(); // mémorise le "type" logique de chaque node

  // Gestion du niveau global :
  // userGainLinear : niveau défini par l’utilisateur (fader)
  // automationLinear : facteur d’automation (multiplie le gain utilisateur)
  private userGainLinear = 1;
  private automationLinear = 1;

  // États de mute/solo pour cette piste
  private muted = false;
  private solo = false;

  /**
   * Compatibilité pour TypeScript : certaines définitions d’AnalyserNode
   * ne typent pas getByteTimeDomainData correctement via Uint8Array.
   * On enveloppe l’appel ici pour éviter les problèmes de typings.
   */
  private _getByte(an: AnalyserNode, arr: Uint8Array): void {
    (an as unknown as { getByteTimeDomainData(a: Uint8Array): void }).getByteTimeDomainData(arr);
  }

  /**
   * @param ctx        AudioContext global
   * @param id         Identifiant de la piste
   * @param destination Node de sortie (master ou bus)
   */
  constructor(ctx: AudioContext, id: string, destination: AudioNode) {
    this.ctx = ctx;
    this.id = id;
    this.destination = destination;

    // Chaîne de base : InputGain -> Analyser -> Pan -> Destination
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 1;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512; // taille adaptée à une piste
    this.analyser.smoothingTimeConstant = 0.6;

    this.panNode = ctx.createStereoPanner();
    this.panNode.pan.value = 0;

    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.panNode);
    this.panNode.connect(this.destination);

    // Sends post-fader : on prend le signal à la sortie du gainNode
    this.sendA = ctx.createGain();
    this.sendA.gain.value = 0;
    this.sendB = ctx.createGain();
    this.sendB.gain.value = 0;

    this.gainNode.connect(this.sendA);
    this.gainNode.connect(this.sendB);

    // Buffers réutilisés pour le calcul du meter
    const ab = new ArrayBuffer(this.analyser.fftSize * 4);
    this.meterBuffer = new Float32Array(ab);
    const bb = new ArrayBuffer(this.analyser.fftSize);
    this.meterBytes = new Uint8Array(bb);
  }

  /**
   * Définit le gain linéaire de base (avant automation / solo-mute).
   */
  setGainLinear(g: number) {
    this.userGainLinear = g;
    this.applyEffectiveGain();
  }

  /**
   * Définit le panoramique de la piste (-1..1).
   */
  setPan(pan: number) {
    const p = Math.max(-1, Math.min(1, pan));
    this.panNode.pan.value = p;
  }

  /**
   * Met à jour l’état de mute.
   */
  setMuted(m: boolean) {
    if (this.muted === m) return;
    this.muted = m;
    this.applyEffectiveGain();
  }

  /**
   * Active/désactive le solo sur cette piste.
   * (Le calcul réel de l’effet du solo se fait dans le mixer, via recomputeSoloMute.)
   */
  setSolo(s: boolean) {
    if (this.solo === s) return;
    this.solo = s;
    // La recomposition du mute effectif est gérée à l’extérieur
  }

  /**
   * Recalcule l’état de mute effectif en fonction :
   * - du flag solo de cette piste
   * - de l’existence d’au moins une autre piste en solo
   *
   * @param anySolo true si au moins une piste est en solo dans le mixer
   */
  recomputeSoloMute(anySolo: boolean) {
    // Si une piste est en solo, les pistes non-solo sont effectively muted
    const effectiveMuted = this.muted || (anySolo && !this.solo);
    const target = effectiveMuted ? 0 : this.userGainLinear;
    this.gainNode.gain.value = target;
  }

  /**
   * Applique le gain effectif en tenant compte de :
   * - userGainLinear (fader)
   * - muted
   * - automationLinear
   */
  private applyEffectiveGain() {
    const base = this.muted ? 0 : this.userGainLinear;
    this.gainNode.gain.value = base * this.automationLinear;
  }

  /**
   * Définit le facteur d’automation en gain (multiplicatif).
   * Clampe entre [0, 4] pour éviter des valeurs extrêmes.
   */
  setAutomationLinear(g: number) {
    const clamped = Math.max(0, Math.min(4, g));
    if (this.automationLinear === clamped) return;
    this.automationLinear = clamped;
    this.applyEffectiveGain();
  }

  /**
   * Connecte les sends aux destinations A/B si ce n’est pas déjà fait.
   * On ne le fait qu’une fois pour éviter les doublons de connexions.
   */
  ensureSendsConnected(destA: AudioNode | null, destB: AudioNode | null) {
    if (this.sendsConnected) return;
    if (destA) this.sendA.connect(destA);
    if (destB) this.sendB.connect(destB);
    this.sendsConnected = true;
  }

  /**
   * Définit le niveau de send vers A ou B (0..1).
   */
  setSendAmount(target: "A" | "B", amount: number) {
    const a = Math.max(0, Math.min(1, amount));
    if (target === "A") this.sendA.gain.value = a;
    else this.sendB.gain.value = a;
  }

  // ---------------------------------------------------------------------------
  // Chaîne d’effets pour retours (Return FX)
  // ---------------------------------------------------------------------------
  // Structure globale :
  // gain -> fxIn -> [FX]* -> fxOut -> analyser -> pan
  // Le meter se fait donc post-FX dans le cas des retours.

  /**
   * Initialise la chaîne de retours si besoin.
   * Après appel :
   * gainNode → fxIn → ...FX... → fxOut → analyser → pan
   */
  ensureReturnFxChain() {
    if (this.isReturnChain) return;
    this.isReturnChain = true;

    // Création des nodes de début/fin de chaîne FX
    this.fxIn = this.ctx.createGain();
    this.fxOut = this.ctx.createGain();

    // Re-câblage : on place l’analyser après la chaîne FX
    try { this.gainNode.disconnect(this.analyser); } catch {}
    try { this.analyser.disconnect(); } catch {}

    this.gainNode.connect(this.fxIn);
    this.fxOut.connect(this.analyser);
    this.analyser.connect(this.panNode);

    // Bypass par défaut : fxIn → fxOut
    this.fxIn.connect(this.fxOut);
  }

  /**
   * Configure les FX de retour (reverb + delay simple).
   * - reverb : ConvolverNode avec impulse générée procéduralement
   * - delay : DelayNode simple sans feedback
   *
   * @param opts Paramètres basiques de reverb/delay
   */
  setReturnFx(opts: {
    reverb?: boolean;
    delay?: boolean;
    delayTime?: number;
    reverbDecay?: number;
    reverbDuration?: number;
  }) {
    this.ensureReturnFxChain();
    if (!this.fxIn || !this.fxOut) return;

    // On coupe la connexion actuelle fxIn → ...
    try { this.fxIn.disconnect(); } catch {}

    // On reconstruit une petite chaîne en partant de fxIn
    let tail: AudioNode = this.fxIn;

    // --- Reverb ---
    if (opts.reverb) {
      if (!this.convolver) {
        this.convolver = this.ctx.createConvolver();
        this.convolver.normalize = false;

        const dur = opts.reverbDuration ?? this.lastReverbDuration ?? 1.2;
        const decay = opts.reverbDecay ?? this.lastReverbDecay ?? 0.5;

        this.convolver.buffer = TrackNodeChain.createImpulse(
          this.ctx,
          clamp(dur, 0.1, 5),
          clamp(decay, 0.05, 1),
        );
        this.lastReverbDuration = dur;
        this.lastReverbDecay = decay;
      }

      // Si les paramètres changent, on régénère l’impulse
      if (this.convolver && (opts.reverbDuration !== undefined || opts.reverbDecay !== undefined)) {
        const dur = opts.reverbDuration ?? this.lastReverbDuration ?? 1.2;
        const decay = opts.reverbDecay ?? this.lastReverbDecay ?? 0.5;
        if (dur !== this.lastReverbDuration || decay !== this.lastReverbDecay) {
          this.convolver.buffer = TrackNodeChain.createImpulse(
            this.ctx,
            clamp(dur, 0.1, 5),
            clamp(decay, 0.05, 1),
          );
          this.lastReverbDuration = dur;
          this.lastReverbDecay = decay;
        }
      }

      tail.connect(this.convolver);
      tail = this.convolver;
    }

    // --- Delay simple (sans feedback, type slapback) ---
    if (opts.delay) {
      if (!this.delay) {
        this.delay = this.ctx.createDelay(1.0);
        this.delay.delayTime.value = 0.25;
        this.lastDelayTime = 0.25;
      }

      if (opts.delayTime !== undefined) {
        const dt = clamp(opts.delayTime, 0, 1.0);
        if (this.lastDelayTime !== dt) {
          this.delay.delayTime.value = dt;
          this.lastDelayTime = dt;
        }
      }

      tail.connect(this.delay);
      tail = this.delay;
    }

    // Fin de chaîne : connecté vers fxOut
    tail.connect(this.fxOut);
  }

  /**
   * Génère ou récupère en cache un AudioBuffer d’impulsion pour la reverb.
   * - durationSec : durée totale de la reverb
   * - decay : facteur de décroissance de l’enveloppe
   */
  private static createImpulse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
    // Cache statique basique pour éviter la régénération d’impulses identiques
    const key = `${Math.round(durationSec * 1000)}|${Math.round(decay * 1000)}`;
    if (!("___impulseCache" in TrackNodeChain)) {
      (TrackNodeChain as unknown as { ___impulseCache: Map<string, AudioBuffer> }).___impulseCache = new Map();
    }
    const cache = (TrackNodeChain as unknown as { ___impulseCache: Map<string, AudioBuffer> }).___impulseCache;
    const cached = cache.get(key);
    if (cached) return cached;

    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * durationSec));
    const buf = ctx.createBuffer(2, length, rate);

    // Simple bruit blanc exponentiellement décroissant
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }

    cache.set(key, buf);
    return buf;
  }

  // ---------------------------------------------------------------------------
  // Chaîne d’insert FX par piste (type Ableton/DAW)
  // ---------------------------------------------------------------------------

  /**
   * Initialise la chaîne FX piste si nécessaire :
   * gain -> trackFxIn -> trackFxOut -> analyser -> pan
   */
  private ensureTrackFxChain() {
    if (this.trackFxIn && this.trackFxOut) return;

    this.trackFxIn = this.ctx.createGain();
    this.trackFxOut = this.ctx.createGain();

    // Re-câblage : l’analyser se fait désormais après les inserts
    try { this.gainNode.disconnect(this.analyser); } catch {}
    try { this.analyser.disconnect(); } catch {}

    this.gainNode.connect(this.trackFxIn);
    this.trackFxOut.connect(this.analyser);
    this.analyser.connect(this.panNode);

    // Bypass par défaut : trackFxIn → trackFxOut
    this.trackFxIn.connect(this.trackFxOut);
  }

  /**
   * Configure la liste des FX d’insert pour la piste.
   * Prend un tableau de FxDecl (type + params).
   * - Si la liste est vide : on met la chaîne en bypass
   * - Sinon : on reconcilie ou reconstruit les nodes selon les types
   */
  setTrackFx(fx: readonly FxDecl[] | undefined | null) {
    if (!fx || fx.length === 0) {
      // Aucun FX : on s’assure d’être en bypass
      if (this.trackFxIn && this.trackFxOut) {
        try { this.trackFxIn.disconnect(); } catch {}
        this.trackFxIn.connect(this.trackFxOut);

        // On déconnecte aussi tous les anciens nodes
        for (const n of this.trackFxNodes) { try { n.disconnect(); } catch {} }
        this.trackFxNodes = [];
      }
      return;
    }

    this.ensureTrackFxChain();
    if (!this.trackFxIn || !this.trackFxOut) return;

    // On prépare la reconstruction de la chaîne : on déconnecte trackFxIn
    try { this.trackFxIn.disconnect(); } catch {}

    // Si un quelconque FX est marqué "bypass", on reconstruit tout depuis zéro
    const hasBypass = fx.some((f) => !!(f.params && (f.params as Record<string, unknown>).bypass === true));
    if (hasBypass) {
      // Reset complet de la chaîne
      for (const n of this.trackFxNodes) { try { n.disconnect(); } catch {} }
      this.trackFxNodes = [];

      let tail: AudioNode = this.trackFxIn;
      const nextNodes: AudioNode[] = [];

      for (const spec of fx) {
        const wantType = String(spec.type).toLowerCase();
        const bypass = !!(spec.params && (spec.params as Record<string, unknown>).bypass === true);
        if (bypass) continue;

        const node = this.createFxNode(wantType, spec.params);
        if (!node) continue;

        tail.connect(node);
        tail = node;
        this.trackFxType.set(node, wantType);
        nextNodes.push(node);
      }

      tail.connect(this.trackFxOut);
      this.trackFxNodes = nextNodes;
      return;
    }

    // Pas de bypass dans la liste : on essaie de réutiliser les nodes existants par position/type
    const nextNodes: AudioNode[] = [];
    let tail: AudioNode = this.trackFxIn;

    for (let i = 0; i < fx.length; i++) {
      const spec = fx[i];
      const wantType = String(spec.type).toLowerCase();
      const existing = this.trackFxNodes[i];
      let node: AudioNode | null = null;

      if (existing && this.trackFxType.get(existing) === wantType) {
        // Node réutilisable : on met simplement à jour les paramètres
        node = existing;
        this.updateFxNode(node, wantType, spec.params);
      } else {
        // On supprime tout ce qui vient après i dans l’ancienne chaîne
        for (let j = i; j < this.trackFxNodes.length; j++) {
          try { this.trackFxNodes[j].disconnect(); } catch {}
        }
        // Puis on crée un nouveau node
        node = this.createFxNode(wantType, spec.params);
      }

      if (node) {
        tail.connect(node);
        tail = node;
        this.trackFxType.set(node, wantType);
        nextNodes.push(node);
      }
    }

    // Dernier node connecté à trackFxOut
    tail.connect(this.trackFxOut);
    this.trackFxNodes = nextNodes;
  }

  /**
   * Crée un AudioNode correspondant au type d’effet demandé.
   * Types supportés :
   * - "gain"
   * - "eq" (biquad peaking)
   * - "delay"
   * - "reverb" (convolver procédural)
   */
  private createFxNode(
    type: string,
    params?: Readonly<Record<string, number | string | boolean>>,
  ): AudioNode | null {
    switch (type) {
      case "gain": {
        const n = this.ctx.createGain();
        const lin =
          params && typeof params.gain === "number"
            ? clamp(params.gain, 0, 4)
            : params && typeof params.gainDb === "number"
            ? Math.max(0, Math.min(4, Math.pow(10, (params.gainDb as number) / 20)))
            : 1;
        n.gain.value = lin;
        return n;
      }
      case "eq": {
        const n = this.ctx.createBiquadFilter();
        n.type = "peaking";
        const freq =
          params && typeof params.freq === "number"
            ? clamp(params.freq, 20, 20000)
            : 1000;
        const q =
          params && typeof params.q === "number"
            ? clamp(params.q, 0.1, 18)
            : 1;
        const gainDb =
          params && typeof params.gainDb === "number"
            ? clamp(params.gainDb, -24, 24)
            : 0;
        n.frequency.value = freq;
        n.Q.value = q;
        n.gain.value = gainDb;
        return n;
      }
      case "delay": {
        const n = this.ctx.createDelay(1.0);
        const dt =
          params && typeof params.delayTime === "number"
            ? clamp(params.delayTime, 0, 1.0)
            : 0.25;
        n.delayTime.value = dt;
        return n;
      }
      case "reverb": {
        const n = this.ctx.createConvolver();
        (n as ConvolverNode).normalize = false;
        const dur =
          params && typeof params.reverbDuration === "number"
            ? clamp(params.reverbDuration, 0.1, 5)
            : 1.2;
        const decay =
          params && typeof params.reverbDecay === "number"
            ? clamp(params.reverbDecay, 0.05, 1)
            : 0.5;
        (n as ConvolverNode).buffer = TrackNodeChain.createImpulse(this.ctx, dur, decay);
        return n;
      }
      default:
        return null;
    }
  }

  /**
   * Met à jour les paramètres d’un node FX existant (gain/eq/delay/reverb).
   * Utilisé lors du “reconcile” pour éviter de recréer les nodes.
   */
  private updateFxNode(
    node: AudioNode,
    type: string,
    params?: Readonly<Record<string, number | string | boolean>>,
  ): void {
    switch (type) {
      case "gain": {
        const g = node as GainNode;
        const lin =
          params && typeof params.gain === "number"
            ? clamp(params.gain, 0, 4)
            : params && typeof params.gainDb === "number"
            ? Math.max(0, Math.min(4, Math.pow(10, (params.gainDb as number) / 20)))
            : g.gain.value;
        g.gain.value = lin;
        break;
      }
      case "eq": {
        const f = node as BiquadFilterNode;
        if (params && typeof params.freq === "number") {
          f.frequency.value = clamp(params.freq, 20, 20000);
        }
        if (params && typeof params.q === "number") {
          f.Q.value = clamp(params.q, 0.1, 18);
        }
        if (params && typeof params.gainDb === "number") {
          f.gain.value = clamp(params.gainDb, -24, 24);
        }
        break;
      }
      case "delay": {
        const d = node as DelayNode;
        if (params && typeof params.delayTime === "number") {
          d.delayTime.value = clamp(params.delayTime, 0, 1.0);
        }
        break;
      }
      case "reverb": {
        const c = node as ConvolverNode;
        const dur =
          params && typeof params.reverbDuration === "number"
            ? clamp(params.reverbDuration, 0.1, 5)
            : null;
        const decay =
          params && typeof params.reverbDecay === "number"
            ? clamp(params.reverbDecay, 0.05, 1)
            : null;
        if (dur !== null || decay !== null) {
          const prevDur = dur ?? 1.2;
          const prevDecay = decay ?? 0.5;
          c.buffer = TrackNodeChain.createImpulse(this.ctx, prevDur, prevDecay);
        }
        break;
      }
    }
  }

  /**
   * Lit les données du meter :
   * - RMS : énergie moyenne du signal (0..1)
   * - peak : crête absolue observée (0..1)
   *
   * L’appel à cette fonction est supposé être limité (ex. ~30Hz)
   * par le scheduler de l’UI pour éviter les surcoûts.
   */
  readMeter(): { rms: number; peak: number } {
    // On récupère un buffer d'échantillons normalisés 0..255
    this._getByte(this.analyser, this.meterBytes);

    // On convertit en floats [-1..1]
    const floats = this.meterBuffer;
    const bytes = this.meterBytes;

    for (let i = 0; i < bytes.length; i++) {
      floats[i] = (bytes[i] - 128) / 128;
    }

    // Calcul RMS + peak
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < floats.length; i++) {
      const v = floats[i];
      sum += v * v;
      const av = Math.abs(v);
      if (av > peak) peak = av;
    }
    const rms = Math.sqrt(sum / floats.length);
    return { rms, peak };
  }

  /**
   * Node d’entrée de la chaîne :
   * les sources externes (piste audio, synth, etc.) se connectent ici.
   */
  get input(): AudioNode {
    return this.gainNode;
  }

  /**
   * Libération et nettoyage de la chaîne de nodes.
   * On déconnecte tout ce qu’on peut et on marque les envois comme non connectés.
   */
  dispose(): void {
    // Déconnecte au mieux, sans planter si déjà disconnect
    try { this.gainNode.disconnect(); } catch {}
    try { this.analyser.disconnect(); } catch {}
    try { this.panNode.disconnect(); } catch {}
    try { this.sendA.disconnect(); } catch {}
    try { this.sendB.disconnect(); } catch {}

    if (this.fxIn) { try { this.fxIn.disconnect(); } catch {} }
    if (this.fxOut) { try { this.fxOut.disconnect(); } catch {} }
    if (this.convolver) { try { this.convolver.disconnect(); } catch {} }
    if (this.delay) { try { this.delay.disconnect(); } catch {} }

    if (this.trackFxIn) { try { this.trackFxIn.disconnect(); } catch {} }
    if (this.trackFxOut) { try { this.trackFxOut.disconnect(); } catch {} }

    for (const n of this.trackFxNodes) { try { n.disconnect(); } catch {} }

    this.sendsConnected = false;
  }
}

/** Petit utilitaire de clamp générique. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
