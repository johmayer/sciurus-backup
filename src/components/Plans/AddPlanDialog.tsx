"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createPlan, updatePlan, getSources, getRemotes, checkPlanRemoteData, purgePlanRemoteData, runPlanNow } from "@/app/actions";
import { Loader2, AlertTriangle } from "lucide-react";
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
  const [showWipeDialog, setShowWipeDialog] = useState(false);

  useEffect(() => {
    if (open) {
      getSources().then(setSources).catch(console.error);
      getRemotes().then(setRemotes).catch(console.error);
    }
  }, [open]);

  useEffect(() => {
    if (open && editItem) {
      setName(editItem.name);
      setSource(editItem.sourceId);
      setRemote(editItem.remoteId);
      setSchedule(editItem.schedule || "");
      setEncrypt(editItem.encrypt);
      setEnabled(editItem.enabled);
      setPassword(""); // For security, we don't return the decrypted password to the client unless requested differently.
      setRemoteFolderPath(editItem.remoteFolderPath || "");
      setBackupPrefix(editItem.backupPrefix || "backup");
      setSaveError("");
      setShowWipeDialog(false);
    } else if (open) {
      setName("");
      setSource("");
      setRemote("");
      setSchedule("0 * * * *");
      setEncrypt(true);
      setEnabled(true);
      setPassword("");
      setRemoteFolderPath("");
      setBackupPrefix("backup");
      setSaveError("");
      setShowWipeDialog(false);
    }
  }, [open, editItem]);

  const handleSave = async (forceWipe = false, runAfterWipe = false) => {
    setSaveError("");
    if (encrypt && !password.trim() && (!editItem || password !== "")) {
      // Allow empty password ONLY on edit (means keep same password)
      // Actually we check if encrypt && !password.trim().
      if (!editItem) {
        setSaveError("A password is required when encryption is enabled.");
        return;
      }
    }
    
    // Check if encryption changed
    if (editItem && editItem.encrypt !== encrypt && !forceWipe) {
      setSaving(true);
      try {
        const { hasData } = await checkPlanRemoteData(editItem.id);
        if (hasData) {
          setShowWipeDialog(true);
          setSaving(false);
          return;
        }
      } catch (err: any) {
        setSaveError("Failed to verify remote data: " + (err.message || String(err)));
        setSaving(false);
        return;
      }
    }

    setSaving(true);
    try {
      if (forceWipe && editItem) {
        await purgePlanRemoteData(editItem.id);
      }

      if (editItem) {
        await updatePlan(editItem.id, {
          name,
          sourceId: source,
          remoteId: remote,
          schedule,
          encrypt,
          password: password.trim() ? password : undefined, // Send undefined if empty to keep old password
          enabled,
          remoteFolderPath,
          backupPrefix
        });
        if (runAfterWipe) {
          await runPlanNow(editItem.id);
        }
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
      setShowWipeDialog(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        {showWipeDialog ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Data Deletion Required
              </DialogTitle>
              <DialogDescription>
                You are changing the encryption state of this plan. Existing backup data on the remote must be deleted before this change can take effect, otherwise the new backup format will conflict with the old files.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm font-medium">Please choose how to proceed:</p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" disabled={saving} onClick={() => setShowWipeDialog(false)}>Cancel</Button>
              <Button variant="destructive" disabled={saving} onClick={() => handleSave(true, false)}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Remote Data & Save
              </Button>
              <Button variant="default" disabled={saving} onClick={() => handleSave(true, true)}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete & Start New Backup
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
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
                <div className="flex flex-col gap-1.5">
                  <Input id="remoteFolderPath" value={remoteFolderPath} onChange={(e) => setRemoteFolderPath(e.target.value)} placeholder="(Optional) folder/path" />
                  <span className="text-[10px] text-muted-foreground">Directory to store this backup within the remote.</span>
                </div>
              </div>

              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="backupPrefix" className="text-right">Folder Prefix</Label>
                <div className="flex flex-col gap-1.5">
                  <Input id="backupPrefix" value={backupPrefix} onChange={(e) => setBackupPrefix(e.target.value)} placeholder="backup" />
                  <span className="text-[10px] text-muted-foreground">Folder naming prefix (e.g., &quot;backup&quot; creates `backup_&lt;planId&gt;`).</span>
                </div>
              </div>
              
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="schedule" className="text-right">Cron Schedule</Label>
                <Input id="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 * * * *" className="font-mono" />
              </div>
              
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="enabled" className="text-right">Enabled</Label>
                <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
              
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="encrypt" className="text-right">Encrypt Data</Label>
                <Switch id="encrypt" checked={encrypt} onCheckedChange={setEncrypt} />
              </div>
              
              {encrypt && (
                <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                  <Label htmlFor="password" className="text-right">Encryption Key</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter secure password" />
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => handleSave(false, false)} disabled={!name || !source || !remote || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editItem ? "Update Plan" : "Save Plan"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
