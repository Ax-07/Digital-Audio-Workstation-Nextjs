// src/lib/audio/core/mixer.ts

import { AudioEngine, dbToGain } from "@/lib/audio/core/audio-engine";
import { TrackNodeChain } from "@/lib/audio/core/track";
import type { FxDecl } from "@/lib/audio/types";

/**
 * Paramètres de base d’une piste côté moteur de mixage.
 * (Utilisé surtout pour initialisation / debug)
 */
export type MixerTrackParams = {
  id: string;
  name: string;
  gainDb: number; // -60 .. +6
  pan: number;    // -1 .. 1
};

/**
 * MixerCore
 * ---------
 * Cœur du mixeur audio (côté moteur, pas UI).
 *
 * Rôle :
 * - Gérer un graphe TrackNodeChain par piste (gain, pan, mutes, FX, sends…)
 * - Gérer deux retours A/B (aux/FX returns) avec leur propre TrackNodeChain
 * - Relier les sends des pistes vers les retours A/B
 * - Appliquer les mutes/solos et recalculer la logique globale de solo
 * - Fournir des mètres par piste et par retour
 *
 * Pattern :
 * - Singleton (MixerCore.ensure())
 * - Aucune dépendance à React ; uniquement à AudioEngine et aux TrackNodeChain.
 */
export class MixerCore {
  private static _instance: MixerCore | null = null;

  /** Pistes audio → chaîne de nodes associée */
  private tracks = new Map<string, TrackNodeChain>();

  /** État logique de mute désiré par piste (avant recompute solo) */
  private desiredMute = new Map<string, boolean>();

  /** État logique de solo désiré par piste */
  private desiredSolo = new Map<string, boolean>();

  /** Retours A/B → TrackNodeChain (bus de retour) */
  private returns = new Map<"A" | "B", TrackNodeChain>();

  /** Accès singleton */
  static ensure(): MixerCore {
    if (!this._instance) this._instance = new MixerCore();
    return this._instance;
  }

  /**
   * S’assure qu’une piste `id` possède une TrackNodeChain.
   * - Si elle existe déjà → no-op
   * - Si l’AudioEngine n’est pas encore initialisé → on ne crée rien (creation différée)
   * - Applique les flags mute/solo déjà demandés
   * - Connecte les sends vers les retours A/B si ceux-ci existent déjà
   */
  ensureTrack(id: string): void {
    if (this.tracks.has(id)) return;
    const engine = AudioEngine.ensure();
    if (!engine.context || !engine.masterGain) {
      // Engine pas encore initialisé ; on reportera la création plus tard (lors du play/init)
      return;
    }
    const chain = new TrackNodeChain(engine.context, id, engine.masterGain);

    // Appliquer les flags mute/solo déjà enregistrés
    const m = this.desiredMute.get(id) ?? false;
    const s = this.desiredSolo.get(id) ?? false;
    chain.setMuted(m);
    chain.setSolo(s);

    this.tracks.set(id, chain);
    this.recomputeSoloMute();

    // Connecter les sends vers les retours si ceux-ci sont déjà en place
    const rA = this.returns.get("A");
    const rB = this.returns.get("B");
    chain.ensureSendsConnected(rA ? rA.input : null, rB ? rB.input : null);
  }

  /**
   * Réalise les créations différées lorsque le moteur audio devient dispo.
   * (Actuellement no-op, car ensureTrack gère déjà la création à la volée.)
   *
   * Méthode laissée pour extension future si on veut précréer les pistes.
   */
  realizePending(): void {
    const engine = AudioEngine.ensure();
    if (!engine.context || !engine.masterGain) return;
    // No-op pour l’instant : les pistes sont créées à la demande dans ensureTrack()
  }

  /** Indique si une piste est déjà connue du mixeur. */
  has(id: string): boolean {
    return this.tracks.has(id);
  }

  /** Liste les identifiants de toutes les pistes actuellement gérées. */
  listTrackIds(): string[] {
    return Array.from(this.tracks.keys());
  }

  /**
   * Définit le gain d’une piste en dB.
   * Converti en gain linéaire via dbToGain avant d’être envoyé à TrackNodeChain.
   */
  setGainDb(id: string, db: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.setGainLinear(dbToGain(db));
  }

  /**
   * Définit le pan d’une piste (-1..1).
   */
  setPan(id: string, pan: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.setPan(pan);
  }

  /**
   * Définit le facteur d’automation (linéaire) appliqué à la piste.
   * Ce facteur multiplie le gain utilisateur (post-dB).
   */
  setTrackAutomationLinear(id: string, lin: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.setAutomationLinear(lin);
  }

  /**
   * Retourne le node d’entrée AudioNode d’une piste,
   * afin de pouvoir y connecter une source (sample, synth, etc.).
   */
  getTrackInput(id: string): AudioNode | null {
    const t = this.tracks.get(id);
    return t ? t.input : null;
  }

  /**
   * Accès direct (lecture seule) à la TrackNodeChain d’une piste pour instrumentation / meters.
   * À utiliser pour récupérer analyser ou stereo analysers sans créer de nodes supplémentaires.
   */
  getTrackChain(id: string): TrackNodeChain | null {
    return this.tracks.get(id) ?? null;
  }

  /**
   * S’assure que les retours A/B existent.
   * - Crée deux TrackNodeChain (returnA, returnB) si nécessaires
   * - Reconnecte tous les sends de pistes vers les inputs des retours
   */
  private ensureReturns(): void {
    const engine = AudioEngine.ensure();
    if (!engine.context || !engine.masterGain) return;
    const ctx = engine.context;

    if (!this.returns.get("A")) {
      const rA = new TrackNodeChain(ctx, "returnA", engine.masterGain);
      this.returns.set("A", rA);
    }
    if (!this.returns.get("B")) {
      const rB = new TrackNodeChain(ctx, "returnB", engine.masterGain);
      this.returns.set("B", rB);
    }

    // Une fois les retours présents, connecter tous les sends de pistes
    const rA = this.returns.get("A")!;
    const rB = this.returns.get("B")!;
    for (const [, t] of this.tracks) t.ensureSendsConnected(rA.input, rB.input);
  }

  /**
   * Expose l'input d'un bus de retour (A/B) pour des connexions externes (sends custom).
   * Assure la création des retours si nécessaire.
   */
  getReturnInput(target: "A" | "B"): AudioNode | null {
    this.ensureReturns();
    const r = this.returns.get(target);
    return r ? r.input : null;
  }

  /**
   * Définit la quantité d’envoi vers le retour A ou B pour une piste.
   * - S’assure d’abord que les retours existent
   * - S’assure que la piste existe
   */
  setSendAmount(id: string, target: "A" | "B", amount: number) {
    this.ensureReturns();
    this.ensureTrack(id);
    const t = this.tracks.get(id);
    if (t) t.setSendAmount(target, amount);
  }

  /**
   * Définit le gain d’un retour A/B en dB (converti ensuite en linéaire).
   */
  setReturnGainDb(target: "A" | "B", db: number) {
    this.ensureReturns();
    const r = this.returns.get(target);
    if (!r) return;
    r.setGainLinear(dbToGain(db));
  }

  /**
   * Définit le pan d’un retour A/B.
   */
  setReturnPan(target: "A" | "B", pan: number) {
    this.ensureReturns();
    const r = this.returns.get(target);
    if (!r) return;
    r.setPan(pan);
  }

  /**
   * Applique les FX simples (reverb/delay) sur un retour A/B.
   * Les paramètres sont transmis directement à la TrackNodeChain de ce retour.
   */
  setReturnFx(
    target: "A" | "B",
    opts: {
      reverb?: boolean;
      delay?: boolean;
      delayTime?: number;
      reverbDecay?: number;
      reverbDuration?: number;
    },
  ) {
    this.ensureReturns();
    const r = this.returns.get(target);
    if (!r) return;
    r.setReturnFx(opts);
  }

  /**
   * Applique une liste d’inserts FX pour une piste (gain/eq/delay/reverb).
   * Le détail de la chaîne est géré par TrackNodeChain.setTrackFx.
   */
  setTrackFx(id: string, fx: readonly FxDecl[] | undefined | null) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.setTrackFx(fx ?? []);
  }

  /**
   * Méthode de debug interne : expose quelques infos sur l’état du mixeur.
   */
  __debug() {
    return {
      tracks: Array.from(this.tracks.keys()),
      hasReturnA: this.returns.has("A"),
      hasReturnB: this.returns.has("B"),
    } as const;
  }

  /**
   * Met à jour l’état de mute logique d’une piste.
   * - Mémorise dans desiredMute
   * - Propage à la TrackNodeChain si déjà créée
   * - Recalcule la logique globale solo/mute
   */
  setMute(id: string, muted: boolean) {
    this.desiredMute.set(id, muted);
    const t = this.tracks.get(id);
    if (t) t.setMuted(muted);
    this.recomputeSoloMute();
  }

  /**
   * Met à jour l’état de solo logique d’une piste.
   * - Mémorise dans desiredSolo
   * - Propage à la TrackNodeChain si déjà créée
   * - Recalcule la logique globale solo/mute
   */
  setSolo(id: string, solo: boolean) {
    this.desiredSolo.set(id, solo);
    const t = this.tracks.get(id);
    if (t) t.setSolo(solo);
    this.recomputeSoloMute();
  }

  /**
   * Recalcule l’effet global du solo/mute :
   * - Si au moins une piste est en solo → les autres sont considérées comme mutées
   * - Sinon → seuls les flags mute individuels s’appliquent
   * Le calcul détaillé par piste est délégué à TrackNodeChain.recomputeSoloMute.
   */
  private recomputeSoloMute() {
    let anySolo = false;
    for (const [id] of this.tracks) {
      if (this.desiredSolo.get(id)) {
        anySolo = true;
        break;
      }
    }
    for (const [, t] of this.tracks) {
      t.recomputeSoloMute(anySolo);
    }
  }

  /**
   * Lit les valeurs de meter (RMS + peak) pour une piste.
   * - Si la piste n’existe pas → 0,0
   */
  readTrackMeter(id: string): { rms: number; peak: number } {
    const t = this.tracks.get(id);
    if (!t) return { rms: 0, peak: 0 };
    return t.readMeter();
  }

  /**
   * Lit les valeurs de meter (RMS + peak) pour un retour A/B.
   * - Si le retour n’existe pas encore → 0,0
   */
  readReturnMeter(target: "A" | "B"): { rms: number; peak: number } {
    const r = this.returns.get(target);
    if (!r) return { rms: 0, peak: 0 };
    return r.readMeter();
  }

  /**
   * Supprime complètement une piste du mixeur :
   * - disconnexions + dispose de la TrackNodeChain
   * - suppression des maps internes
   * - recalcul solo/mute global (topologie modifiée)
   */
  removeTrack(id: string): void {
    const t = this.tracks.get(id);
    if (!t) return;
    try {
      t.dispose();
    } catch {}
    this.tracks.delete(id);
    this.recomputeSoloMute();
  }
}

/**
 * Helper ergonomique (symétrique de useXxx côté UI) :
 * retourne simplement l’instance singleton du MixerCore.
 */
export function useMixerCore(): MixerCore {
  return MixerCore.ensure();
}
