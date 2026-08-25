"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSource, updateSource, listDirectories } from "@/app/actions";
import { Folder, FolderOpen, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Source } from "@prisma/client";

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Source | null;
}

export default function AddSourceDialog({ open, onOpenChange, editItem }: AddSourceDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("/");
  
  const [directories, setDirectories] = useState<{name: string, path: string}[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(false);
  const [dirError, setDirError] = useState("");

  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDirectories = async (targetPath: string) => {
    setLoadingDirs(true);
    setDirError("");
    setSaveError("");
    try {
      const res = await listDirectories(targetPath);
      if (res.success && res.directories) {
        setDirectories(res.directories);
        setPath(res.currentPath || targetPath);
      } else {
        setDirError(res.error || "Failed to load directory");
        // Fallback to loading root tree so they can browse, but preserve their path input
        const rootRes = await listDirectories("/");
        if (rootRes.success && rootRes.directories) {
          setDirectories(rootRes.directories);
        }
      }
    } catch (err) {
      setDirError("An unexpected error occurred.");
    } finally {
      setLoadingDirs(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSaveError("");
      if (editItem) {
        setName(editItem.name);
        setPath(editItem.path);
        // eslint-disable-next-line
        loadDirectories(editItem.path);
      } else {
        setName("");
        setPath("/");
        // eslint-disable-next-line
        loadDirectories("/");
      }
    }
  }, [open, editItem]);

  const handleSave = async () => {
    setSaveError("");
    try {
      setSaving(true);
      if (editItem) {
        await updateSource(editItem.id, { name, path });
      } else {
        await createSource({ name, path });
      }
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save source", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save source. Check if the path exists.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editItem ? "Edit Source" : "Add Local Source"}</DialogTitle>
          <DialogDescription>
            {editItem ? "Modify your local backup source." : "Specify a local directory path on the server that you want to back up."}
          </DialogDescription>
        </DialogHeader>
        
        {saveError && (
          <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
            {saveError}
          </div>
        )}
        
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Source Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Docker Volumes" />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="path">Selected Path</Label>
            <div className="flex gap-2">
              <Input 
                id="path" 
                value={path} 
                onChange={(e) => setPath(e.target.value)} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    loadDirectories(path);
                  }
                }}
                placeholder="/var/lib/docker/volumes" 
              />
              <Button variant="secondary" onClick={() => loadDirectories(path)}>
                Go
              </Button>
            </div>
          </div>

          <div className="border rounded-md">
            <div className="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground border-b flex items-center justify-between">
              <span>File Browser</span>
              {loadingDirs && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            
            {dirError && (
              <div className="px-3 py-2 text-xs text-destructive border-b bg-destructive/10">
                {dirError} (Showing root directory instead)
              </div>
            )}
            
            <ScrollArea className="h-[250px] p-2">
              <div className="flex flex-col gap-1">
                {directories.map((dir, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => loadDirectories(dir.path)}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent hover:text-accent-foreground rounded-sm text-sm text-left w-full transition-colors"
                  >
                    {dir.name === '..' ? (
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Folder className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{dir.name}</span>
                  </button>
                ))}
                {directories.length === 0 && !loadingDirs && (
                  <div className="text-sm text-muted-foreground p-4 text-center">
                    No subdirectories found.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name || !path || saving}>
            {saving ? "Saving..." : (editItem ? "Update Source" : "Save Source")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
