"use client";

import { memo } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";

const data = {
  tree: [
    [
      "Instruments",
        ["Sampler", ["1", "2"]],
        ["Synth", ["1", "2"]],
        ["Drum Rack", ["1", "2"]],
    ],
    [
      "Audio Effects",
        ["EQ", ["1", "2"]],
        ["Compressor", ["1", "2"]],
        ["Delay", ["1", "2"]],
        ["Reverb", ["1", "2"]],
    ],
    [
      "Samples",
      [
        "Drums",
        
          ["Kick.wav", ["1", "2"]],
          ["Snare.wav", ["1", "2"]],
          ["Hat.wav", ["1", "2"]],
        
      ],
    ],
  ],
};
const BrowserComponent = () => {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Files</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {data.tree.map((item, index) => (
            <Tree key={index} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export const Browser = memo(BrowserComponent);

type TreeItem = string | TreeItem[];
function Tree({ item }: { item: TreeItem }) {
  const [name, ...items] = Array.isArray(item) ? item : [item];
  if (!items.length) {
    return (
      <SidebarMenuButton isActive={name === "button.tsx"} className="data-[active=true]:bg-transparent">
        <File />
        {name}
      </SidebarMenuButton>
    );
  }
  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        // defaultOpen={name === "components" || name === "ui"}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder />
            {name}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((subItem, index) => (
              <Tree key={index} item={subItem} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
