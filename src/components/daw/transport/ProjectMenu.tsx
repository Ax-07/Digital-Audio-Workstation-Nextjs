"use client";

import { memo, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { clearProject, loadProject } from "@/lib/stores/persistence.store";
import { useProjectStore } from "@/lib/stores/project.store";

const ProjectMenuComponent = () => {
  const setProject = useProjectStore((s) => s.setProject);
  const project = useProjectStore((s) => s.project);

  const onExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const onImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setProject(json);
    } catch (e) {
      console.error("Invalid project JSON", e);
    }
  }, [setProject]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="border-neutral-700 text-neutral-200 hover:bg-neutral-800">Projet</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-neutral-900 text-neutral-100">
          <DropdownMenuItem onClick={onExport}>Exporter (JSON)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>Importer…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={async () => { try { const saved = await loadProject(); if (saved) setProject(saved); } catch (e) { console.error(e); } }}>Charger</DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setConfirmReset(true); }}>Réinitialiser…</DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-neutral-900 text-neutral-100">
              <AlertDialogHeader>
                <AlertDialogTitle>Réinitialiser le projet ?</AlertDialogTitle>
                <AlertDialogDescription>Cette action efface l’état courant et charge un projet vide par défaut.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await clearProject();
                      setProject({ bpm: 120, tracks: [{ id: "track1", type: "AudioTrack", name: "Track 1", gainDb: -6, pan: 0 }] });
                    } catch (e) { console.error(e); }
                  }}
                >
                  Confirmer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = ""; }}
      />
    </>
  );
};

export const ProjectMenu = memo(ProjectMenuComponent);
