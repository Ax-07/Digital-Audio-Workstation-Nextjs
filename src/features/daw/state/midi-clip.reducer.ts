// src/lib/stores/midi-clip.reducer.ts

import { ClipDecl, MidiNote, ProjectDecl } from "@/core/audio-engine/types";


/* -------------------------------------------------------
 * 1. CRÉATION D’UN CLIP MIDI
 * ------------------------------------------------------*/
export function createMidiClipReducer(
  project: ProjectDecl,
  trackId: string,
  sceneIndex: number,
  notes: ReadonlyArray<MidiNote>,
  name?: string
): ProjectDecl {
  const id = `clip_${trackId}_${sceneIndex}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  const clip: ClipDecl = {
    id,
    type: "midi",
    name,
    notes,
    lengthBeats: 4,
  };

  const scenes = (project.session?.scenes ?? []).map((s) =>
    s.index === sceneIndex
      ? { ...s, clips: { ...s.clips, [trackId]: clip } }
      : s
  );

  return { ...project, session: { scenes } };
}

/* -------------------------------------------------------
 * 2. MISE À JOUR DES NOTES MIDI
 * ------------------------------------------------------*/
export function updateMidiClipNotesReducer(
  project: ProjectDecl,
  trackId: string,
  sceneIndex: number,
  notes: ReadonlyArray<MidiNote>
): ProjectDecl {
  const scenes = (project.session?.scenes ?? []).map((s) => {
    if (s.index !== sceneIndex) return s;
    const clip = s.clips[trackId];
    if (!clip || clip.type !== "midi") return s;

    const updated: ClipDecl = { ...clip, notes };
    return { ...s, clips: { ...s.clips, [trackId]: updated } };
  });

  return { ...project, session: { scenes } };
}

/* -------------------------------------------------------
 * 3. MISE À JOUR DE LA LONGUEUR DU CLIP
 * ------------------------------------------------------*/
export function updateMidiClipLengthReducer(
  project: ProjectDecl,
  trackId: string,
  sceneIndex: number,
  lengthBeats: number
): ProjectDecl {
  const len = Math.max(1, Number.isFinite(lengthBeats) ? lengthBeats : 4);

  const scenes = (project.session?.scenes ?? []).map((s) => {
    if (s.index !== sceneIndex) return s;

    const clip = s.clips[trackId];
    if (!clip || clip.type !== "midi") return s;

    const updated: ClipDecl = { ...clip, lengthBeats: len };
    return { ...s, clips: { ...s.clips, [trackId]: updated } };
  });

  return { ...project, session: { scenes } };
}

/* -------------------------------------------------------
 * 4. LOOP : start / end
 * ------------------------------------------------------*/
export function updateClipLoopReducer(
  project: ProjectDecl,
  trackId: string,
  sceneIndex: number,
  loop: { start: number; end: number } | null
): ProjectDecl {
  const scenes = (project.session?.scenes ?? []).map((s) => {
    if (s.index !== sceneIndex) return s;
    const clip = s.clips[trackId];
    if (!clip) return s;

    let updated: ClipDecl;

    if (loop) {
      updated = {
        ...clip,
        loop: true,
        loopStart: loop.start,
        loopEnd: loop.end,
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { loopStart, loopEnd, loop: _loopFlag, ...rest } = clip;
      updated = { ...rest, loop: false };
    }

    return { ...s, clips: { ...s.clips, [trackId]: updated } };
  });

  return { ...project, session: { scenes } };
}

/* -------------------------------------------------------
 * 5. POSITION / START OFFSET
 * ------------------------------------------------------*/
export function setClipStartOffsetReducer(
  project: ProjectDecl,
  trackId: string,
  sceneIndex: number,
  startOffset: number
): ProjectDecl {
  const off = Math.max(0, Number.isFinite(startOffset) ? startOffset : 0);

  const scenes = (project.session?.scenes ?? []).map((s) => {
    if (s.index !== sceneIndex) return s;
    const clip = s.clips[trackId];
    if (!clip) return s;

    const updated: ClipDecl = { ...clip, startOffset: off };
    return { ...s, clips: { ...s.clips, [trackId]: updated } };
  });

  return { ...project, session: { scenes } };
}

/* -------------------------------------------------------
 * 6. QUANTIFICATION DE LANCEMENT
 * ------------------------------------------------------*/
export function setClipLaunchQuantizationReducer(
  project: ProjectDecl,
  trackId: string,
  sceneIndex: number,
  q: "1n" | "1/2" | "1/4" | "1/8" | "bar" | "none"
): ProjectDecl {
  const scenes = (project.session?.scenes ?? []).map((s) => {
    if (s.index !== sceneIndex) return s;

    const clip = s.clips[trackId];
    if (!clip) return s;

    const updated: ClipDecl = { ...clip, launchQuantization: q };
    return { ...s, clips: { ...s.clips, [trackId]: updated } };
  });

  return { ...project, session: { scenes } };
}
