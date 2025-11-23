/* Sampler (squelette v1)
   ----------------------
   - Support futur pour des multi-zones et layers de vélocité.
   - Précharge les AudioBuffer une seule fois (preload).
   - Aucun allocation lourde au moment du trigger (lecture) :
     on réutilise les buffers déjà décodés.
*/

import { AudioEngine } from "@/lib/audio/core/audio-engine";

/**
 * SampleZone
 * ----------
 * Décrit une "zone" de sample :
 * - id          : identifiant interne du sample
 * - url         : URL du fichier audio à charger
 * - rootPitch   : note MIDI correspondant au pitch naturel du sample
 * - minVelocity : vélocité minimale (0..1) pour laquelle cette zone est utilisée
 * - maxVelocity : vélocité maximale (0..1) pour laquelle cette zone est utilisée
 *
 * L’idée est de pouvoir définir plusieurs zones différentes pour
 * un même sampler (layering de vélocité, multi-échantillons, etc.).
 */
export type SampleZone = {
  id: string;
  url: string;
  rootPitch: number;    // Note MIDI pour le pitch original du sample
  minVelocity: number;  // 0..1
  maxVelocity: number;  // 0..1
};

/**
 * Options de construction du Sampler :
 * - zones : liste des zones disponibles (définies statiquement pour l’instant).
 */
export type SamplerOptions = {
  zones: readonly SampleZone[];
};

/**
 * Sampler
 * -------
 * Mini moteur de sampling :
 *
 * Rôle :
 * - Gérer un ensemble de zones de samples (multi-layer par vélocité)
 * - Précharger (pré-décoder) les AudioBuffer en mémoire via preload()
 * - Déclencher la lecture d’un sample adapté à :
 *     • la vélocité (choix de zone)
 *     • le pitch (pitch shifting via playbackRate)
 *
 * Conception :
 * - `buffers` : map id → AudioBuffer (décodé une seule fois)
 * - `zones`   : configuration des zones (immutable côté instance)
 *
 * Fonctionnement :
 * - preload() :
 *     • fetch + decodeAudioData pour chaque zone, si non déjà en cache
 * - trigger(pitch, velocity, dest?) :
 *     • choisit la zone en fonction de la vélocité
 *     • applique un pitch-shift simple en semitons
 *     • scale du gain avec la vélocité (0..1)
 */
export class Sampler {
  /** Cache des buffers déjà décodés : zone.id → AudioBuffer */
  private buffers = new Map<string, AudioBuffer>();

  /** Liste des zones configurées pour ce sampler. */
  private zones: readonly SampleZone[];

  /**
   * @param opts.zones  Liste des zones de samples à gérer
   */
  constructor(opts: SamplerOptions) {
    // On clone le tableau pour éviter des mutations externes
    this.zones = opts.zones.slice();
  }

  /**
   * preload()
   * ---------
   * Précharge toutes les zones :
   * - pour chaque zone, si le buffer n’est pas déjà présent
   *   dans `buffers`, on :
   *     • fetch l’URL
   *     • lit l’ArrayBuffer
   *     • décode l’audio via decodeAudioData
   *     • stocke l’AudioBuffer dans la Map
   *
   * L’appel est idempotent : les zones déjà chargées sont ignorées.
   */
  async preload(): Promise<void> {
    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    const tasks = this.zones.map(async (z) => {
      if (this.buffers.has(z.id)) return;
      const res = await fetch(z.url);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      this.buffers.set(z.id, buf);
    });

    await Promise.allSettled(tasks);
  }

  /**
   * pickZone(velocity)
   * ------------------
   * Sélectionne la zone la plus adaptée pour une vélocité donnée.
   *
   * Stratégie v1 :
   * - renvoie la première zone dont l’intervalle [minVelocity, maxVelocity]
   *   contient la vélocité
   * - sinon, fallback sur la première zone de la liste (si elle existe)
   *
   * TODO / futur :
   * - prendre en compte la proximité de pitch (rootPitch vs note demandée)
   * - interpolation entre zones ou random round-robin, etc.
   */
  private pickZone(velocity: number): SampleZone | null {
    // Logique simple : premier match, sinon fallback sur la première zone
    for (const z of this.zones) {
      if (velocity >= z.minVelocity && velocity <= z.maxVelocity) return z;
    }
    return this.zones[0] ?? null;
  }

  /**
   * trigger(pitch, velocity, destination?)
   * --------------------------------------
   * Déclenche un sample :
   * - choisit la zone en fonction de la vélocité
   * - récupère l’AudioBuffer correspondant dans le cache
   * - crée un BufferSource + un GainNode
   * - applique un pitch shifting simple :
   *     ratio = 2^((pitch - rootPitch) / 12)
   * - applique la vélocité sur le gain (0..1)
   * - route vers la destination fournie ou vers ctx.destination
   *
   * @param pitch       Note MIDI 0..127 pour la note cible
   * @param velocity    Vélocité 0..1
   * @param destination Noeud de destination (mixeur). Si absent → sortie master.
   */
  trigger(pitch: number, velocity: number, destination?: AudioNode): void {
    const ctx = AudioEngine.ensure().context;
    if (!ctx) return;

    const zone = this.pickZone(velocity);
    if (!zone) return;

    const buf = this.buffers.get(zone.id);
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Pitch-shift simple : ratio = 2^((pitch - root)/12)
    const ratio = Math.pow(2, (pitch - zone.rootPitch) / 12);
    src.playbackRate.value = ratio;

    // Gain contrôlé par vélocité, clampé 0..1
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, velocity));

    const dest = destination ?? ctx.destination;
    src.connect(gain).connect(dest);
    src.start();
  }
}
