"use client";
import { useMemo, useState } from "react";
import { drumMachine } from "@/lib/audio/drum-machine/drum-machine";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { DrumWavePreview } from "../DrumWavePreview";
import { renderKickArray } from "./kick-dsp";
import { KickParams } from "../types";
import * as kickPresets from "./kick-preset";
import { cn } from "@/lib/utils";
import Knob from "@/components/daw/controls/knob";

type Props = { trackId: string; className?: string };

// UI à base de Knobs, compacte, avec sections + Advanced.

export function KickEditorModule({ trackId, className }: Props) {
  const [kick, setKick] = useState<KickParams | null>(() => drumMachine.getTrackPreset(trackId).kick);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const markers = useMemo(
    () => [
      {
        atMs: kick?.sweepMs ?? (kick?.pitchDecaySec ? kick.pitchDecaySec * 1000 : 60),
        label: "sweep end",
      },
    ],
    [kick?.sweepMs, kick?.pitchDecaySec]
  );

  const envelope = useMemo(
    () => ({
      ampAtTime: (tSec: number) => {
        const lvl = kick?.level ?? kick?.ampPeak ?? 0.9;
        const atk = (kick?.ampAttackMs ?? (kick?.ampAttackSec ? kick.ampAttackSec * 1000 : 2)) / 1000;
        const dec = (kick?.decayMs ?? (kick?.ampDecaySec ? kick.ampDecaySec * 1000 : 250)) / 1000;
        if (tSec < atk) return lvl * (tSec / Math.max(0.0005, atk));
        const td = tSec - atk;
        return Math.max(0, lvl * Math.exp(-td / Math.max(0.001, dec)));
      },
      color: "#22c55e",
      dashed: true,
    }),
    [kick]
  );

  const update = (patch: Partial<KickParams>) => {
    setKick((k) => (k ? { ...k, ...patch } : k));
    drumMachine.setTrackPreset(trackId, { kick: patch });
  };

  if (!kick) return null;

  const preview = async () => {
    const eng = AudioEngine.ensure();
    await eng.init();
    const ctx = eng.context;
    const when = (ctx?.currentTime ?? 0) + 0.02;
    drumMachine.playSound("kick", 120, when, trackId);
  };

  const presetEntries = Object.entries(kickPresets).filter(([, v]) => typeof v === "object" && v);

  const fmtLabel = (key: string) =>
    key
      .replace(/^KICK_/, "")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase());

  return (
    <Card className={cn("flex flex-col gap-4 p-4 overflow-hidden", className)}>
      {/* Header */}

      {/* Main content */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="font-semibold leading-none">Kick</div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {showAdvanced ? "Advanced" : "Basic"}
          </span>
          {kick.style && (
            <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
              {kick.style}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Preset</Label>
            <Select
              onValueChange={(key: string) => {
                const p = (kickPresets as Record<string, Partial<KickParams> | KickParams>)[key];
                if (p) update(p as Partial<KickParams>);
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {presetEntries.map(([k]) => (
                  <SelectItem key={k} value={k}>
                    {fmtLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="default" size="sm" onClick={preview}>
            Preview
          </Button>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Advanced</Label>
            <Switch checked={showAdvanced} onCheckedChange={(v) => setShowAdvanced(v)} />
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        {/* Left: parameter groups */}
        <div className="flex flex-wrap gap-3 p-0 max-w-[860px]">
          {/* Pitch & Sweep section */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Pitch & Sweep</span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Waveform</Label>
              <Select
                value={kick.waveform ?? "sine"}
                onValueChange={(v: string) => update({ waveform: v as OscillatorType })}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["sine", "triangle", "sawtooth", "square"] as OscillatorType[]).map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Start Hz"
                value={kick.pitchStartHz}
                min={20}
                max={400}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ pitchStartHz: v })}
              />
              <Knob
                label="End Hz"
                value={kick.pitchEndHz}
                min={20}
                max={200}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ pitchEndHz: v })}
              />
              <Knob
                label="Sweep ms"
                value={kick.sweepMs ?? 120}
                min={5}
                max={300}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ sweepMs: v })}
              />
              <Knob
                label="Curve"
                value={kick.sweepCurve ?? 0.25}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ sweepCurve: v })}
              />
            </div>
          </div>

          {/* Body & Env section */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Body</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Level"
                value={kick.level ?? 0.9}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ level: v })}
              />
              <Knob
                label="Decay ms"
                value={kick.decayMs ?? 250}
                min={60}
                max={800}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ decayMs: v })}
              />

              {showAdvanced && (
                <>
                  <Knob
                    label="Attack ms"
                    value={kick.ampAttackMs ?? 2}
                    min={0}
                    max={20}
                    step={0.1}
                    display={(v) => v.toFixed(1)}
                    onChange={(v) => update({ ampAttackMs: v })}
                  />
                  <Knob
                    label="Hold ms"
                    value={kick.ampHoldMs ?? 0}
                    min={0}
                    max={200}
                    step={1}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ ampHoldMs: v })}
                  />
                  <Knob
                    label="Env Curve"
                    value={kick.ampCurve ?? 0}
                    min={0}
                    max={1}
                    step={0.01}
                    display={(v) => v.toFixed(2)}
                    onChange={(v) => update({ ampCurve: v })}
                  />
                </>
              )}
            </div>
          </div>

          {/* Distortion section (avec envelope) */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[220px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Distortion</span>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground">Env</Label>
                <Switch
                  checked={kick.distEnvEnabled ?? false}
                  onCheckedChange={(on) => update({ distEnvEnabled: on })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Mode</Label>
              <Select
                value={kick.distMode ?? "off"}
                onValueChange={(v: string) => update({ distMode: v as KickParams["distMode"] })}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="soft">Soft</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="fold">Fold</SelectItem>
                  <SelectItem value="bit">Bit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Knob
                label="Amount"
                value={kick.distAmount ?? kick.drive ?? 0}
                min={0}
                max={5}
                step={0.1}
                display={(v) => v.toFixed(1)}
                onChange={(v) => update({ distAmount: v })}
              />
              <Knob
                label="Mix"
                value={kick.distMix ?? 1}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ distMix: v })}
              />
              <Knob
                label="Tone"
                value={kick.distTone ?? 0.5}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ distTone: v })}
              />
            </div>

            {/* Enveloppe de disto (ASD) */}
            {(kick.distEnvEnabled ?? false) && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Knob
                  label="Env Amt"
                  value={kick.distEnvAmount ?? 0.6}
                  min={0}
                  max={1}
                  step={0.01}
                  display={(v) => v.toFixed(2)}
                  onChange={(v) => update({ distEnvAmount: v })}
                />
                <Knob
                  label="Env A ms"
                  value={kick.distEnvAttackMs ?? 2}
                  min={0}
                  max={15}
                  step={0.5}
                  display={(v) => v.toFixed(1)}
                  onChange={(v) => update({ distEnvAttackMs: v })}
                />
                <Knob
                  label="Env D ms"
                  value={kick.distEnvDecayMs ?? 80}
                  min={10}
                  max={200}
                  step={5}
                  display={(v) => v.toFixed(0)}
                  onChange={(v) => update({ distEnvDecayMs: v })}
                />
              </div>
            )}
          </div>

          {/* Transient & Tok section */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[220px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Transient / Tok</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Click lvl"
                value={kick.clickLevel ?? 0.2}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ clickLevel: v })}
              />
              <Knob
                label="Click ms"
                value={kick.clickMs ?? 6}
                min={1}
                max={20}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ clickMs: v })}
              />
              <Knob
                label="PreDelay ms"
                value={kick.preDelayMs ?? 20}
                min={0}
                max={60}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ preDelayMs: v })}
              />
            </div>

            {showAdvanced && (
              <>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Switch checked={kick.tokEnabled ?? false} onCheckedChange={(on) => update({ tokEnabled: on })} />
                    <Label className="text-xs">Tok enabled</Label>
                  </div>
                  <div className="w-24">
                    <Select
                      value={kick.tokWaveform ?? "square"}
                      onValueChange={(v: string) => update({ tokWaveform: v as OscillatorType })}
                    >
                      <SelectTrigger className="h-7 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="square">Square</SelectItem>
                        <SelectItem value="sawtooth">Saw</SelectItem>
                        <SelectItem value="triangle">Tri</SelectItem>
                        <SelectItem value="sine">Sine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Knob
                    label="Tok lvl"
                    value={kick.tokLevel ?? 0}
                    min={0}
                    max={1}
                    step={0.01}
                    display={(v) => v.toFixed(2)}
                    onChange={(v) => update({ tokLevel: v })}
                  />
                  <Knob
                    label="Tok Hz"
                    value={kick.tokHz ?? 600}
                    min={100}
                    max={2000}
                    step={5}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ tokHz: v })}
                  />
                  <Knob
                    label="Tok Decay"
                    value={kick.tokDecayMs ?? 40}
                    min={5}
                    max={120}
                    step={1}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ tokDecayMs: v })}
                  />
                  <Knob
                    label="Tok Sweep"
                    value={kick.tokSweepMs ?? 0}
                    min={0}
                    max={20}
                    step={1}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ tokSweepMs: v })}
                  />
                  <Knob
                    label="Tok Drive"
                    value={kick.tokDrive ?? 0}
                    min={0}
                    max={5}
                    step={0.1}
                    display={(v) => v.toFixed(1)}
                    onChange={(v) => update({ tokDrive: v })}
                  />
                </div>
              </>
            )}
          </div>

          {/* Sub section */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[220px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Sub</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={kick.subEnabled ?? false} onCheckedChange={(on) => update({ subEnabled: on })} />
                <Label className="text-xs">Sub enabled</Label>
              </div>
              {showAdvanced && (
                <div className="w-24">
                  <Select
                    value={kick.subWaveform ?? "sine"}
                    onValueChange={(v: string) => update({ subWaveform: v as OscillatorType })}
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sine">Sine</SelectItem>
                      <SelectItem value="triangle">Tri</SelectItem>
                      <SelectItem value="square">Square</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Sub lvl"
                value={kick.subLevel ?? 0}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ subLevel: v })}
              />
              <Knob
                label="Sub Decay"
                value={kick.subDecayMs ?? 400}
                min={50}
                max={800}
                step={5}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ subDecayMs: v })}
              />
              {showAdvanced && (
                <>
                  <Knob
                    label="Sub Freq"
                    value={kick.subFreqHz ?? 45}
                    min={20}
                    max={120}
                    step={1}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ subFreqHz: v })}
                  />
                  <Knob
                    label="Sub Drive"
                    value={kick.subDrive ?? 0}
                    min={0}
                    max={3}
                    step={0.1}
                    display={(v) => v.toFixed(1)}
                    onChange={(v) => update({ subDrive: v })}
                  />
                </>
              )}
            </div>
            {showAdvanced && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={kick.subFollowPitch ?? true}
                  onCheckedChange={(on) => update({ subFollowPitch: on })}
                />
                <Label className="text-xs">Sub suit le pitch</Label>
              </div>
            )}
          </div>

          {/* Tail section (Advanced) */}
          {showAdvanced && (
            <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[220px]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium uppercase tracking-wide">Tail (Body tonal)</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={kick.tailEnabled ?? false} onCheckedChange={(on) => update({ tailEnabled: on })} />
                  <Label className="text-xs">Tail enabled</Label>
                </div>
                <div className="w-24">
                  <Select
                    value={kick.tailWaveform ?? kick.waveform ?? "sine"}
                    onValueChange={(v: string) => update({ tailWaveform: v as OscillatorType })}
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sine">Sine</SelectItem>
                      <SelectItem value="triangle">Tri</SelectItem>
                      <SelectItem value="sawtooth">Saw</SelectItem>
                      <SelectItem value="square">Square</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Knob
                  label="Tail lvl"
                  value={kick.tailLevel ?? 0}
                  min={0}
                  max={1}
                  step={0.01}
                  display={(v) => v.toFixed(2)}
                  onChange={(v) => update({ tailLevel: v })}
                />
                <Knob
                  label="Tail Decay"
                  value={kick.tailDecayMs ?? kick.decayMs ?? 250}
                  min={60}
                  max={800}
                  step={1}
                  display={(v) => v.toFixed(0)}
                  onChange={(v) => update({ tailDecayMs: v })}
                />
                <Knob
                  label="Tail Start"
                  value={kick.tailStartHz ?? kick.pitchStartHz}
                  min={40}
                  max={400}
                  step={1}
                  display={(v) => v.toFixed(0)}
                  onChange={(v) => update({ tailStartHz: v })}
                />
                <Knob
                  label="Tail End"
                  value={kick.tailEndHz ?? kick.pitchEndHz}
                  min={20}
                  max={200}
                  step={1}
                  display={(v) => v.toFixed(0)}
                  onChange={(v) => update({ tailEndHz: v })}
                />
                <Knob
                  label="Tail Sweep"
                  value={kick.tailSweepMs ?? kick.sweepMs ?? 120}
                  min={5}
                  max={300}
                  step={1}
                  display={(v) => v.toFixed(0)}
                  onChange={(v) => update({ tailSweepMs: v })}
                />
                <Knob
                  label="Tail Curve"
                  value={kick.tailSweepCurve ?? kick.sweepCurve ?? 0.25}
                  min={0}
                  max={1}
                  step={0.01}
                  display={(v) => v.toFixed(2)}
                  onChange={(v) => update({ tailSweepCurve: v })}
                />
              </div>
            </div>
          )}

          {/* Filter & DC + Advanced DSP */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[220px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Filter & DC</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="HP Cut Hz"
                value={kick.hpCutFreqHz ?? 28}
                min={20}
                max={120}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ hpCutFreqHz: v })}
              />
              {showAdvanced && (
                <Knob
                  label="HP DC"
                  value={kick.hpDC ?? 0.995}
                  min={0.99}
                  max={0.9999}
                  step={0.0001}
                  display={(v) => v.toFixed(4)}
                  onChange={(v) => update({ hpDC: v })}
                />
              )}
            </div>

            {showAdvanced && (
              <>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Knob
                    label="Shelf F Hz"
                    value={kick.shelfFreqHz ?? 2500}
                    min={800}
                    max={8000}
                    step={10}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ shelfFreqHz: v })}
                  />
                  <Knob
                    label="Shelf Gain dB"
                    value={kick.shelfGainDb ?? 0}
                    min={-12}
                    max={12}
                    step={0.1}
                    display={(v) => v.toFixed(1)}
                    onChange={(v) => update({ shelfGainDb: v })}
                  />
                  <Knob
                    label="Clip Thresh"
                    value={kick.clipThreshold ?? 0.9}
                    min={0.6}
                    max={1}
                    step={0.01}
                    display={(v) => v.toFixed(2)}
                    onChange={(v) => update({ clipThreshold: v })}
                  />
                  <Knob
                    label="Post F Hz"
                    value={kick.postFilterFreqHz ?? 0}
                    min={0}
                    max={8000}
                    step={10}
                    display={(v) => (v <= 0 ? "Off" : v.toFixed(0))}
                    onChange={(v) =>
                      update({
                        postFilterFreqHz: v,
                        postFilterType: v <= 0 ? "none" : kick.postFilterType ?? "lp",
                      })
                    }
                  />
                  <Knob
                    label="Post Q"
                    value={kick.postFilterQ ?? 0.707}
                    min={0.1}
                    max={20}
                    step={0.1}
                    display={(v) => v.toFixed(1)}
                    onChange={(v) => update({ postFilterQ: v })}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Switch checked={!(kick.clipBypass ?? false)} onCheckedChange={(on) => update({ clipBypass: !on })} />
                  <Label className="text-xs">Clipper actif</Label>

                  <Switch
                    checked={!(kick.shelfBypass ?? false)}
                    onCheckedChange={(on) => update({ shelfBypass: !on })}
                  />
                  <Label className="text-xs">Shelf actif</Label>
                </div>
              </>
            )}
          </div>

          {/* Noise / Texture */}
          <div className="rounded-xl border bg-background/40 p-2 space-y-2 min-w-[220px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide">Noise / Texture</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={kick.noiseEnabled ?? false} onCheckedChange={(on) => update({ noiseEnabled: on })} />
                <Label className="text-xs">Noise enabled</Label>
              </div>
              {showAdvanced && (
                <div className="w-28">
                  <Select
                    value={kick.noiseColor ?? "white"}
                    onValueChange={(v: string) =>
                      update({
                        noiseColor: v as KickParams["noiseColor"],
                      })
                    }
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="white">White</SelectItem>
                      <SelectItem value="pink">Pink</SelectItem>
                      <SelectItem value="band">Band</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Noise lvl"
                value={kick.noiseLevel ?? 0}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(v) => update({ noiseLevel: v })}
              />
              <Knob
                label="Noise ms"
                value={kick.noiseDecayMs ?? 60}
                min={5}
                max={200}
                step={1}
                display={(v) => v.toFixed(0)}
                onChange={(v) => update({ noiseDecayMs: v })}
              />

              {showAdvanced && (
                <>
                  <Knob
                    label="Noise HP Hz"
                    value={kick.noiseHpHz ?? 2000}
                    min={500}
                    max={8000}
                    step={50}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ noiseHpHz: v })}
                  />
                  <Knob
                    label="Noise BP Hz"
                    value={kick.noiseBpHz ?? 4000}
                    min={500}
                    max={8000}
                    step={50}
                    display={(v) => v.toFixed(0)}
                    onChange={(v) => update({ noiseBpHz: v })}
                  />
                  <Knob
                    label="Noise Q"
                    value={kick.noiseBpQ ?? 2}
                    min={0.5}
                    max={10}
                    step={0.1}
                    display={(v) => v.toFixed(1)}
                    onChange={(v) => update({ noiseBpQ: v })}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: waveform preview (center, flexible) */}
        <div className="min-w-[260px] flex-1">
          <DrumWavePreview<KickParams>
            title="Kick Preview"
            params={kick}
            render={renderKickArray}
            durationMs={400}
            sampleRate={48000}
            markers={markers}
            envelope={envelope}
            allowPlay
            className="h-full w-full"
          />
        </div>
      </div>
    </Card>
  );
}

export default KickEditorModule;
