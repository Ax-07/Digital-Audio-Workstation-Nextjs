import { ProjectDecl, TrackDecl } from "../types";
import { FxRegistry } from "./fx-registry";
import { MixerCore } from "./mixer/mixer";

/**
 * Reconciliation minimale entre le JSON du projet et le moteur audio.
 *
 * Rôle :
 * - S’assurer que chaque piste décrite dans `project.tracks` existe dans MixerCore
 * - Appliquer les paramètres de base (gain / pan / sends / inserts FX)
 * - Supprimer les pistes audio qui ne sont plus présentes dans le JSON
 * - Configurer les retours A/B (gain, pan, FX simples reverb/delay)
 *
 * Cette fonction est appelée à chaque fois que le projet change
 * (chargement, ajout/suppression de piste, etc.).
 */
export function reconcileProject(project: ProjectDecl): void {
  const mixer = MixerCore.ensure();

  // 1) Pistes principales : s’assurer qu’elles existent et appliquer leurs paramètres
  for (const t of project.tracks) {
    reconcileTrack(t, mixer);
  }

  // 2) Nettoyage : supprimer les pistes qui n’existent plus dans le JSON
  const desiredIds = new Set(project.tracks.map((t) => t.id));
  for (const id of mixer.listTrackIds()) {
    if (!desiredIds.has(id)) mixer.removeTrack(id);
  }

  // 3) Configuration des retours A/B (returns)
  if (project.returns) {
    for (const r of project.returns) {
      // Déterminer la cible : 'A' ou 'B'
      // Priorité :
      //   - id explicitement 'A' ou 'B'
      //   - sinon, si le nom contient 'b' → B
      //   - par défaut → A
      let target: "A" | "B" =
        r.id === "B" || (r.name ?? "").toUpperCase() === "B" ? "B" : "A";

      if (r.id === "A" || r.id === "B") {
        target = r.id as "A" | "B";
      } else if ((r.name ?? r.id).toLowerCase().includes("b")) {
        target = "B";
      }

      // Appliquer gain/pan du retour si présents
      if (typeof r.gainDb === "number") mixer.setReturnGainDb(target, r.gainDb);
      if (typeof r.pan === "number") mixer.setReturnPan(target, r.pan);

      // Appliquer les FX simples de retour si présents dans le JSON (reverb/delay)
      if (r.fx && !Array.isArray(r.fx)) {
        const {
          reverb = false,
          delay = false,
          delayTime,
          reverbDecay,
          reverbDuration,
        } = r.fx as {
          reverb?: boolean;
          delay?: boolean;
          delayTime?: number;
          reverbDecay?: number;
          reverbDuration?: number;
        };

        FxRegistry.ensure().applyReturnFx(target, {
          reverb,
          delay,
          delayTime,
          reverbDecay,
          reverbDuration,
        });
      }
    }
  }
}

/**
 * Reconcile d’une piste individuelle avec le MixerCore.
 *
 * - Crée la piste s’il le faut (ensureTrack)
 * - Applique gain/pan
 * - Applique les sends A/B (si définis)
 * - Applique la chaîne d’inserts via FxRegistry
 * - Si pas de fx, force un bypass (chaîne vide)
 */
function reconcileTrack(t: TrackDecl, mixer: MixerCore): void {
  // S’assurer que la piste existe dans le moteur audio
  mixer.ensureTrack(t.id);

  // Appliquer paramètres de base
  if (typeof t.gainDb === "number") mixer.setGainDb(t.id, t.gainDb);
  if (typeof t.pan === "number") mixer.setPan(t.id, t.pan);

  // Appliquer les sends (A/B) si présents
  if (t.sends) {
    for (const s of t.sends) {
      mixer.setSendAmount(t.id, s.target, s.amount);
    }
  }

  // Chaîne d’inserts de piste via FxRegistry
  if (t.fx && Array.isArray(t.fx)) {
    // Liste d’effets explicite → on la passe telle quelle
    FxRegistry.ensure().applyTrackFx(t.id, t.fx);
  } else if (!t.fx) {
    // Aucune fx définie → on vide la chaîne pour assurer un bypass
    FxRegistry.ensure().applyTrackFx(t.id, []);
  }
}
