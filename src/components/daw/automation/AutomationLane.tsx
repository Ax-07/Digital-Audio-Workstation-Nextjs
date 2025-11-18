"use client";
import { memo } from "react";

export type AutomationPoint = { time: number; value: number };
export type AutomationLaneProps = {
  points: ReadonlyArray<AutomationPoint>;
  height?: number;
  onChange?: (next: AutomationPoint[]) => void;
  disabled?: boolean;
};

// Placeholder automation lane: renders an empty background; future will draw curves.
export const AutomationLane = memo(function AutomationLane({ points, height = 56 }: AutomationLaneProps) {
  return (
    <div
      className="relative w-full select-none rounded-sm border border-neutral-700/70 bg-neutral-850"
      style={{ height }}
      aria-label="Automation lane"
    >
      {/* Future: SVG path or Canvas curve based on points */}
      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-500">
        Automation (coming soon) – {points.length} pts
      </div>
    </div>
  );
});
