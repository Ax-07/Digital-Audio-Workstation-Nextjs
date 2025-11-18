"use client";

import { memo } from "react";
// import { MasterVu } from "@/components/daw/MasterVu";
// import { useProjectStore } from "@/lib/stores/project";
import { useUiStore } from "@/lib/stores/ui.store";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { TransportBar } from "./TransportBar";
import { Transport } from "../daw/transport/Transport";
import { ProjectMenu } from "../daw/transport/ProjectMenu";

const HeaderTransportComponent = () => {
  // const project = useProjectStore((s) => s.project);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);

  return (
    <div className="flex h-full items-center justify-between py-2">
      {/* Left: transport controls */}
      <div className="flex items-center gap-2">
        <Transport />
      </div>

      {/* Right: view toggle, project actions */}
      <div className="flex items-center gap-3">
        {/* View mode tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "session" | "arrangement")}>
          <TabsList className="bg-neutral-900">
            <TabsTrigger value="session" className="data-[state=active]:bg-amber-400 data-[state=active]:text-black">Session</TabsTrigger>
            <TabsTrigger value="arrangement" className="data-[state=active]:bg-amber-400 data-[state=active]:text-black">Arrangement</TabsTrigger>
          </TabsList>
        </Tabs>
        <ProjectMenu />
      </div>
    </div>
  );
};

export const HeaderTransport = memo(HeaderTransportComponent);
