import { AudioEngine } from "@/core/audio-engine/core/audio-engine";
import { InteractionState } from "../types";
import { ensureMidiTrack } from "@/core/audio-engine/sources/midi-track";

/**
 * S'assure que l'engine audio est initialisé + en état "running".
 * Fire-and-forget pour ne pas compliquer les handlers.
 */
function ensureAudioReady(audio: AudioEngine): void {
    void (async () => {
        try {
            await audio.init();
            await audio.resume();
        } catch (err) {
            console.warn("[Audio] Failed to init/resume audio context", err);
        }
    })();
}

/**
 * Lance la pré-écoute d'une note au clavier virtuel
 * utiliser dans pointerDownHandler.ts (l. 90-104) lors du clic sur une touche
 * @param pitch  La hauteur de la note à jouer (en MIDI pitch)
 * @param trackId  L'ID de la piste MIDI (si applicable)
 * @param audio  L'AudioEngine à utiliser
 * @param interaction  L'état d'interaction actuel
 */
export function startKeyboardPreview(
    pitch: number,
    trackId: string | undefined,
    audio: AudioEngine,
    interaction: React.RefObject<InteractionState>,
) {
    interaction.current.pressedKey = pitch;

    if (!trackId) return;
    ensureAudioReady(audio);

    try {
        const midiTrack = ensureMidiTrack(trackId);
        midiTrack.noteOn(pitch, 0.8, true);
    } catch (err) {
        console.warn("Failed to play note on track", err);
    }
}

/**
 * Change la hauteur de la note en pré-écoute au clavier virtuel
 * utiliser dans pointerMoveHandler.ts (l. 162-176) lors du glissement entre touches
 * @param prevPitch La hauteur précédente de la note
 * @param nextPitch La nouvelle hauteur de la note
 * @param trackId L'ID de la piste MIDI (si applicable)
 * @param audio L'AudioEngine à utiliser
 * @returns 
 */
export function changeKeyboardPreviewPitch(
    prevPitch: number,
    nextPitch: number,
    trackId: string | undefined,
    audio: AudioEngine,
) {
    if (prevPitch === nextPitch) return;
    if (!trackId) return;

    ensureAudioReady(audio);

    try {
        const midiTrack = ensureMidiTrack(trackId);
        midiTrack.noteOff(prevPitch);
        midiTrack.noteOn(nextPitch, 0.8, true);
    } catch (err) {
        console.warn("Failed to change note on track", err);
    }
}

/**
 * 
 * @param trackId 
 * @param interaction 
 * @returns 
 */
export function stopKeyboardPreview(
  trackId: string | undefined,
  interaction: React.RefObject<InteractionState>,
) {
  const pitch = interaction.current.pressedKey;
  if (pitch == null) return;

  interaction.current.pressedKey = null;
  if (!trackId) return;

  try {
    const midiTrack = ensureMidiTrack(trackId);
    midiTrack.noteOff(pitch);
  } catch (err) {
    console.warn("Failed to stop preview note", err);
  }
}