// src/components/daw/controls/pianoroll/NoteContextMenu.tsx
"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type NoteContextMenuProps = {
  children: React.ReactNode;
  hasSelection: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onTranspose: (semitones: number) => void;
  onQuantize: (grid: 4 | 8 | 16 | 32) => void;
  onSetVelocity: (value: number) => void;
};

export function NoteContextMenu({
  children,
  hasSelection,
  onDelete,
  onDuplicate,
  onTranspose,
  onQuantize,
  onSetVelocity,
}: NoteContextMenuProps) {
  if (!hasSelection) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onDuplicate}>
          Duplicate <span className="ml-auto text-xs text-neutral-500">Ctrl+D</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete}>
          Delete <span className="ml-auto text-xs text-neutral-500">Del</span>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuSub>
          <ContextMenuSubTrigger>Transpose</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            <ContextMenuItem onClick={() => onTranspose(12)}>
              +1 Octave <span className="ml-auto text-xs text-neutral-500">Shift+↑</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onTranspose(1)}>
              +1 Semitone <span className="ml-auto text-xs text-neutral-500">↑</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onTranspose(-1)}>
              -1 Semitone <span className="ml-auto text-xs text-neutral-500">↓</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onTranspose(-12)}>
              -1 Octave <span className="ml-auto text-xs text-neutral-500">Shift+↓</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Quantize</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-32">
            <ContextMenuItem onClick={() => onQuantize(4)}>1/4</ContextMenuItem>
            <ContextMenuItem onClick={() => onQuantize(8)}>1/8</ContextMenuItem>
            <ContextMenuItem onClick={() => onQuantize(16)}>1/16</ContextMenuItem>
            <ContextMenuItem onClick={() => onQuantize(32)}>1/32</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Set Velocity</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-32">
            <ContextMenuItem onClick={() => onSetVelocity(1.0)}>100%</ContextMenuItem>
            <ContextMenuItem onClick={() => onSetVelocity(0.8)}>80%</ContextMenuItem>
            <ContextMenuItem onClick={() => onSetVelocity(0.6)}>60%</ContextMenuItem>
            <ContextMenuItem onClick={() => onSetVelocity(0.4)}>40%</ContextMenuItem>
            <ContextMenuItem onClick={() => onSetVelocity(0.2)}>20%</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
