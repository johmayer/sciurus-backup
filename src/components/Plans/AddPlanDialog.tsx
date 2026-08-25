"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createPlan, updatePlan, getSources, getRemotes } from "@/app/actions";
import { Loader2 } from "lucide-react";

import { Plan, Source, Remote } from "@prisma/client";

interface AddPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Plan | null;
  sources?: Source[];
  remotes?: Remote[];
}

export default function AddPlanDialog({ open, onOpenChange, editItem }: AddPlanDialogProps) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [remote, setRemote] = useState("");
  const [remoteFolderPath, setRemoteFolderPath] = useState("");
  const [backupPrefix, setBackupPrefix] = useState("backup");
  const [schedule, setSchedule] = useState("0 * * * *"); // Default to hourly
  const [encrypt, setEncrypt] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [password, setPassword] = useState("");

  const [sources, setSources] = useState<Source[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      getSources().then(setSources).catch(console.error);
      getRemotes().then(setRemotes).catch(console.error);
    }
  }, [open]);

  useEffect(() => {
    if (open) setSaveError("");
    if (open && editItem) {
      setName(editItem.name);
      setSource(editItem.sourceId);
      setRemote(editItem.remoteId);
      setSchedule(editItem.schedule);
      setRemoteFolderPath(editItem.remoteFolderPath || "");
      setBackupPrefix(editItem.backupPrefix || "backup");
      setEncrypt(editItem.encrypt);
      setEnabled(editItem.enabled !== false);
      setPassword(editItem.password || "");
    } else if (open && !editItem) {
      setName(""); setSource(""); setRemote(""); setSchedule("0 * * * *"); setEncrypt(true); setPassword(""); setEnabled(true); setRemoteFolderPath(""); setBackupPrefix("backup");
    }
  }, [open, editItem]);

  const handleSave = async () => {
    setSaveError("");
    if (encrypt && !password.trim()) {
      setSaveError("A password is required when encryption is enabled.");
      return;
    }
    setSaving(true);
    try {
      if (editItem) {
        await updatePlan(editItem.id, {
          name,
          sourceId: source,
          remoteId: remote,
          schedule,
          encrypt,
          password: encrypt ? password : "",
          enabled,
          remoteFolderPath,
          backupPrefix
        });
      } else {
        await createPlan({
          name,
          sourceId: source,
          remoteId: remote,
          schedule,
          encrypt,
          password: encrypt ? password : "",
          enabled,
          remoteFolderPath,
          backupPrefix,
          status: "Active"
        });
      }
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save plan", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{editItem ? "Edit Backup Plan" : "Create Backup Plan"}</DialogTitle>
          <DialogDescription>
            {editItem ? "Modify your automated backup schedule." : "Schedule a recurring backup from a local folder to a remote."}
          </DialogDescription>
        </DialogHeader>
        
        {saveError && (
          <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
            {saveError}
          </div>
        )}
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <Label htmlFor="name" className="text-right">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="" placeholder="Daily Documents Backup" />
          </div>
          
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <Label className="text-right">Source</Label>
            <div className="">
              <Select value={source} onValueChange={(v) => setSource(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a source..." />
                </SelectTrigger>
                <SelectContent>
                  {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.path})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <Label className="text-right">Remote</Label>
            <div className="">
              <Select value={remote} onValueChange={(v) => setRemote(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a remote..." />
                </SelectTrigger>
                <SelectContent>
                  {remotes.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <Label htmlFor="remoteFolderPath" className="text-right">Remote Folder</Label>
            <Input id="remoteFolderPath" value={remoteFolderPath} onChange={(e) => setRemoteFolderPath(e.target.value)} className="" placeholder="Leave blank for root (e.g. /my-backups)" />
          </div>

          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <Label htmlFor="backupPrefix" className="text-right">Backup Prefix</Label>
            <Input id="backupPrefix" value={backupPrefix} onChange={(e) => setBackupPrefix(e.target.value)} className="" placeholder="backup" />
          </div>

          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <Label htmlFor="schedule" className="text-right">Schedule (Cron)</Label>
            <div className="flex flex-col gap-1">
              <Input id="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 * * * *" />
              <span className="text-xs text-muted-foreground">e.g. 0 * * * * (hourly), 0 0 * * * (daily at midnight)</span>
            </div>
          </div>

          <div className="grid grid-cols-[130px_1fr] items-center gap-4 border-t pt-4 mt-2">
            <Label className="text-right text-sm">
              <span>Encrypt</span>
            </Label>
            <div className="flex items-center space-x-2">
              <Switch checked={encrypt} onCheckedChange={setEncrypt} />
              <Label className="text-sm font-normal text-muted-foreground">Wrap remote in `rclone crypt` natively using AES-256</Label>
            </div>
          </div>
          
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <Label className="text-right text-sm">
              Enabled
            </Label>
            <div className="flex items-center space-x-2">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <Label className="text-sm font-normal text-muted-foreground">Toggle to enable or disable the scheduled cron job</Label>
            </div>
          </div>

          {encrypt && (
            <div className="grid grid-cols-[130px_1fr] items-center gap-4">
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter secure password" />
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name || !source || !remote || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editItem ? "Update Plan" : "Save Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
