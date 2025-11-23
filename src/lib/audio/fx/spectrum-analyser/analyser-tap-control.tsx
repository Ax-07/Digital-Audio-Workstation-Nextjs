// src/lib/audio/effects/analyser-tap/analyser-tap-control.tsx
"use client";
import * as React from "react";
import type { GenericControlProps } from "@/lib/audio/effects/control-components";
import { MiniAnalyserAbletonProView } from "./mini-analyser-ableton-view";

export function AnalyserTapControls({ analyser }: GenericControlProps) {
  return (
    <div className="p-1">
      <MiniAnalyserAbletonProView
        attachTo={analyser} // node à “taper”
        mode="wave+spec"
        specStyle="line"
        stereoMode="LR"
        fftSize={8192}
        smoothing={0.065}
        minDb={-90}
        maxDb={0}
        tiltDbPerOct={-3.0}
        calibrationDb={-18}
        ignoreBelowHz={28}
        octaveSmoothing={0.05}
        lineOversample={1.3}
        postSmoothPx={1.2}
      />
    </div>
  );
}
