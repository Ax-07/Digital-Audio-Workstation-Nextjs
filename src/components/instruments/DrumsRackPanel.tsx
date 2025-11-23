"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { ensureMidiTrack } from "@/lib/audio/sources/midi-track";
import { Sampler, SampleZone } from "@/lib/audio/sources/sampler/sampler";

type Props = {
  trackId: string;
};

/**
 * DrumPad
 * -------
 * Définition d'un pad de drum rack :
 * - id : identifiant unique du pad
 * - name : nom affiché sur le pad
 * - pitch : note MIDI (36 = Kick, 38 = Snare, etc.)
 * - url : chemin vers le sample audio
 * - color : couleur du pad (optionnel)
 */
type DrumPad = {
  id: string;
  name: string;
  pitch: number;
  url: string;
  color?: string;
};

/**
 * Configuration par défaut des pads
 * Standard General MIDI Drum Map (16 pads)
 */
const DEFAULT_PADS: DrumPad[] = [
  // Ligne 1 - Kicks & Snares
  { id: "kick", name: "Kick", pitch: 36, url: "/sound/Kick-01.wav", color: "bg-red-600" },
  { id: "snare", name: "Snare", pitch: 38, url: "/sound/Lev-Snare-001.wav", color: "bg-blue-600" },
  { id: "kick2", name: "Kick 2", pitch: 35, url: "/sound/PT_Kick_G_01.wav", color: "bg-orange-600" },
  { id: "kick3", name: "Kick 3", pitch: 37, url: "/sound/PT_Kick_F_03.wav", color: "bg-purple-600" },
  
  // Ligne 2 - Hi-Hats & Cymbals
  { id: "shaker", name: "Shaker", pitch: 42, url: "/sound/Lev-Shaker-001.wav", color: "bg-green-600" },
  { id: "hihat-closed", name: "HH Close", pitch: 44, url: "", color: "bg-teal-600" },
  { id: "hihat-open", name: "HH Open", pitch: 46, url: "", color: "bg-cyan-600" },
  { id: "crash", name: "Crash", pitch: 49, url: "", color: "bg-slate-600" },
  
  // Ligne 3 - Toms
  { id: "kick4", name: "Kick 4", pitch: 39, url: "/sound/PT_Kick_G#_01.wav", color: "bg-pink-600" },
  { id: "kick5", name: "Kick 5", pitch: 40, url: "/sound/PT_Kick_F#_01.wav", color: "bg-yellow-600" },
  { id: "kick6", name: "Kick 6", pitch: 41, url: "/sound/PT_Kick_G_02.wav", color: "bg-indigo-600" },
  { id: "tom1", name: "Tom 1", pitch: 43, url: "", color: "bg-violet-600" },
  
  // Ligne 4 - Additional Toms & Percussion
  { id: "tom2", name: "Tom 2", pitch: 45, url: "", color: "bg-fuchsia-600" },
  { id: "tom3", name: "Tom 3", pitch: 47, url: "", color: "bg-rose-600" },
  { id: "tom4", name: "Tom 4", pitch: 48, url: "", color: "bg-amber-600" },
  { id: "clap", name: "Clap", pitch: 50, url: "", color: "bg-lime-600" },
];

/**
 * PadButton
 * ---------
 * Composant de pad individuel avec :
 * - Trigger au clic
 * - Highlight visuel lors du trigger
 * - Affichage du nom et note MIDI
 */
const PadButton = memo(function PadButton({
  pad,
  onTrigger,
}: {
  pad: DrumPad;
  onTrigger: (pitch: number) => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  const handleClick = useCallback(() => {
    onTrigger(pad.pitch);
    setIsActive(true);
    
    // Animation visuelle 200ms
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setIsActive(false), 200);
  }, [onTrigger, pad.pitch]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <button
      onClick={handleClick}
      disabled={!pad.url}
      className={`
        relative flex flex-col items-center justify-center rounded-lg
        border-2 transition-all duration-150
        size-12
        ${!pad.url 
          ? "bg-neutral-800 border-neutral-700 opacity-50 cursor-not-allowed" 
          : isActive 
            ? `${pad.color ?? "bg-neutral-600"} scale-95 border-white shadow-lg` 
            : `${pad.color ?? "bg-neutral-700"} border-neutral-600 hover:border-neutral-500 hover:scale-105`
        }
      `}
    >
      <div className="text-[10px] font-bold text-white truncate max-w-full px-1">{pad.name}</div>
      <div className="text-[8px] text-neutral-300">
        {pad.pitch}
      </div>
    </button>
  );
});

const DrumsRackComponent = ({ trackId }: Props) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const samplerRef = useRef<Sampler | null>(null);
  const midiTrackRef = useRef<ReturnType<typeof ensureMidiTrack> | null>(null);

  /**
   * Création des zones de sample à partir des pads
   * Filtre les pads sans URL pour éviter les erreurs de chargement
   */
  const zones: SampleZone[] = useMemo(() => {
    return DEFAULT_PADS.filter((pad) => pad.url !== "").map((pad) => ({
      id: pad.id,
      url: pad.url,
      rootPitch: pad.pitch,
      minVelocity: 0,
      maxVelocity: 1,
    }));
  }, []);

  /**
   * Initialisation du sampler et préchargement des samples
   */
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const engine = AudioEngine.ensure();
        await engine.init();

        // Création du sampler avec les zones
        const sampler = new Sampler({ zones });
        
        // Préchargement des samples
        await sampler.preload();

        if (!mounted) return;

        // Configuration de la MidiTrack
        const mt = ensureMidiTrack(trackId);
        mt.setInstrument("sampler", { sampler });

        samplerRef.current = sampler;
        midiTrackRef.current = mt;

        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        console.error("Erreur lors de l'initialisation du DrumsRack:", err);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [trackId, zones]);

  /**
   * Trigger un pad (appelé par le clic UI)
   * Utilise noteOn de la MidiTrack pour cohérence avec le reste du système
   */
  const handleTrigger = useCallback(
    (pitch: number) => {
      if (!isReady || !midiTrackRef.current) return;

      // Résumer l'audio context si nécessaire
      const engine = AudioEngine.ensure();
      engine.resume().catch(console.error);

      // Trigger via MidiTrack (velocity = 0.8 par défaut)
      midiTrackRef.current.noteOn(pitch, 0.8, false);
    },
    [isReady]
  );

  return (
    <div className="rounded-sm border border-neutral-700 bg-neutral-850 p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium uppercase tracking-widest text-neutral-400">
          Drums Rack
        </div>
        {isLoading && (
          <div className="text-xs text-neutral-500">Loading samples...</div>
        )}
        {isReady && (
          <div className="text-xs text-green-500">● Ready</div>
        )}
      </div>

      {/* Grid de pads */}
      <div className="grid grid-cols-4 gap-2 w-fit">
        {DEFAULT_PADS.map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
            onTrigger={handleTrigger}
          />
        ))}
      </div>

      {/* Info panel */}
      <div className="mt-4 rounded border border-neutral-700 bg-neutral-900 p-3">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
          Info
        </div>
        <div className="space-y-1 text-xs text-neutral-400">
          <div>• Click pads to trigger samples</div>
          <div>• MIDI notes: 35-50 (GM Drum Map)</div>
          <div>• Gray pads: no sample loaded</div>
        </div>
      </div>
    </div>
  );
};

export const DrumsRack = memo(DrumsRackComponent);