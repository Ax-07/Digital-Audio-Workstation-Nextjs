"use client"

import * as React from "react"
// import { Search } from "lucide-react"

// import { NavFavorites } from "@/components/nav-favorites"
// import { NavMain } from "@/components/nav-main"
// import { NavSecondary } from "@/components/nav-secondary"
// import { NavWorkspaces } from "@/components/nav-workspaces"
// import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Browser } from "@/components/views/Browser"

// Template data removed; DAW Browser provides actual content

export function SidebarLeft({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className="border-r-0 h-fit"{...props}>
      <SidebarHeader className="border-b border-neutral-800/50">
        <div className="text-xs uppercase tracking-widest text-neutral-400">Browser</div>
      </SidebarHeader>
      <SidebarContent className="p-3">
        <Browser />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

