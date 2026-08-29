"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createPlan, updatePlan, getSources, getRemotes, checkPlanRemoteData, purgePlanRemoteData, runPlanNow } from "@/api";
import { Loader2, AlertTriangle, Eye, EyeOff } from "lucide-react";
type Plan = any; type Source = any; type Remote = any; type Prisma = any;

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
  const [scheduleMode, setScheduleMode] = useState("hourly");
  const [scheduleTime, setScheduleTime] = useState("03:00");
  const [scheduleDay, setScheduleDay] = useState("0");
  
  useEffect(() => {
    if (scheduleMode === "custom") return;
    const [h, m] = scheduleTime.split(":");
    let min = m || "0";
    let hour = h || "0";
    if (min.startsWith("0") && min.length == 2) min = min.substring(1);
    if (hour.startsWith("0") && hour.length == 2) hour = hour.substring(1);
    
    if (scheduleMode === "hourly") {
      setSchedule(`${min} * * * *`);
    } else if (scheduleMode === "daily") {
      setSchedule(`${min} ${hour} * * *`);
    } else if (scheduleMode === "weekly") {
      setSchedule(`${min} ${hour} * * ${scheduleDay}`);
    }
  }, [scheduleMode, scheduleTime, scheduleDay]);
  const [encrypt, setEncrypt] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      const parts = (editItem.schedule || "").split(" ");
      if (parts.length === 5) {
          const [min, hour, dom, mon, dow] = parts;
          const pad = (n: string) => n.length === 1 ? `0${n}` : n;
          if (dom === "*" && mon === "*") {
              if (dow === "*" && hour === "*") {
                  setScheduleMode("hourly");
                  setScheduleTime(`00:${pad(min)}`);
              } else if (dow === "*" && hour !== "*") {
                  setScheduleMode("daily");
                  setScheduleTime(`${pad(hour)}:${pad(min)}`);
              } else if (dow !== "*" && hour !== "*") {
                  setScheduleMode("weekly");
                  setScheduleTime(`${pad(hour)}:${pad(min)}`);
                  setScheduleDay(dow);
              } else {
                  setScheduleMode("custom");
              }
          } else {
              setScheduleMode("custom");
          }
      } else {
          setScheduleMode("custom");
      }
      setEncrypt(editItem.encrypt);
      setEnabled(editItem.enabled);
      setPassword(""); // For security, we don't return the decrypted password to the client unless requested differently.
      setConfirmPassword("");
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
      setConfirmPassword("");
      setRemoteFolderPath("");
      setBackupPrefix("backup");
      setSaveError("");
      setShowWipeDialog(false);
    }
  }, [open, editItem]);

  const handleSave = async (forceWipe = false, runAfterWipe = false) => {
    setSaveError("");
    if (encrypt && !password.trim() && !editItem) {
      setSaveError("A password is required when encryption is enabled.");
      return;
    }
    
    if (encrypt && password !== confirmPassword && (password !== "" || !editItem)) {
      setSaveError("Passwords do not match.");
      return;
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
                <Input id="name" value={name} onChange={(e: any) => setName(e.target.value)} className="" placeholder="Daily Documents Backup" />
              </div>
              
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label className="text-right">Source</Label>
                <div className="">
                  <Select value={source} onValueChange={(v: any) => setSource(v as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a source...">{source ? (sources.find(s => s.id === source)?.name || source) : undefined}</SelectValue>
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
                  <Select value={remote} onValueChange={(v: any) => setRemote(v as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a remote...">{remote ? (remotes.find(r => r.id === remote)?.name || remote) : undefined}</SelectValue>
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
                  <Input id="remoteFolderPath" value={remoteFolderPath} onChange={(e: any) => setRemoteFolderPath(e.target.value)} placeholder="(Optional) folder/path" />
                  <span className="text-[10px] text-muted-foreground">Directory to store this backup within the remote.</span>
                </div>
              </div>

              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="backupPrefix" className="text-right">Folder Prefix</Label>
                <div className="flex flex-col gap-1.5">
                  <Input id="backupPrefix" value={backupPrefix} onChange={(e: any) => setBackupPrefix(e.target.value)} placeholder="backup" />
                  <span className="text-[10px] text-muted-foreground">Folder naming prefix (e.g., &quot;backup&quot; creates `backup_&lt;planId&gt;`).</span>
                </div>
              </div>
              
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="scheduleMode" className="text-right">Schedule</Label>
                <div className="flex gap-2 items-center flex-wrap">
                  <Select value={scheduleMode} onValueChange={(v: any) => setScheduleMode(v)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Every Hour</SelectItem>
                      <SelectItem value="daily">Every Day</SelectItem>
                      <SelectItem value="weekly">Every Week</SelectItem>
                      <SelectItem value="custom">Custom Cron</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {scheduleMode === "weekly" && (
                      <Select value={scheduleDay} onValueChange={(v: any) => setScheduleDay(v)}>
                          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="0">Sunday</SelectItem>
                              <SelectItem value="1">Monday</SelectItem>
                              <SelectItem value="2">Tuesday</SelectItem>
                              <SelectItem value="3">Wednesday</SelectItem>
                              <SelectItem value="4">Thursday</SelectItem>
                              <SelectItem value="5">Friday</SelectItem>
                              <SelectItem value="6">Saturday</SelectItem>
                          </SelectContent>
                      </Select>
                  )}
                  
                  {scheduleMode !== "custom" && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{scheduleMode === "hourly" ? "at min" : "at"}</span>
                        <Input 
                            type="time" 
                            value={scheduleTime} 
                            onChange={(e: any) => setScheduleTime(e.target.value)}
                            className="w-auto"
                        />
                    </div>
                  )}
                </div>
              </div>

              {scheduleMode === "custom" ? (
                  <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                    <Label htmlFor="schedule" className="text-right">Cron Schedule</Label>
                    <Input id="schedule" value={schedule} onChange={(e: any) => setSchedule(e.target.value)} placeholder="0 * * * *" className="font-mono" />
                  </div>
              ) : (
                  <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                    <div />
                    <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded-md border inline-flex max-w-fit">Generated: {schedule}</div>
                  </div>
              )}
              
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="enabled" className="text-right">Enabled</Label>
                <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
              
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <Label htmlFor="encrypt" className="text-right">Encrypt Data</Label>
                <Switch id="encrypt" checked={encrypt} onCheckedChange={setEncrypt} />
              </div>
              
              {encrypt && (
                <>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                    <Label htmlFor="password" className="text-right">Encryption Key</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder={editItem ? "Leave empty to keep unchanged" : "Enter secure password"} className="pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                    <Label htmlFor="confirmPassword" className="text-right">Confirm Key</Label>
                    <div className="relative">
                      <Input id="confirmPassword" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e: any) => setConfirmPassword(e.target.value)} placeholder={editItem ? "Leave empty to keep unchanged" : "Confirm secure password"} className="pr-10" />
                    </div>
                  </div>
                </>
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
