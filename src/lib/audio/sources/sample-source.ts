/* SampleSource
   ------------
   - Contient un AudioBuffer décodé, et joue en boucle via un BufferSourceNode
     créé à chaque déclenchement.
   - Aucune allocation pendant la lecture, à part la création du node par start().
   - Pour le MVP : boucle simple, avec point de départ à 0 (ou via options).
*/

import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { MixerCore } from "@/lib/audio/core/mixer";

/**
 * SampleSource
 * ------------
 * Représente une source audio basée sur un sample décodé (AudioBuffer).
 *
 * Rôle :
 * - Charger un sample depuis un ArrayBuffer (décodage via AudioContext)
 * - Déclencher la lecture (loop ou one-shot) sur une piste donnée (trackId)
 * - Permettre :
 *     • start()    : lecture immédiate (boucle ou non selon _loop)
 *     • startAt()  : lecture planifiée dans le temps (whenSec)
 *     • stop()     : arrêt immédiat
 *     • stopAt()   : arrêt planifié
 *     • setLoop()  : activer/désactiver la boucle
 *
 * Intégration :
 * - Le sample est routé vers l’entrée de piste correspondante dans MixerCore.
 * - AudioEngine fournit le AudioContext global pour le décodage et la création des nodes.
 */
export class SampleSource {
  /** Buffer audio décodé (null tant que non chargé) */
  private _buffer: AudioBuffer | null = null;

  /** Dernier BufferSourceNode actif pour cette source (lecture en cours). */
  private _currentNode: AudioBufferSourceNode | null = null;

  /** Identifiant de cette source (par ex. id de clip). */
  readonly id: string;

  /** Identifiant de la piste cible dans le Mixer. */
  readonly trackId: string;

  /** Flag de loop par défaut (lecture en boucle oui/non). */
  private _loop: boolean = false;

  /**
   * @param id      Identifiant de la source (souvent = clipId)
   * @param trackId Identifiant de la piste où l’on route l’audio
   */
  constructor(id: string, trackId: string) {
    this.id = id;
    this.trackId = trackId;
  }

  /**
   * loadFromArrayBuffer(data)
   * -------------------------
   * Décodage asynchrone du sample depuis un ArrayBuffer.
   *
   * - Utilise AudioContext.decodeAudioData
   * - Utilise data.slice(0) pour éviter le “neutering” du buffer d’origine.
   */
  async loadFromArrayBuffer(data: ArrayBuffer): Promise<void> {
    const engine = AudioEngine.ensure();
    if (!engine.context) return;
    const context = engine.context;
    this._buffer = await context.decodeAudioData(data.slice(0)); // copie pour éviter neutering
  }

  /**
   * start()
   * -------
   * Démarre la lecture immédiate du sample :
   * - ignore l’appel si un node est déjà en train de jouer (_currentNode non null)
   * - crée un nouveau BufferSourceNode
   * - applique node.loop selon _loop
   * - connecte vers l’entrée de piste dans MixerCore
   *
   * Lecture sans planification (start() = now).
   */
  start(): void {
    if (this._currentNode) return; // déjà en lecture, on ignore

    const engine = AudioEngine.ensure();
    if (!engine.context || !this._buffer) return;

    const input = MixerCore.ensure().getTrackInput(this.trackId);
    if (!input) return;

    const node = engine.context.createBufferSource();
    node.buffer = this._buffer;
    node.loop = this._loop;
    node.connect(input);
    node.start();

    node.onended = () => {
      try {
        node.disconnect();
      } catch {}
      if (this._currentNode === node) this._currentNode = null;
    };

    this._currentNode = node;
  }

  /**
   * startAt(whenSec, opts?)
   * -----------------------
   * Démarre la lecture à un temps précis (whenSec, en secondes AudioContext).
   *
   * Options :
   * - loop         : override du flag de loop (sinon utilise _loop)
   * - loopStartSec : point de début de boucle (sec)
   * - loopEndSec   : point de fin de boucle (sec)
   * - stopAfterSec : arrêt forcé après une durée donnée (sec) lorsque loop=false
   *
   * Remarques :
   * - Si un node est déjà en lecture (_currentNode non null), l’appel est ignoré
   *   (MVP : pas de superposition multiple de la même SampleSource).
   */
  startAt(
    whenSec: number,
    opts?: {
      loop?: boolean;
      loopStartSec?: number;
      loopEndSec?: number;
      stopAfterSec?: number;
    },
  ): void {
    if (this._currentNode) return; // MVP : pas de chevauchement de lecture

    const engine = AudioEngine.ensure();
    if (!engine.context || !this._buffer) return;

    const input = MixerCore.ensure().getTrackInput(this.trackId);
    if (!input) return;

    const node = engine.context.createBufferSource();
    node.buffer = this._buffer;

    // Détermination du mode loop (option > défaut)
    const shouldLoop = typeof opts?.loop === "boolean" ? opts.loop : this._loop;
    node.loop = shouldLoop;

    // Configuration éventuelle de la fenêtre de boucle
    if (typeof opts?.loopStartSec === "number") {
      node.loopStart = Math.max(0, opts.loopStartSec);
    }
    if (typeof opts?.loopEndSec === "number") {
      node.loopEnd = Math.max(node.loopStart, opts.loopEndSec);
    }

    node.connect(input);
    node.start(whenSec);

    // Pour un one-shot (loop=false), on peut planifier un stop forcé
    if (!shouldLoop && typeof opts?.stopAfterSec === "number" && opts.stopAfterSec > 0) {
      try {
        node.stop(whenSec + opts.stopAfterSec);
      } catch {}
    }

    node.onended = () => {
      try {
        node.disconnect();
      } catch {}
      if (this._currentNode === node) this._currentNode = null;
    };

    this._currentNode = node;
  }

  /**
   * stop()
   * ------
   * Arrêt immédiat de la lecture courante (si présente).
   */
  stop(): void {
    if (!this._currentNode) return;
    try {
      this._currentNode.stop();
    } catch {}
    this._currentNode.disconnect();
    this._currentNode = null;
  }

  /**
   * stopAt(whenSec)
   * ---------------
   * Planifie l’arrêt du node courant à un temps donné (en secondes AudioContext).
   * - Si aucun node en cours, ne fait rien.
   * - Utilisé pour des transitions propres (fade géré ailleurs si besoin).
   */
  stopAt(whenSec: number): void {
    const node = this._currentNode;
    if (!node) return;
    try {
      // S'assure que le cleanup aura lieu à la fin, même si loop était true
      node.onended = () => {
        try { node.disconnect(); } catch {}
        if (this._currentNode === node) this._currentNode = null;
      };
      node.stop(whenSec);
    } catch {}
  }

  /**
   * setLoop(loop)
   * -------------
   * Met à jour le flag de boucle par défaut.
   * - Applique également la valeur au node courant si existant.
   */
  setLoop(loop: boolean): void {
    this._loop = loop;
    if (this._currentNode) this._currentNode.loop = loop;
  }
}
