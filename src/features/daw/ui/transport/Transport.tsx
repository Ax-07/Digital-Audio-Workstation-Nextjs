"use client";

import { memo, useCallback } from "react";
import { useTransportStore } from "@/features/daw/state/transport.store";
import { TransportBar } from "./TransportBar";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";

const TransportComponent = () => {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const bpm = useTransportStore((s) => s.bpm);
  const setBpm = useTransportStore((s) => s.setBpm);
  const play = useTransportStore((s) => s.play);
  const stop = useTransportStore((s) => s.stop);

  const onToggle = useCallback(() => {
    if (isPlaying) stop();
    else play();
  }, [isPlaying, play, stop]);

  const onBpmChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (e) => {
      const next = Math.max(40, Math.min(240, Number(e.target.value) || 120));
      setBpm(next);
    },
    [setBpm]
  );

  return (
      <div className="flex gap-1">
        <Button
          onClick={onToggle}
          variant={isPlaying ? "destructive" : "default"}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? "Stop" : "Play"}
        </Button>

        <div className="flex items-center gap-2">
          <Label htmlFor="bpm">BPM</Label>
          <Input
            id="bpm"
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={onBpmChange}
            aria-label="Tempo in BPM"
          />
        </div>
        <TransportBar />
      </div>
  );
};

export const Transport = memo(TransportComponent);
