"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRemote, updateRemote, verifyRemoteConfig } from "@/app/actions";
import { AlertCircle, Loader2 } from "lucide-react";

import { Remote } from "@prisma/client";

interface AddRemoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Remote | null;
}

export default function AddRemoteDialog({ open, onOpenChange, editItem }: AddRemoteDialogProps) {
  const [type, setType] = useState("");
  const [name, setName] = useState("");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState(""); 

  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && editItem) {
      setName(editItem.name);
      setType(editItem.type);
      try {
        const conf = JSON.parse(editItem.config || "{}");
        setClientId(conf.client_id || "");
        setClientSecret(conf.client_secret || "");
        setToken(conf.token || "");
        setHost(conf.host || conf.url || "");
        setUser(conf.user || "");
        setPassword(""); // Leave blank to avoid showing obscured password
      } catch (e) {}
    } else if (open && !editItem) {
      setName(""); setType(""); setClientId(""); setClientSecret(""); setToken(""); setHost(""); setUser(""); setPassword("");
    }
    setError("");
  }, [open, editItem]);

  const isOAuthType = type === "drive" || type === "onedrive";
  const isBasicAuthType = type === "sftp" || type === "webdav";

  const handleSave = async () => {
    setError("");
    setLoading(true);
    
    try {
      let finalPassword = password;
      if (editItem && isBasicAuthType && !password) {
        try {
          const conf = JSON.parse(editItem.config || "{}");
          finalPassword = conf.pass || "";
        } catch(e) {}
      }
      
      const configPayload = (isOAuthType 
        ? { client_id: clientId, client_secret: clientSecret, token } 
        : { host, url: host, user, pass: finalPassword }) as Record<string, string>;
      
      const verifyResult = await verifyRemoteConfig(type, configPayload);
      if (!verifyResult.success) {
        setError("Verification Failed: " + verifyResult.error);
        setLoading(false);
        return;
      }
      
      if (editItem) {
        await updateRemote(editItem.id, {
          name,
          type,
          config: JSON.stringify(configPayload)
        });
      } else {
        await createRemote({
          name,
          type,
          config: JSON.stringify(configPayload)
        });
      }
      
      onOpenChange(false);
    } catch (err: unknown) {
      console.error("Failed to save remote", err);
      setError("An unexpected error occurred saving the remote.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{editItem ? "Edit Remote" : "Add Remote"}</DialogTitle>
          <DialogDescription>
            {editItem ? "Modify your existing remote." : "Configure a new storage remote."} Sciurus will automatically verify the connection.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Remote Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MyGoogleDrive" />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="type">Provider Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as string)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drive">Google Drive</SelectItem>
                <SelectItem value="onedrive">Microsoft OneDrive</SelectItem>
                <SelectItem value="sftp">SFTP</SelectItem>
                <SelectItem value="webdav">WebDAV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isOAuthType && (
            <div className="space-y-4 border-t pt-4">
              <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground flex gap-3 items-start">
                <AlertCircle className="h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-2">
                  <p>Because Sciurus runs headlessly on a server, you must generate the OAuth token on your personal computer:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Install <code>rclone</code> on your personal computer.</li>
                    <li>Run <code>rclone authorize "{type}"</code> in your terminal.</li>
                    <li>Follow the browser prompts, then paste the resulting JSON token below.</li>
                  </ol>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="clientId">Client ID (Optional)</Label>
                  <Input id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Custom Client ID" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="clientSecret">Client Secret (Optional)</Label>
                  <Input id="clientSecret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Custom Secret" />
                </div>
              </div>
              
              <div className="grid gap-2">
                <Label>Rclone Token (Required)</Label>
                <Input placeholder='{"access_token":"...","token_type":"Bearer",...}' value={token} onChange={(e) => setToken(e.target.value)} />
              </div>
            </div>
          )}

          {isBasicAuthType && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-2">
                <Label htmlFor="host">{type === "webdav" ? "URL" : "Host"}</Label>
                <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder={type === "webdav" ? "https://nextcloud.example.com/remote.php/webdav/" : "sftp.example.com"} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="user">Username</Label>
                  <Input id="user" value={user} onChange={(e) => setUser(e.target.value)} placeholder="admin" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pass">Password</Label>
                  <Input id="pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editItem ? "(Leave blank to keep unchanged)" : "••••••••"} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name || !type || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Verifying..." : "Verify & Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
