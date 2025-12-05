// src/lib/audio/perf/use-audio-perf.ts
// Hook léger pour récupérer périodiquement les métriques audio sans surcharger le moteur.
// Interval volontairement bas (1000ms) pour éviter toute pression sur le thread audio/UI.
// PERF: n'utilise pas requestAnimationFrame pour ne pas dépendre de la cadence de rendu.

import { useEffect, useState } from 'react'
import { perfGetSnapshot, perfUpdateRoutingStatus, type AudioPerfSnapshot } from './audio-metrics'

export function useAudioPerfSnapshot(updateMs: number = 1000): AudioPerfSnapshot {
  const [snap, setSnap] = useState<AudioPerfSnapshot>(() => {
    // Première mise à jour routing pour éviter snapshot partiellement vide.
    try { perfUpdateRoutingStatus() } catch {}
    return perfGetSnapshot()
  })

  useEffect(() => {
    let mounted = true
    const id = setInterval(() => {
      try { perfUpdateRoutingStatus() } catch {}
      if (!mounted) return
      setSnap(perfGetSnapshot())
    }, Math.max(250, updateMs)) // clamp bas pour éviter spam
    return () => { mounted = false; clearInterval(id) }
  }, [updateMs])

  return snap
}
