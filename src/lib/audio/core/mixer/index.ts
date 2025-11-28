// src/lib/audio/mixer/index.ts

import { MixerCore } from "./mixer";

export const mixer = {
  ensure: async () => MixerCore.ensure(),
  getSendInput: (target: "A" | "B") => MixerCore.ensure().getReturnInput(target),
};
