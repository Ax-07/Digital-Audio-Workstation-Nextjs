import * as React from "react";
import type { EffectKind, AnyEffectParams } from "./types";
import { AnalyserTapControls } from "./spectrum-analyser/analyser-tap-control";
import { DelayControls } from "./delay/delay-control";
import { AutoFilterControls } from "./auto-filter/auto-filter-control";
import { ChorusControls } from "./chorus/chorus-control";
import { CompressorControls } from "./compressor/compressor-control";
import { DistortionControls } from "./distortion/distortion-control";
import { Eq3Controls } from "./eq3/eq3-control";
import { LimiterControls } from "./limiter/limiter-control";
import { ReverbControls } from "./reverb/reverb-control";
import { StereoWidenerControls } from "./stereo-widener/stereo-widener-control";
import { TremoloControls } from "./tremolo/tremolo-control";

export type GenericControlProps = { 
  index:number; 
  update:(i:number,p:Record<string,unknown>)=>void; 
  initial?: AnyEffectParams;
  analyser?: AnalyserNode | null;
};

export const CONTROL_COMPONENTS: Record<EffectKind, React.ComponentType<GenericControlProps>> = {
  "delay": DelayControls as React.ComponentType<GenericControlProps>,
  "reverb": ReverbControls as React.ComponentType<GenericControlProps>,
  "eq3": Eq3Controls as React.ComponentType<GenericControlProps>,
  "compressor": CompressorControls as React.ComponentType<GenericControlProps>,
  "tremolo": TremoloControls as React.ComponentType<GenericControlProps>,
  "limiter": LimiterControls as React.ComponentType<GenericControlProps>,
  "distortion": DistortionControls as React.ComponentType<GenericControlProps>,
  "auto-filter": AutoFilterControls as React.ComponentType<GenericControlProps>,
  "chorus": ChorusControls as React.ComponentType<GenericControlProps>,
  "stereo-widener": StereoWidenerControls as React.ComponentType<GenericControlProps>,
  "analyser-tap": AnalyserTapControls as React.ComponentType<GenericControlProps>,
};
