// Minimal FX Registry (v1):
// -------------------------
// Registre global des effets (FX) permettant :
//
// - d’exposer une liste d’effets disponibles (avec paramètres déclaratifs)
//   pour la génération dynamique d’interfaces UI (potentiomètres, sliders…)
// - d’appliquer les FX de retour A/B au MixerCore (reverb simple, delay simple)
// - d’appliquer les FX d’insert par piste, via des FxDecl fournis dans le JSON projet
//
// Il ne contient **aucune logique DSP** :
// il délègue entièrement la création et la gestion des nodes audio
// à TrackNodeChain et MixerCore.
//
// Objectif :
// Centraliser la connaissance de « quels effets existent »
// et « quels paramètres ils possèdent », afin que :
// - l’UI puisse construire des éditeurs propres,
// - le JSON Projet puisse définir une liste FxDecl cohérente,
// - le MixerCore puisse appliquer proprement et de manière typée.
//
// Cette première version (v1) est volontairement minimale.

import { MixerCore } from "@/lib/audio/core/mixer";
import type { FxDecl } from "@/lib/audio/types";

// Définition d’un paramètre d’effet :
// Utilisé par l’UI pour créer des contrôles.
// Chaque paramètre décrit :
// - son nom technique
// - son label utilisateur
// - ses bornes min/max
// - sa valeur par défaut
// - éventuellement step et unité
export type FxParamSchema = {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  unit?: string;
};

// Définition d’un effet : type + liste de paramètres
export type FxDefinition = {
  type: string;                     // nom interne (“gain”, “delay”, etc.)
  params: readonly FxParamSchema[]; // description des contrôles
};

export class FxRegistry {
  private static _instance: FxRegistry | null = null;

  /** Map interne type → définition Fx */
  private _defs: Map<string, FxDefinition> = new Map();

  /** Singleton global */
  static ensure(): FxRegistry {
    if (!this._instance) this._instance = new FxRegistry();
    return this._instance;
  }

  constructor() {
    // Enregistre des effets simples pour v1.
    // Ces définitions servent pour :
    // - UI dynamique
    // - validation minimale
    // - clarté du schéma
    //
    // Le DSP réel dépend de TrackNodeChain.createFxNode().
    this.register({
      type: "gain",
      params: [
        { name: "gainDb", label: "Gain (dB)", min: -60, max: 6, default: 0, step: 0.1, unit: "dB" },
      ],
    });

    this.register({
      type: "delay",
      params: [
        { name: "time",     label: "Time (ms)", min: 10, max: 2000, default: 400, step: 1, unit: "ms" },
        { name: "feedback", label: "Feedback",  min: 0,  max: 0.95, default: 0.3, step: 0.01 },
        { name: "mix",      label: "Mix",       min: 0,  max: 1,    default: 0.5, step: 0.01 },
      ],
    });

    this.register({
      type: "reverb",
      params: [
        { name: "decay", label: "Decay (s)", min: 0.1, max: 12, default: 3, step: 0.1, unit: "s" },
        { name: "mix",   label: "Mix",       min: 0,   max: 1,  default: 0.4, step: 0.01 },
      ],
    });

    // EQ (peaking) — aligne les noms avec TrackNodeChain (freq, q, gainDb)
    this.register({
      type: "eq",
      params: [
        { name: "freq",   label: "Freq (Hz)",  min: 20,    max: 20000, default: 1000, step: 1, unit: "Hz" },
        { name: "q",      label: "Q",          min: 0.1,   max: 18,    default: 1,    step: 0.01 },
        { name: "gainDb", label: "Gain (dB)",  min: -24,   max: 24,    default: 0,    step: 0.1, unit: "dB" },
      ],
    });
  }

  /**
   * Enregistre une définition d’effet si elle n’existe pas déjà.
   * Le type est la clé principale.
   */
  register(def: FxDefinition): void {
    if (!def || !def.type) return;
    if (!this._defs.has(def.type)) {
      this._defs.set(def.type, def);
    }
  }

  /** Retourne la liste complète des effets connus */
  list(): readonly FxDefinition[] {
    return Array.from(this._defs.values());
  }

  /** Retourne une définition d’effet par type */
  get(type: string): FxDefinition | undefined {
    return this._defs.get(type);
  }

  /**
   * Applique les FX de retour A/B à MixerCore.
   * Version minimale : paramètres simples (delay, reverb…).
   *
   * Note :
   * - La logique DSP réelle est effectuée dans TrackNodeChain.setReturnFx().
   */
  applyReturnFx(
    target: "A" | "B",
    opts: {
      reverb?: boolean;
      delay?: boolean;
      delayTime?: number;
      reverbDecay?: number;
      reverbDuration?: number;
    }
  ) {
    const mixer = MixerCore.ensure();
    mixer.setReturnFx(target, opts);
  }

  /**
   * Applique les FX d’insert pour une piste audio.
   *
   * Process :
   * - garantit la création de la piste dans MixerCore
   * - filtre les effets non-supportés selon _defs
   * - délègue à TrackNodeChain.setTrackFx()
   *
   * FxDecl provient du JSON projet.
   */
  applyTrackFx(trackId: string, fx: readonly FxDecl[]) {
    const mixer = MixerCore.ensure();
    mixer.ensureTrack(trackId);
    const supported = new Set(this.list().map((d) => d.type));

    // Mapping de compatibilité : UI peut utiliser des noms conviviaux (time, decay, mix…)
    // TrackNodeChain attend : delayTime (sec 0..1), reverbDuration, reverbDecay, freq, q, gainDb…
    const mapped: FxDecl[] = [];
    for (const spec of fx) {
      const type = String(spec.type).toLowerCase();
      if (!supported.has(type)) continue;
      const pIn = spec.params || {};
      const pOut: Record<string, number | string | boolean> = {};

      // Copie directe des paramètres déjà conformes
      for (const k of Object.keys(pIn)) {
        const v = pIn[k];
        if (v === undefined || v === null) continue;
        // Ignorés plus bas si remappés
        pOut[k] = v;
      }

      if (type === "delay") {
        // time (ms) → delayTime (s)
        if (typeof pIn.time === "number" && typeof pIn.delayTime !== "number") {
          const ms = pIn.time;
          const sec = Math.max(0, Math.min(1, ms / 1000));
          pOut.delayTime = sec;
          delete pOut.time;
        }
        // Purge paramètres non supportés DSP actuel (feedback, mix) pour éviter confusion
        delete pOut.feedback;
        delete pOut.mix;
      } else if (type === "reverb") {
        // decay → reverbDecay ; duration|length → reverbDuration
        if (typeof pIn.decay === "number" && typeof pIn.reverbDecay !== "number") {
          pOut.reverbDecay = Math.max(0.05, Math.min(1, pIn.decay));
          delete pOut.decay;
        }
        if (typeof (pIn).duration === "number" && typeof pIn.reverbDuration !== "number") {
          const d = (pIn).duration;
          pOut.reverbDuration = Math.max(0.1, Math.min(5, d));
          delete (pOut).duration;
        }
        if (typeof (pIn).length === "number" && typeof pIn.reverbDuration !== "number") {
          const d = (pIn).length;
          pOut.reverbDuration = Math.max(0.1, Math.min(5, d));
          delete (pOut).length;
        }
        // mix non supporté pour l’instant → retirer pour ne pas induire l’UI en erreur
        delete (pOut).mix;
      } else if (type === "gain") {
        // gainDb / gain déjà acceptés tels quels
      } else if (type === "eq") {
        // freq, q, gainDb conservés ; supprimer clés hors DSP si ajoutées
        for (const k of Object.keys(pOut)) {
          if (!['freq','q','gainDb','bypass'].includes(k)) delete pOut[k];
        }
      }

      mapped.push({ type, params: pOut });
    }

    mixer.setTrackFx(trackId, mapped);
  }
}

/** Hook pratique pour récupérer l’instance unique (design similaire aux autres singletons audio). */
export function useFxRegistry(): FxRegistry {
  return FxRegistry.ensure();
}
