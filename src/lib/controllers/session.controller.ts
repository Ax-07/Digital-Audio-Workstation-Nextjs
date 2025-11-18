// src/lib/controllers/session.controller.ts

import { TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import { getSessionPlayer } from "@/lib/audio/core/session-player-refactored";
import { useProjectStore } from "@/lib/stores/project.store";
import { useUiStore } from "@/lib/stores/ui.store";
import type { ClipDecl, ProjectDecl } from "@/lib/audio/types";

// 🔸 Type commun utilisé partout
type LaunchQuantize =
  | "none"
  | "bar"
  | "beat"
  | "1/2"
  | "1/4"
  | "1/8"
  | "1/16"
  | "1n";

/**
 * Calcule, pour une scène donnée, quelles pistes doivent être arrêtées
 * (pistes actives qui n'ont pas de clip dans cette scène).
 */
async function computeTracksToStop(
  proj: ProjectDecl,
  sceneIndex: number
): Promise<string[]> {
  const scene = proj.session?.scenes?.[sceneIndex];
  if (!scene) return [];

  // 2) Fallback : toutes les pistes du projet qui n'ont pas de clip dans cette scène
  const allTrackIds = (proj.tracks ?? []).map((t) => t.id);
  return allTrackIds.filter((id) => !scene.clips[id]);
}

/**
 * Stoppe une piste avec quantize (slot STOP à la Ableton).
 * - Utilise la quantize globale de lancement
 * - Planifie le stop via SessionPlayer.scheduleStopTrack
 */
export function stopTrackQuantized(trackId: string): void {
  const sch = TransportScheduler.ensure();
  const sp = getSessionPlayer();
  const globalQ = useUiStore.getState().launchQuantize;

  const when = sch.getNextLaunchTime(globalQ);
  sp.scheduleStopTrack(trackId, when);
}


/**
 * Lance tous les clips non nuls d’une scène.
 * - Calcule les clips à lancer
 * - Programme l'arrêt des pistes qui n'ont rien dans cette scène
 * - Utilise la quantize globale UI
 */
export async function launchScene(sceneIndex: number): Promise<void> {
  const proj = useProjectStore.getState().project;
  const scene = proj.session?.scenes?.[sceneIndex];
  if (!scene) return;

  const items = Object.entries(scene.clips)
    .filter(([, clip]) => !!clip)
    .map(([trackId, clip]) => ({
      trackId,
      clipId: (clip as ClipDecl).id,
      clipType: (clip as ClipDecl).type as "audio" | "midi",
    }));

  const sch = TransportScheduler.ensure();
  const sp = getSessionPlayer();

  const globalQ = useUiStore.getState().launchQuantize;
  const q = (globalQ ?? "bar") as LaunchQuantize;

  const toStop = await computeTracksToStop(proj, sceneIndex);

  // Scène vide : uniquement des stops, à un when quantifié
  if (!items.length) {
    if (!toStop.length) return;
    const when = sch.getNextLaunchTime(q);
    toStop.forEach((trackId) => sp.scheduleStopTrack(trackId, when));
    return;
  }

  // Scène non vide : stops des pistes vides + start des clips AU MÊME WHEN
  const when = sch.getNextLaunchTime(q);

  if (toStop.length) {
    toStop.forEach((trackId) => sp.scheduleStopTrack(trackId, when));
  }

  // Lancement des clips exactement à 'when' (plus de petite dérive entre stop et start)
  sch.launchClipsAt(items, when);
}



/**
 * Lance un clip unique (trackId, sceneIndex).
 * - Utilise la quantification du clip si définie
 * - Sinon la quantize globale UI
 * - Fallback 'bar' en cas de problème
 */
export function launchClip(trackId: string, sceneIndex: number): void {
  const proj = useProjectStore.getState().project;
  const clip = proj.session?.scenes?.[sceneIndex]?.clips?.[trackId] as ClipDecl | undefined;
  if (!clip) return;

  const items = [{ trackId, clipId: clip.id, clipType: clip.type as "audio" | "midi" }];
  const sch = TransportScheduler.ensure();

  try {
    const globalQ = useUiStore.getState().launchQuantize;
    const q = (clip.launchQuantization ?? globalQ) as LaunchQuantize;
    sch.launchClips(items, q);
  } catch {
    sch.launchClips(items, "bar");
  }
}

