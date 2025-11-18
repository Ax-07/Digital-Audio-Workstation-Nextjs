import { PPQ, BEATS_PER_BAR, TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import { useProjectStore } from "@/lib/stores/project.store";
import { MixerCore } from "@/lib/audio/core/mixer";
import { dbToGain } from "@/lib/audio/core/audio-engine";

/*
  AutomationEngine (v1)
  ---------------------

  Rôle :
  - Appliquer les automatisations audio (gain, pan, sends…) en fonction du temps musical.
  - Fonctionne en se branchant sur les ticks du TransportScheduler.
  - Évalue l’automation à ~30 Hz (décimation), pour limiter la charge CPU :
      • pas besoin de recalculer à chaque tick PPQ
      • ~30 Hz est largement suffisant pour des automations musically-smooth

  Caractéristiques :
  - Pas d’allocation par tick : uniquement des lectures de tableaux / structures
  - Lecture directe du ProjectStore — les automations sont définies dans le JSON du projet
  - MixerCore fournit les setters (gain/pan/sends) côté audio
  - MVP : uniquement interpolation linéaire « frame-to-frame »
  - Aucune courbe avancée (exponentielle, S-curve, hold…) pour l’instant

  Les frame d’automation ont la forme :
     { beat: number, value: number }

  Le moteur convertit ensuite :
  - gain dB     → facteur linéaire (multiplicatif)
  - pan         → valeur -1..1
  - sends A/B   → 0..1

  L’exécution est strictement audio-runtime (aucune UI).
*/

class AutomationEngine {
  private static _instance: AutomationEngine | null = null;

  private _started = false;
  private _unsub: (() => void) | null = null;

  /** Singleton global */
  static ensure(): AutomationEngine {
    if (!this._instance) this._instance = new AutomationEngine();
    return this._instance;
  }

  /**
   * Démarre le moteur d’automation :
   * - souscrit au scheduler
   * - exécute un callback à ~30 Hz (non strict, mais proche)
   */
  start(): void {
    if (this._started) return;

    const sch = TransportScheduler.ensure();

    // Compteur pour décimer les ticks PPQ
    let tickCount = 0;

    this._unsub = sch.subscribe((pos) => {
      // Source de vérité BPM : TransportScheduler (évite divergence project vs transport)
      const bpm = sch.getBpm();

      // Taux de ticks du scheduler : PPQ * (bpm / 60) = ticks/seconde
      const ticksPerSec = (PPQ * bpm) / 60;

      // Nous voulons ≈30 Hz, donc une étape = ticksPerSec / 30
      const desiredHz = 30;
      const step = Math.max(1, Math.floor(ticksPerSec / desiredHz));

      tickCount++;
      if (tickCount % step !== 0) return;

      // -------- 1) Calcul beatFloat --------
      // Reconstituer la position musicale flottante en utilisant la constante centralisée
      // beatFloat = (bar - 1)*BEATS_PER_BAR + (beat - 1) + (tick / PPQ)
      const beatFloat =
        (pos.bar - 1) * BEATS_PER_BAR +
        (pos.beat - 1) +
        pos.tick / PPQ;

      // Lecture projet + mixer
      const project = useProjectStore.getState().project;
      const mixer = MixerCore.ensure();

      // -------- 2) Application automation piste par piste --------
      for (const track of project.tracks) {

        // --- Gain (dB) ---
        {
          const frames = track.automation?.gainDb;
          if (frames && frames.length > 0) {
            // On évalue la valeur interpolée → convertie en lin
            const lin = evalFramesLinear(beatFloat, frames, (v) => dbToGain(v));
            mixer.setTrackAutomationLinear(track.id, lin);
          } else {
            // Absence d’automation → facteur = 1
            mixer.setTrackAutomationLinear(track.id, 1);
          }
        }

        // --- Pan (-1..1) ---
        {
          const frames = track.automation?.pan;
          if (frames && frames.length > 0) {
            const pan = evalFramesLinear(beatFloat, frames, (v) => clamp(v, -1, 1));
            mixer.setPan(track.id, pan);
          }
        }

        // --- Send A ---
        {
          const aFrames = track.automation?.sendA;
          if (aFrames && aFrames.length > 0) {
            const val = evalFramesLinear(beatFloat, aFrames, (v) => clamp(v, 0, 1));
            mixer.setSendAmount(track.id, "A", val);
          }
        }

        // --- Send B ---
        {
          const bFrames = track.automation?.sendB;
          if (bFrames && bFrames.length > 0) {
            const val = evalFramesLinear(beatFloat, bFrames, (v) => clamp(v, 0, 1));
            mixer.setSendAmount(track.id, "B", val);
          }
        }
      }
    });

    this._started = true;
  }

  /**
   * Stoppe le moteur d’automation.
   * - Se désabonne du TransportScheduler
   */
  stop(): void {
    if (!this._started) return;
    if (this._unsub) this._unsub();
    this._unsub = null;
    this._started = false;
  }
}

/** Helper externe pour obtenir le singleton */
export function getAutomationEngine(): AutomationEngine {
  return AutomationEngine.ensure();
}

/* ============================================================
   Helpers pour interpolation (aucune allocation)
   ============================================================ */

/**
 * Interpolation linéaire de frames d’automation.
 *
 * - `frames` est un tableau trié par beat croissant.
 * - mapVal permet de convertir la valeur brue (dB, raw…) en valeur finale (lin, clamp…)
 *
 * Logiciel minimal :
 * - si beat < première frame → renvoie première valeur
 * - si beat > dernière frame  → renvoie dernière valeur
 * - sinon interpolation entre deux frames adjacentes
 */
function evalFramesLinear<T extends { beat: number; value: number }>(
  beat: number,
  frames: ReadonlyArray<T>,
  mapVal: (v: number) => number
): number {
  const n = frames.length;

  if (beat <= frames[0].beat) return mapVal(frames[0].value);
  if (beat >= frames[n - 1].beat) return mapVal(frames[n - 1].value);

  for (let i = 0; i < n - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];

    if (beat >= a.beat && beat <= b.beat) {
      const t = (beat - a.beat) / Math.max(1e-6, b.beat - a.beat);
      const v = a.value + (b.value - a.value) * t;
      return mapVal(v);
    }
  }

  // Sécurité (devrait être unreachable)
  return mapVal(frames[n - 1].value);
}

/** Clamp générique */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
