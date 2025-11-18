/* InputDevice
   -----------
   - Encapsule l’API Web MIDI (si disponible) pour envoyer des noteOn/noteOff live dans MidiTrack.
   - Aucun allocation dans le chemin onMIDIMessage (structures préexistantes, simple lecture).
   - Normalisation de vélocité en 0..1.
   - La piste cible est la piste actuellement sélectionnée dans l’UI (selectedTrackId).
*/

import { ensureMidiTrack } from "@/lib/audio/sources/midi-track";
import { useUiStore } from "@/lib/stores/ui.store";

/**
 * Configuration du jeu MIDI live :
 * - channel      : canal MIDI cible (1..16). Si undefined → omni (tous canaux acceptés).
 * - velocityCurve: fonction de transformation de la vélocité (0..1 → 0..1),
 *                  permet par ex. de “courber” la dynamique du clavier.
 * - quantizeLive : placeholder pour un futur alignement quantifié des notes live.
 */
export type MidiLiveConfig = {
  channel?: number; // 1..16 (undefined => omni)
  velocityCurve?: (v: number) => number; // transforme 0..1
  quantizeLive?: boolean; // placeholder (alignement futur sur grille)
};

export class InputDevice {
  /** Accès Web MIDI (s’il est disponible dans le navigateur) */
  private access: any | null = null;

  /** Liste des entrées MIDI actuellement visibles */
  private inputs: any[] = [];

  /** Flag : est-ce qu’on écoute les messages MIDI en ce moment ? */
  private listening = false;

  /** Configuration courante de l’entrée live */
  private config: MidiLiveConfig = {};


  /**
   * init()
   * ------
   * Initialise l’accès MIDI :
   * - Vérifie la présence de navigator + requestMIDIAccess
   * - Demande un MIDIAccess (sans sysex)
   * - Rafraîchit la liste des entrées
   *
   * Appel idempotent : si déjà initialisé, ne fait rien.
   */
  async init(): Promise<void> {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) return;
    if (this.access) return;
    try {
      // @ts-ignore - Web MIDI peut ne pas être typé dans lib.dom.d.ts selon l’environnement
      this.access = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.refreshInputs();
    } catch {
      // En cas d’erreur (permissions, navigateur), on reste silencieux.
    }
  }

  /**
   * configure(cfg)
   * --------------
   * Met à jour la configuration du live input (canal, courbe de vélocité…).
   * Les champs fournis écrasent ceux existants, les autres sont conservés.
   */
  configure(cfg: MidiLiveConfig): void {
    this.config = { ...this.config, ...cfg };
  }

  /**
   * refreshInputs()
   * ---------------
   * Relit la liste des entrées MIDI disponibles via MIDIAccess.
   * À appeler typiquement après init(), ou en réponse à onstatechange (future extension).
   */
  private refreshInputs(): void {
    if (!this.access) return;
    this.inputs = Array.from(this.access.inputs.values());
  }

  /**
   * start()
   * -------
   * Démarre l’écoute des messages MIDI sur toutes les entrées connues.
   * - Assigne handleMessage comme callback onmidimessage.
   */
  start(): void {
    if (this.listening) return;
    this.listening = true;
    for (const input of this.inputs) {
      input.onmidimessage = (e: any) => this.handleMessage(e);
    }
  }

  /**
   * stop()
   * ------
   * Arrête l’écoute :
   * - Supprime les callbacks onmidimessage.
   */
  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    for (const input of this.inputs) {
      input.onmidimessage = null;
    }
  }

  /**
   * handleMessage(ev)
   * -----------------
   * Callback bas niveau pour les messages MIDI bruts.
   *
   * Décodage :
   * - status (data[0]) → cmd + channel
   * - d1 = pitch / note
   * - d2 = vélocité / data2
   *
   * On gère uniquement :
   * - Note On  (0x90, vélocité > 0)
   * - Note Off (0x80, ou 0x90 avec vélocité = 0)
   *
   * Filtrage de canal si config.channel est défini.
   */
  private handleMessage(ev: any): void {
    const data = ev.data;
    if (!data || data.length < 3) return;

    const status = data[0];
    const d1 = data[1];
    const d2 = data[2];

    const cmd = status & 0xf0;       // upper nibble → type de message
    const ch = (status & 0x0f) + 1;  // canal 1..16
    const wantCh = this.config.channel;

    // Filtre de canal : si un canal spécifique est demandé, on ignore les autres
    if (wantCh && ch !== wantCh) return;

    if (cmd === 0x90) {
      // Note On (sauf si vélocité = 0, cas spécial => Note Off)
      const pitch = d1;
      const velRaw = d2;

      if (velRaw === 0) {
        this.noteOff(pitch);
        return;
      }

      // Normalisation 0..127 → 0..1
      const vNorm = Math.max(0, Math.min(1, velRaw / 127));

      // Application éventuelle d’une courbe de vélocité custom
      const velocity = this.config.velocityCurve
        ? this.config.velocityCurve(vNorm)
        : vNorm;

      this.noteOn(pitch, velocity);
    } else if (cmd === 0x80) {
      // Note Off classique
      const pitch = d1;
      this.noteOff(pitch);
    }
  }

  /**
   * noteOn(pitch, velocity)
   * -----------------------
   * Route une Note On vers la piste MIDI courante :
   * - récupère selectedTrackId dans le UiStore
   * - instancie/assure le MidiTrack correspondant
   * - envoie noteOn(pitch, velocity) à ce MidiTrack
   */
  private noteOn(pitch: number, velocity: number): void {
    // Piste cible : celle sélectionnée dans la UI (session/mixer)
    const trackId = useUiStore.getState().selectedTrackId;
    if (!trackId) return;

    const mt = ensureMidiTrack(trackId);
    mt.noteOn(pitch, velocity);
  }

  /**
   * noteOff(pitch)
   * --------------
   * Route une Note Off vers la piste MIDI courante :
   * - même logique que noteOn, mais appelle mt.noteOff
   */
  private noteOff(pitch: number): void {
    const trackId = useUiStore.getState().selectedTrackId;
    if (!trackId) return;

    const mt = ensureMidiTrack(trackId);
    mt.noteOff(pitch);
  }
}

/**
 * Instance globale (singleton « simple ») d’InputDevice pour le jeu live.
 */
export const liveInput = new InputDevice();

/**
 * ensureLiveInputStarted(cfg?)
 * -----------------------------
 * Helper pour :
 * - initialiser le MIDI (init)
 * - appliquer une config optionnelle
 * - démarrer l’écoute
 *
 * À appeler typiquement lorsqu’on active le clavier MIDI dans l’UI.
 */
export async function ensureLiveInputStarted(cfg?: MidiLiveConfig): Promise<void> {
  await liveInput.init();
  if (cfg) liveInput.configure(cfg);
  liveInput.start();
}

/**
 * stopLiveInput()
 * ----------------
 * Arrête l’écoute du MIDI live (ne ferme pas le MIDIAccess).
 */
export function stopLiveInput(): void {
  liveInput.stop();
}
