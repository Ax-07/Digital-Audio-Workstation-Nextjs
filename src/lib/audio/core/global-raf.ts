/* Global RAF subscription system.
   -------------------------------
   Système global de subscription à requestAnimationFrame.

   Objectif :
   - Centraliser un unique loop requestAnimationFrame pour tout le projet
     (mètres, timelines, visualisations, UI réactive, etc.).
   - Évite d’avoir plusieurs rAF concurrents créés par divers composants.
   - Chaque abonné reçoit le timestamp du frame courant.
   - Aucun alloc dans la boucle ; simple Set de callbacks.

   Principe :
   - On garde un Set<RafCallback>.
   - Tant qu’il y a au moins un abonné -> le loop tourne.
   - Si tous se désabonnent -> on stoppe.
*/

type RafCallback = (t: number) => void;

class GlobalRaf {
  /** Tous les callbacks abonnés au tick rAF */
  private subscribers: Set<RafCallback> = new Set();

  /** Indique si la boucle rAF tourne actuellement */
  private running = false;

  /** Dernière timestamp rAF reçue (pour debug ou interpolation éventuelle) */
  private lastTime = 0;

  /**
   * Abonne une callback.
   * Retourne une fonction de désabonnement.
   *
   * FR :
   * - On ajoute le callback au Set.
   * - Si ce composant est le premier abonné -> on démarre la boucle.
   * - Lors du unsubscribe :
   *     • on retire le callback
   *     • si plus aucun abonné -> on stoppe le rAF
   */
  subscribe(cb: RafCallback): () => void {
    this.subscribers.add(cb);

    if (!this.running) this.start();

    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) this.stop();
    };
  }

  /**
   * Lance la boucle requestAnimationFrame.
   *
   * Le pattern :
   *   - running = true
   *   - loop(t):
   *       • stocke le timestamp
   *       • appelle tous les callbacks
   *       • si running == true => schedule le frame suivant
   */
  private start() {
    this.running = true;

    const loop = (t: number) => {
      if (!this.running) return;
      this.lastTime = t;

      // Appelle chaque callback abonnée au frame
      for (const cb of this.subscribers) cb(t);

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  /** Arrête la boucle : un simple drapeau, le loop ne se reschedule plus */
  private stop() {
    this.running = false;
  }
}

/** Singleton global du système de RAF */
let _globalRaf: GlobalRaf | null = null;

/**
 * Helper public pour obtenir l’instance unique.
 * FR :
 * - Crée l’instance au premier appel.
 * - La réutilise ensuite.
 */
export function getGlobalRaf(): GlobalRaf {
  if (!_globalRaf) _globalRaf = new GlobalRaf();
  return _globalRaf;
}
