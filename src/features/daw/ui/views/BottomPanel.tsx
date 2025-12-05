"use client";

import { memo } from "react";
import { useUiStore } from "@/features/daw/state/ui.store";
// import { AutomationEditor } from "@/components/daw/automation/AutomationEditor";
import { useEffect, useState } from "react";
import { useInstrumentStore } from "@/features/daw/state/instrument.store";
// import { ClipEditor } from "../daw/controls/clip-editor/ClipEditor";
import { DrumsRack } from "../instruments/DrumsRackPanel";
import { useDrumMachineStore } from "@/features/daw/state/drum-machine.store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { MidiClipEditor } from "../controls/midi-clip-editor-v2/midi-clip-editor";
import { DrumMachinePanel } from "../instruments/DrumMachinePanel";
import { SimpleSynthPanel } from "../instruments/SimpleSynthPanel";
import { DualSynthPanel } from "../instruments/DualSynthPanel";
import { FxRack } from "../mixer/FxRack";
import { ensureLiveInputStarted, stopLiveInput } from "@/core/audio-engine/sources/input-device";
import { InstrumentKind } from "@/core/audio-engine/types";

const BottomPanelComponent = () => {
  const selectedId = useUiStore((s) => s.selectedTrackId);
  const kind = useInstrumentStore((s) => (selectedId ? s.getKind(selectedId) : "simple-synth"));
  const setKind = useInstrumentStore((s) => s.setKind);
  const bottomTab = useUiStore((s) => s.bottomTab);
  const setTab = useUiStore((s) => s.setBottomTab);

  if (!selectedId) {
    return <div className="flex h-full items-center justify-center rounded-sm border border-neutral-700 bg-neutral-800 p-4 text-sm text-neutral-400">Sélectionnez une piste pour afficher ses onglets</div>;
  }

  return (
    <div className="rounded-sm border border-neutral-700 bg-neutral-800 p-2 h-full">
      <Tabs value={bottomTab} onValueChange={(v) => setTab(v as "clip" | "device" | "mixer")}> 
        <TabsList className="bg-neutral-900">
          <TabsTrigger value="clip">Clip</TabsTrigger>
          <TabsTrigger value="device">Device</TabsTrigger>
        </TabsList>
        <TabsContent value="clip" className="h-full">
          {/* <ClipEditor /> */}
          <MidiClipEditor />
          {/* <AutomationEditor trackId={selectedId} /> */}
        </TabsContent>
        <TabsContent value="device">
          <div className="space-y-2">
            <DeviceSelector
              kind={kind}
              onChange={(k) => {
                setKind(selectedId, k);
                // PERF: Initialiser le mapping drum immédiatement pour activer l'éditeur DrumClip
                if (k === "drum-machine") {
                  try { useDrumMachineStore.getState().setMapping(selectedId, {}); } catch {}
                }
              }}
            />
            {kind === "drum-machine" ? (
              <DrumMachinePanel trackId={selectedId} />
            ) : kind === "sampler" ? (
              <DrumsRack trackId={selectedId} />
            ) : kind === "dual-synth" ? (
              <DualSynthPanel trackId={selectedId} />
            ) : (
              <SimpleSynthPanel trackId={selectedId} />
            )}
            <LiveMidiSection trackId={selectedId} />
            <FxRack trackId={selectedId} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const LiveMidiSection = ({ trackId }: { trackId: string }) => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => { if (active) await ensureLiveInputStarted(); })();
    return () => { active = false; stopLiveInput(); };
  }, [enabled, trackId]);
  return (
    <div className="rounded-sm border border-neutral-700 bg-neutral-900 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-neutral-400">MIDI Live</span>
        <label className="flex items-center gap-1 text-[10px] text-neutral-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-yellow-400"
          />
          <span>Input</span>
        </label>
      </div>
      <p className="text-[11px] text-neutral-400">
        {enabled ? "Clavier MIDI externe connecté (notes vers piste)." : "Activer pour recevoir un clavier MIDI externe."}
      </p>
    </div>
  );
};

const DeviceSelector = ({ kind, onChange }: { kind: "simple-synth" | "dual-synth" | "sampler" | "drum-machine"; onChange: (k: InstrumentKind) => void }) => {
  return (
    <div className="rounded-sm border border-neutral-700 bg-neutral-900 p-2">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-400">Device</div>
      <select
        className="h-7 rounded-sm border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-200"
        value={kind}
        onChange={(e) => onChange(e.target.value as InstrumentKind)}
      >
        <option value="simple-synth">Simple Synth</option>
        <option value="dual-synth">Dual Osc Synth</option>
        <option value="sampler">Drums Rack (Sampler)</option>
        <option value="drum-machine">Drum Machine</option>
      </select>
    </div>
  );
};

export const BottomPanel = memo(BottomPanelComponent);
