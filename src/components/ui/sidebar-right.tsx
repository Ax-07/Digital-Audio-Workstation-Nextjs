import * as React from "react"
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar"
import { ReturnStrip } from "@/components/daw/ReturnStrip"
import { useState } from "react"
import { runReconcileSmokeTests } from "@/lib/audio/core/reconcile-tests"

export function SidebarRight({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const [testResults, setTestResults] = useState<null | { name: string; pass: boolean; details?: string }[]>(null)
  return (
    <Sidebar side="right" collapsible="none" className="hidden h-svh border-l lg:flex shrink-0" {...props}>
      <SidebarHeader className="border-b border-neutral-800/50">
        <div className="text-xs uppercase tracking-widest text-neutral-400">Returns</div>
      </SidebarHeader>
      <SidebarContent className="p-3">
        <div className="flex flex-col gap-3">
          <ReturnStrip target="A" />
          <ReturnStrip target="B" />
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-2 flex flex-col gap-2 rounded-sm border border-neutral-700 bg-neutral-800 p-2 text-xs text-neutral-300">
              <div className="flex items-center justify-between">
                <span className="font-medium">Reconcile tests</span>
                <button onClick={() => setTestResults(runReconcileSmokeTests())} className="rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700">Run</button>
              </div>
              {testResults && (
                <ul className="list-disc space-y-1 pl-4">
                  {testResults.map((r, i) => (
                    <li key={i} className={r.pass ? "text-emerald-600" : "text-rose-500"}>
                      {r.pass ? "PASS" : "FAIL"} — {r.name}
                      {r.details ? <span className="opacity-70"> — {r.details}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  )
}
