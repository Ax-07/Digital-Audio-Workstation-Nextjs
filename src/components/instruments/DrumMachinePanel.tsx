"use client";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
// import { Button } from "@/components/ui/button"; // Boutons de preview commentés
import { drumMachine } from "@/lib/audio/drum-machine/drum-machine";
import { DEFAULT_PRESET } from "@/lib/audio/sources/drums/drum-machine/presets"; // Badge état preset
// import { AudioEngine } from "@/lib/audio/core/audio-engine"; // (non utilisé)
// (Imports Label, Slider, Input, MixerCore retirés car sections correspondantes sont commentées)
// import { useDrumMachineStore } from "@/lib/stores/drum-machine.store"; // (non utilisé actuellement)
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KickEditorModule } from "@/lib/audio/sources/drums/drum-machine/kick/kick-editor";
import { SnareEditorModule } from "@/lib/audio/sources/drums/drum-machine/snare/snare-editor";
import { HiHatEditorModule } from "@/lib/audio/sources/drums/drum-machine/hi-hat/hi-hat-editor";
import OpenHiHatEditorModule from "@/lib/audio/sources/drums/drum-machine/hi-hat/hi-hat-open-editor";
import { TomEditorModule } from "@/lib/audio/sources/drums/drum-machine/tom/tom-editor";
import Crash1EditorModule from "@/lib/audio/sources/drums/drum-machine/crash/crash1-editor";
import ChinaEditorModule from "@/lib/audio/sources/drums/drum-machine/china/china-editor";

export function DrumMachinePanel({ trackId }: { trackId: string }) {
  // preview utilitaire (actuellement non utilisé car boutons masqués)
  // const preview = useCallback(
  //   async (which: "kick" | "snare" | "hh") => {
  //     const eng = AudioEngine.ensure();
  //     await eng.init();
  //     const ctx = eng.context;
  //     const when = (ctx?.currentTime ?? 0) + 0.02;
  //     try { await drumMachine.ensure(); } catch {}
  //     try { drumMachine.playSound(which, 110, when, trackId); } catch {}
  //   },
  //   [trackId]
  // );

  // Track controls (gain dB, pan, sends)
  // const [gainDb, setGainDb] = useState<number>(0);
  // const [pan, setPan] = useState<number>(0);
  // const [sendA, setSendA] = useState<number>(0);
  // const [sendB, setSendB] = useState<number>(0);
  // const applyTrack = useCallback(() => {
  //   const mix = MixerCore.ensure();
  //   mix.ensureTrack(trackId);
  //   mix.setGainDb(trackId, gainDb);
  //   mix.setPan(trackId, pan);
  //   mix.setSendAmount(trackId, "A", sendA);
  //   mix.setSendAmount(trackId, "B", sendB);
  // }, [trackId, gainDb, pan, sendA, sendB]);

  // Mapping editor
  // const mapping = useMemo(() => useDrumMachineStore.getState().getMapping(trackId), [trackId]);
  // const [kickMap, setKickMap] = useState<string>(mapping.kick.join(","));
  // const [snareMap, setSnareMap] = useState<string>(mapping.snare.join(","));
  // const [hhMap, setHhMap] = useState<string>(mapping.hh.join(","));

  // const parseList = (s: string) =>
  //   s
  //     .split(",")
  //     .map((t) => parseInt(t.trim(), 10))
  //     .filter((n) => Number.isFinite(n) && n >= 0 && n <= 127);

  // const applyMapping = useCallback(() => {
  //   useDrumMachineStore.getState().setMapping(trackId, {
  //     kick: parseList(kickMap),
  //     snare: parseList(snareMap),
  //     hh: parseList(hhMap),
  //   });
  // }, [trackId, kickMap, snareMap, hhMap]);

  // Indicateur preset actif (Custom vs Default) — comparaison JSON légère.
  const presetBadge = useMemo(() => {
    try {
      const current = drumMachine.getTrackPreset(trackId);
      const isCustom = JSON.stringify(current) !== JSON.stringify(DEFAULT_PRESET);
      return isCustom ? "Custom" : "Default";
    } catch {
      return "";
    }
  }, [trackId]);

  return (
    <Card className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-neutral-400">Drum Machine</div>
        {presetBadge && (
          <span className={"ml-2 inline-block rounded px-2 py-0.5 text-[10px] font-medium " + (presetBadge === "Custom" ? "bg-amber-700/70 text-amber-100" : "bg-neutral-700 text-neutral-200")}>{presetBadge}</span>
        )}
      </div>
      {/* <div className="flex gap-2">
        <Button size="sm" onClick={() => preview("kick")}>Kick</Button>
        <Button size="sm" onClick={() => preview("snare")}>Snare</Button>
        <Button size="sm" onClick={() => preview("hh")}>Hi-Hat</Button>
      </div> */}
      {/* <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Gain (dB): {gainDb.toFixed(1)}</Label>
          <Slider min={-24} max={6} step={0.1} value={[gainDb]} onValueChange={(v:number[])=>setGainDb(v[0])} />
        </div>
        <div>
          <Label>Pan: {pan.toFixed(2)}</Label>
          <Slider min={-1} max={1} step={0.01} value={[pan]} onValueChange={(v:number[])=>setPan(v[0])} />
        </div>
        <div>
          <Label>Send A: {sendA.toFixed(2)}</Label>
          <Slider min={0} max={1} step={0.01} value={[sendA]} onValueChange={(v:number[])=>setSendA(v[0])} />
        </div>
        <div>
          <Label>Send B: {sendB.toFixed(2)}</Label>
          <Slider min={0} max={1} step={0.01} value={[sendB]} onValueChange={(v:number[])=>setSendB(v[0])} />
        </div>
        <div className="col-span-2">
          <Button size="sm" variant="secondary" onClick={applyTrack}>Appliquer routing</Button>
        </div>
      </div> */}
      {/* <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-neutral-400">Mapping (notes MIDI)</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Kick</Label>
            <Input value={kickMap} onChange={(e)=>setKickMap(e.target.value)} placeholder="36,35" />
          </div>
          <div>
            <Label className="text-xs">Snare</Label>
            <Input value={snareMap} onChange={(e)=>setSnareMap(e.target.value)} placeholder="38,40" />
          </div>
          <div>
            <Label className="text-xs">Hi-Hat</Label>
            <Input value={hhMap} onChange={(e)=>setHhMap(e.target.value)} placeholder="42,44,46" />
          </div>
        </div>
        <Button size="sm" onClick={applyMapping}>Appliquer mapping</Button>
      </div> */}
      <div className="space-y-2 pt-2 border-t">
        <div className="text-[10px] uppercase tracking-widest text-neutral-400">Éditeurs avancés</div>
        <Tabs defaultValue="kick">
          <TabsList>
            <TabsTrigger value="kick">Kick</TabsTrigger>
            <TabsTrigger value="snare">Snare</TabsTrigger>
            <TabsTrigger value="hh">Hi-Hat</TabsTrigger>
            <TabsTrigger value="hhOpen">Open Hi-Hat</TabsTrigger>
            <TabsTrigger value="tomL">Tom L</TabsTrigger>
            <TabsTrigger value="tomH">Tom H</TabsTrigger>
            <TabsTrigger value="tomM">Tom Mid</TabsTrigger>
            <TabsTrigger value="tomF">Tom Floor</TabsTrigger>
            <TabsTrigger value="crash1">Crash 1</TabsTrigger>
            <TabsTrigger value="china">China</TabsTrigger>
          </TabsList>
          <TabsContent value="kick">
            <KickEditorModule trackId={trackId} />
          </TabsContent>
          <TabsContent value="snare">
            <SnareEditorModule trackId={trackId} />
          </TabsContent>
          <TabsContent value="hh">
            <HiHatEditorModule trackId={trackId} />
          </TabsContent>
          <TabsContent value="hhOpen">
            <OpenHiHatEditorModule trackId={trackId} />
          </TabsContent>
          <TabsContent value="tomL">
            <TomEditorModule trackId={trackId} style={"low"} instrument={"tomLow"} label={"Tom Low"} />
          </TabsContent>
          <TabsContent value="tomH">
            <TomEditorModule trackId={trackId} style={"high"} instrument={"tomHigh"} label={"Tom High"} />
          </TabsContent>
          <TabsContent value="tomM">
            <TomEditorModule trackId={trackId} style={"mid"} instrument={"tomMid"} label={"Tom Mid"} />
          </TabsContent>
          <TabsContent value="tomF">
            <TomEditorModule trackId={trackId} style={"floor"} instrument={"tomFloor"} label={"Tom Floor"} />
          </TabsContent>
          <TabsContent value="crash1">
            <Crash1EditorModule trackId={trackId} />
          </TabsContent>
          <TabsContent value="china">
            <ChinaEditorModule trackId={trackId} />
          </TabsContent>

        </Tabs>
      </div>
      <p className="text-[11px] text-neutral-400">
        Utilisez des notes MIDI (par défaut: 36=Kick, 38=Snare, 42=Hat) ou personnalisez le mapping.
      </p>
    </Card>
  );
}
