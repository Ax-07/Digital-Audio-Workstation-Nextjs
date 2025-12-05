"use client";

// Lightweight, dev-only smoke tests for reconciliation
// These tests avoid audio context requirements and verify JSON persistence + basic API paths.

import { useProjectStore } from "@/features/daw/state/project.store";

type TestResult = { name: string; pass: boolean; details?: string };

export function runReconcileSmokeTests(): TestResult[] {
  const results: TestResult[] = [];
  const store = useProjectStore.getState();

  // Reset project to a minimal baseline
  store.setProject({
    bpm: 120,
    tracks: [{ id: "t1", type: "AudioTrack", name: "T1", gainDb: -6, pan: 0 }],
  });

  try {
    // Auto-create Return A, apply gain/pan and FX
    store.updateReturn("A", { gainDb: -12, pan: 0, fx: { reverb: true, delay: false } });
    const p1 = useProjectStore.getState().project;
    const rA = p1.returns?.find((r) => r.id === "A");
    results.push({ name: "Create Return A", pass: !!rA });
    results.push({ name: "Return A gainDb applied", pass: rA?.gainDb === -12 });
    results.push({ name: "Return A pan applied", pass: rA?.pan === 0 });
    const fxA = (rA?.fx && !Array.isArray(rA.fx) ? rA.fx : undefined) as { reverb?: boolean; delay?: boolean } | undefined;
    results.push({ name: "Return A FX reverb on", pass: fxA?.reverb === true && fxA?.delay === false });

    // Create Return B and set delay
  store.updateReturn("B", { gainDb: -9, pan: -0.2, fx: { reverb: false, delay: true, delayTime: 0.4 } });
    const p2 = useProjectStore.getState().project;
    const rB = p2.returns?.find((r) => r.id === "B");
    results.push({ name: "Create Return B", pass: !!rB });
    results.push({ name: "Return B params applied", pass: rB?.gainDb === -9 && rB?.pan === -0.2 });
  const fxB = (rB?.fx && !Array.isArray(rB.fx) ? rB.fx : undefined) as { reverb?: boolean; delay?: boolean; delayTime?: number } | undefined;
  results.push({ name: "Return B FX delay on", pass: fxB?.reverb === false && fxB?.delay === true });
  results.push({ name: "Return B delayTime persisted", pass: fxB?.delayTime === 0.4 });

    // Bypass A
  store.updateReturn("A", { fx: { reverb: false, delay: false, reverbDecay: 0.7 } });
    const p3 = useProjectStore.getState().project;
    const rA2 = p3.returns?.find((r) => r.id === "A");
  const fxA2 = (rA2?.fx && !Array.isArray(rA2.fx) ? rA2.fx : undefined) as { reverb?: boolean; delay?: boolean; reverbDecay?: number } | undefined;
    results.push({ name: "Return A bypass", pass: fxA2?.reverb === false && fxA2?.delay === false });
  results.push({ name: "Return A reverbDecay persisted", pass: fxA2?.reverbDecay === 0.7 });
  } catch (e) {
    results.push({ name: "Unexpected error", pass: false, details: (e as Error).message });
  }

  return results;
}
