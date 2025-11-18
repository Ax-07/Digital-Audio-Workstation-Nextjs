"use client";

import { SidebarLeft } from "@/components/ui/sidebar-left";
import { SidebarRight } from "@/components/ui/sidebar-right";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getAutomationEngine } from "@/lib/audio/automation/automation-engine";
import { useUiStore } from "@/lib/stores/ui.store";
import { memo, useEffect } from "react";
import { BottomPanel } from "./BottomPanel";
import { SessionView } from "../daw/session/SessionView";
import { ArrangementView } from "../daw/arrangement/ArrangementView";
import { getSessionPlayer } from "@/lib/audio/core/session-player";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { HeaderTransport } from "./HeaderTransport";

const AppShellComponent = () => {
  const viewMode = useUiStore((s) => s.viewMode);

  useEffect(() => {
    // Start automation engine once in client
    const engine = getAutomationEngine();
    engine.start();
    // Start session player subscription to transport launch events
    getSessionPlayer().start();
    return () => engine.stop();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-200">
      {/* Header */}
      <header className="border-b border-neutral-700 bg-neutral-800 px-3">
        <HeaderTransport />
      </header>
      <SidebarProvider>
        <SidebarLeft />
        {/* Ensure the center area doesn't grow beyond available space */}
        <SidebarInset className="min-w-0">
          <header className="bg-background sticky top-0 flex p-2 items-center gap-2 border-b">
            <div className="flex flex-1 items-center gap-2 px-3">
              <SidebarTrigger />
            </div>
          </header>
          {/* Single scroll container for center content to avoid pushing the right sidebar */}
          <div className="flex flex-1 overflow-auto min-w-0">
            {viewMode === "session" ? <SessionView /> : <ArrangementView />}
          </div>
        </SidebarInset>
        <SidebarRight />
      </SidebarProvider>
      {/* Bottom device panel */}
      <Accordion type="single" collapsible defaultValue="item-1" orientation="horizontal" >
        <AccordionItem value="item-1">
          <AccordionTrigger className="flex items-center justify-center bg-neutral-700"/>
          <AccordionContent>
            <footer className="border-t border-neutral-700 bg-neutral-900 p-3">
              <BottomPanel />
            </footer>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export const AppShell = memo(AppShellComponent);
