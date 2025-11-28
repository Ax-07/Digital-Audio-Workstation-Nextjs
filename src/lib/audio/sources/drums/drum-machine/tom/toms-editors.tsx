// toms-editors.tsx
"use client";

import type { ComponentProps } from "react";
import { TomEditorModule } from "./tom-editor";

type BaseProps = Omit<ComponentProps<typeof TomEditorModule>, "label" | "style" | "instrument">;

export function LowTomEditorModule(props: BaseProps) {
  return (
    <TomEditorModule
      {...props}
      label="Low Tom"
      style="low"
      instrument="tomLow"
    />
  );
}

export function MidTomEditorModule(props: BaseProps) {
  return (
    <TomEditorModule
      {...props}
      label="Mid Tom"
      style="mid"
      instrument="tomMid"
    />
  );
}

export function HighTomEditorModule(props: BaseProps) {
  return (
    <TomEditorModule
      {...props}
      label="High Tom"
      style="high"
      instrument="tomHigh"
    />
  );
}

export function FloorTomEditorModule(props: BaseProps) {
  return (
    <TomEditorModule
      {...props}
      label="Floor Tom"
      style="floor"
      instrument="tomFloor"
    />
  );
}
