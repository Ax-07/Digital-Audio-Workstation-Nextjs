"use client";

import { memo, useMemo } from "react";

const rows = 8;
const cols = 32; // bars grid

const ArrangementViewComponent = () => {
  const grid = useMemo(() => Array.from({ length: rows }, (_, r) => r), []);
  const bars = useMemo(() => Array.from({ length: cols }, (_, c) => c), []);
  return (
    <div className="min-h-[260px] w-full overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
      <div className="grid min-w-[800px] grid-cols-[120px_1fr]">
        {/* Track headers */}
        <div className="col-start-1 row-start-1 flex flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-neutral-950">
          {grid.map((r) => (
            <div key={r} className="h-8 border-b border-zinc-200 px-2 text-xs leading-8 dark:border-zinc-800">Track {r + 1}</div>
          ))}
        </div>
        {/* Timeline grid */}
        <div className="col-start-2 row-start-1">
          <div className="grid" style={{ gridTemplateRows: `repeat(${rows}, 2rem)`, gridTemplateColumns: `repeat(${cols}, 2rem)` }}>
            {grid.map((r) =>
              bars.map((c) => (
                <div key={`${r}-${c}`} className={`h-8 w-8 border-b border-r ${c % 4 === 0 ? "border-zinc-300" : "border-zinc-200"} dark:${c % 4 === 0 ? "border-zinc-700" : "border-zinc-800"}`}></div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ArrangementView = memo(ArrangementViewComponent);
