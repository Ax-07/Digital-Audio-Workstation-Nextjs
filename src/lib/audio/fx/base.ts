import type { EffectKind } from "./types"

export interface AudioEffect<TParams extends Record<string, unknown> = Record<string, unknown>> {
  /** Type discriminant de l'effet */
  readonly kind: EffectKind
  readonly input: AudioNode
  readonly output: AudioNode
  /** Si true, l'effet est contourné (bypass) lors de la reconstruction de la chaîne */
  bypass?: boolean
  /** Met à jour les paramètres de l'effet */
  update(params: Partial<TParams>): void
  /** Retourne un snapshot actuel des paramètres (utilisé pour hydrater l'UI) */
  getParams?(): TParams
  /** Déconnecte les noeuds internes des sorties (sans détruire) */
  disconnect(): void
  /** Détruit et libère les ressources */
  dispose(): void
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
