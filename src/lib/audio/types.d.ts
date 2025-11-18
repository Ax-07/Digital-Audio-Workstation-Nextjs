/**
 * Type de piste :
 * - "AudioTrack" : piste audio avec sample / entrée audio
 * - "MidiTrack"  : piste MIDI (pilotage d’un instrument virtuel)
 */
export type TrackType = "AudioTrack" | "MidiTrack";

/**
 * Déclaration générique d’un effet (insert ou autre).
 * - type : identifiant de l’effet (ex. "delay", "reverb", "eq", "gain")
 * - params : dictionnaire clé/valeur pour les paramètres de l’effet
 */
export type FxDecl = {
  readonly type: string; // ex. "delay" | "reverb" | "eq" | "gain" (placeholders v0)
  readonly params?: Readonly<Record<string, number | string | boolean>>;
};

/**
 * Déclaration d’un envoi vers un bus de retour.
 * - target : "A" ou "B" (retours)
 * - amount : niveau d’envoi (0..1)
 */
export type SendDecl = {
  readonly target: "A" | "B";
  readonly amount: number; // 0..1
};

/**
 * Déclaration d’une piste (track ou return).
 * - id / name : identifiants de la piste
 * - type : AudioTrack ou MidiTrack
 * - gainDb : niveau en dB (-60..+6)
 * - pan : panoramique (-1..1)
 * - fx : soit une liste d’effets, soit une config simplifiée (pour retours)
 * - sends : envois vers les retours A/B
 * - automation : courbes d’automation (gain, pan, sends…)
 */
export type TrackDecl = {
  readonly id: string;
  readonly name?: string;
  readonly type: TrackType;
  readonly gainDb?: number; // -60..+6
  readonly pan?: number;    // -1..1

  /**
   * Effets de la piste.
   * - Pour les pistes : tableau d’inserts (FxDecl[])
   * - Pour les retours : structure compacte avec quelques paramètres de base.
   */
  readonly fx?:
    | readonly FxDecl[]
    | {
        readonly reverb?: boolean;
        readonly delay?: boolean;
        readonly delayTime?: number;      // secondes (0..1 typique)
        readonly reverbDecay?: number;    // 0..1
        readonly reverbDuration?: number; // secondes (par ex. 0.3..3)
      };

  /** Envois vers les bus de retour (A/B) */
  readonly sends?: readonly SendDecl[];

  /**
   * Données d’automation de la piste.
   * Chaque propriété est une série de points (beat, value) sur la timeline.
   */
  readonly automation?: {
    /** Automation de gain en dB (valeurs absolues en beats) */
    readonly gainDb?: ReadonlyArray<{
      readonly beat: number;  // position absolue en beats
      readonly value: number; // valeur en dB
    }>;
    /** Automation de pan (-1..1) */
    readonly pan?: ReadonlyArray<{
      readonly beat: number;  // position absolue en beats
      readonly value: number; // -1..1
    }>;
    /** Automation du send A (0..1) */
    readonly sendA?: ReadonlyArray<{
      readonly beat: number;
      readonly value: number; // 0..1
    }>;
    /** Automation du send B (0..1) */
    readonly sendB?: ReadonlyArray<{
      readonly beat: number;
      readonly value: number; // 0..1
    }>;
  };
};

/**
 * Déclaration complète d’un projet.
 * - tracks : liste des pistes principales
 * - returns : pistes de retour (A/B)
 * - bpm : tempo global du projet
 * - session : représentation clip-launcher (vue Session)
 */
export type ProjectDecl = {
  readonly tracks: readonly TrackDecl[];
  /** Pistes de retour A/B (aux/FX returns) */
  readonly returns?: readonly TrackDecl[];
  /** Tempo global, en battements par minute (BPM) */
  readonly bpm?: number;

  /**
   * Représentation de la Session (clip launcher).
   * - scenes : lignes (scènes)
   * - chaque scène a des clips par piste (trackId → clip)
   */
  readonly session?: SessionViewDecl;
};

// ---- Session / Clips ----

/**
 * Type de clip :
 * - "audio" : clip basé sur un sample audio
 * - "midi"  : clip de notes MIDI
 */
export type ClipType = "audio" | "midi";

/**
 * Déclaration d’un clip audio ou MIDI.
 * - id / type / name / color : méta-données
 * - sampleUrl : pour les clips audio
 * - lengthBeats : longueur du clip en beats (surtout pour MIDI / UI)
 * - loopStart / loopEnd / loop : paramètres de boucle
 * - startOffset : offset de lecture à l’intérieur de la région de loop
 * - launchQuantization : quantification de lancement propre au clip
 * - notes : contenu MIDI (pour type "midi")
 */
export type ClipDecl = {
  readonly id: string;
  readonly type: ClipType;
  readonly name?: string;
  readonly color?: string;

  // Placeholder minimal pour les futures extensions audio.
  /** URL du sample associé (clips audio) */
  readonly sampleUrl?: string;

  /**
   * Longueur du clip en beats (pour l’éditeur MIDI / UI).
   * Optionnel pour compatibilité ascendante.
   * Si undefined, l’UI doit utiliser une valeur par défaut (ex. 4 beats).
   */
  readonly lengthBeats?: number;

  /** Point de début de loop (en beats ou secondes, à préciser) */
  readonly loopStart?: number;
  /** Point de fin de loop (en beats ou secondes, à préciser) */
  readonly loopEnd?: number;

  /** 
   * Drapeau d’activation explicite de la boucle.
   * La boucle n’est prise en compte que si `loop === true` ET que start/end sont valides.
   */
  readonly loop?: boolean;

  /**
   * Offset de départ à l’intérieur de la région de loop (en beats, selon spec).
   * Ignoré si aucune boucle n’est définie.
   */
  readonly startOffset?: number;

  /**
   * Quantification de lancement spécifique au clip.
   * Si défini, elle surcharge la quantification globale de lancement.
   */
  readonly launchQuantization?: "1n" | "1/2" | "1/4" | "1/8" | "bar" | "none";

  /** Contenu MIDI (notes) pour les clips de type "midi" */
  readonly notes?: ReadonlyArray<MidiNote>;
};

/**
 * Déclaration d’une scène dans la vue Session.
 * - index : indice 0-based
 * - name / color : méta-données de la scène
 * - clips : mapping trackId → clip ou null
 */
export type SceneDecl = {
  readonly index: number; // 0-based
  readonly name?: string;
  readonly color?: string;
  /** Mapping trackId → clip ou null (cellule de la grille Session) */
  readonly clips: Readonly<Record<string, ClipDecl | null>>;
};

/**
 * Vue Session complète : simple liste de scènes.
 */
export type SessionViewDecl = {
  readonly scenes: ReadonlyArray<SceneDecl>;
};

/**
 * Déclaration d'une note MIDI.
 * - pitch : numéro de note 0..127 (MIDI)
 * - time : position de départ en beats (relative au début du clip)
 * - duration : durée de la note en beats
 * - velocity : intensité 0..1 (optionnelle)
 */
export type MidiNote = {
  readonly id: string;
  readonly pitch: number;     // 0..127
  readonly time: number;      // en beats, relatif au début du clip
  readonly duration: number;  // en beats
  readonly velocity?: number; // 0..1
};

// ---- Envelopes & Modulation ----

/**
 * Type d'instrument MIDI disponible.
 * Source unique de vérité pour tous les types d'instruments du DAW.
 */
export type InstrumentKind = "simple-synth" | "dual-synth" | "sampler";

/**
 * Modulation par envelope générique.
 * Compatible avec simple-synth et dual-synth.
 * 
 * - id         : identifiant unique de la modulation
 * - target     : paramètre cible de la modulation
 *   - "amp"      : amplitude (volume)
 *   - "detune"   : détune global (alias legacy pour detuneB)
 *   - "detuneA"  : détune de l'oscillateur A (dual-synth uniquement)
 *   - "detuneB"  : détune de l'oscillateur B (dual-synth uniquement)
 *   - "mix"      : balance entre oscillateurs (dual-synth uniquement)
 * - envelope   : courbe d'envelope (GenericEnvelope)
 * - enabled    : active/désactive la modulation sans la supprimer
 * - depthCents : profondeur en cents pour les cibles de type detune*
 * - depthMix   : profondeur pour la modulation du mix (-1..1, dual-synth uniquement)
 * - name       : label lisible pour l'UI
 * - group      : catégorie pour organisation UI (ex: "Amp", "Pitch", "Mix")
 * - macro      : placeholder pour système de macros futur
 */
export type EnvelopeMod = {
  readonly id: string;
  readonly target: "amp" | "detune" | "detuneA" | "detuneB" | "mix";
  readonly envelope: import("@/lib/audio/envelopes/generic-envelope").GenericEnvelope;
  readonly enabled?: boolean;
  readonly depthCents?: number;
  readonly depthMix?: number;
  readonly name?: string;
  readonly group?: string;
  readonly macro?: string;
};

/**
 * Valeurs de grille disponibles pour le Piano Roll et l'édition MIDI.
 * Représente la subdivision rythmique (4 = 1/4, 16 = 1/16, etc.)
 */
export type GridValue = 4 | 8 | 12 | 16 | 24 | 32;
