// src/components/dev/AudioPerfDebugPanel.tsx
// Panneau de debug simple affichant les métriques audio.
// À monter uniquement en environnement de développement.

import React from 'react'
import { useAudioPerfSnapshot } from '@/lib/audio/perf/use-audio-perf'

export const AudioPerfDebugPanel: React.FC<{ intervalMs?: number }> = ({ intervalMs = 1000 }) => {
  const snap = useAudioPerfSnapshot(intervalMs)
  return (
    <div style={{
      fontFamily: 'monospace',
      fontSize: 12,
      padding: '6px 8px',
      background: '#111',
      color: '#ddd',
      border: '1px solid #333',
      borderRadius: 4,
      maxWidth: 280,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Audio Perf</div>
      <div>Voix actives synth: {snap.synth.activeVoices}</div>
      <div>Voice steals: {snap.synth.voiceSteals}</div>
      <div style={{ marginTop: 4 }}>Drums: K:{snap.drums.kick} S:{snap.drums.snare} H:{snap.drums.hh}</div>
      <div style={{ marginTop: 4 }}>Routing v2: {snap.routing.v2Tracks} / legacy: {snap.routing.legacyTracks}</div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>Updated: {new Date(snap.updatedAt).toLocaleTimeString()}</div>
    </div>
  )
}

export default AudioPerfDebugPanel
