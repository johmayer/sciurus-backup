import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
type Plan = any; type BackupLog = any; type Source = any; type Remote = any;
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Edit, Trash2 } from "lucide-react";
import { validateSourcePath, validateRemoteById, markConfigValidated, deleteSource, deleteRemote } from "@/api";
import AddSourceDialog from "@/components/Sources/AddSourceDialog";
import AddRemoteDialog from "@/components/Remotes/AddRemoteDialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export default function ValidateClient() {
  const [initialSources, setInitialSources] = useState<any[]>([]);
  const [initialRemotes, setInitialRemotes] = useState<any[]>([]);
  
  useEffect(() => {
    import("@/api").then(({ getSources, getRemotes }) => {
      Promise.all([getSources(), getRemotes()]).then(([s, r]) => {
        setInitialSources(s);
        setInitialRemotes(r);
      }).catch(console.error);
    });
  }, []);

  const router = useNavigate();
  
  const [sourceStatus, setSourceStatus] = useState<Record<string, {loading: boolean, valid: boolean, error?: string}>>({});
  const [remoteStatus, setRemoteStatus] = useState<Record<string, {loading: boolean, valid: boolean, error?: string}>>({});
  
  const [editSource, setEditSource] = useState<Source | null>(null);
  const [editRemote, setEditRemote] = useState<Remote | null>(null);
  
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);

  const checkSource = async (s: Source) => {
    setSourceStatus(prev => ({...prev, [s.id]: { loading: true, valid: false }}));
    const res = await validateSourcePath(s.path);
    setSourceStatus(prev => ({...prev, [s.id]: { loading: false, valid: res.valid, error: res.error }}));
  };

  const checkRemote = async (r: Remote) => {
    setRemoteStatus(prev => ({...prev, [r.id]: { loading: true, valid: false }}));
    const res = await validateRemoteById(r.id);
    setRemoteStatus(prev => ({...prev, [r.id]: { loading: false, valid: res.valid, error: res.error }}));
  };

  useEffect(() => {
    initialSources.forEach((s: any) => checkSource(s));
    initialRemotes.forEach((r: any) => checkRemote(r));
  }, [initialSources, initialRemotes]);

  const allDone = initialSources.every((s: any) => sourceStatus[s.id]?.valid) && 
                  initialRemotes.every((r: any) => remoteStatus[r.id]?.valid);
                  
  const anyLoading = initialSources.some((s: any) => sourceStatus[s.id]?.loading) || 
                     initialRemotes.some((r: any) => remoteStatus[r.id]?.loading);

  const handleFinish = async () => {
    await markConfigValidated();
    router("/");
  };
  
  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);
  const [deleteRemoteId, setDeleteRemoteId] = useState<string | null>(null);

  const confirmDeleteSource = async () => {
    if (deleteSourceId) {
      await deleteSource(deleteSourceId);
      setDeleteSourceId(null);
      window.location.reload();
    }
  };

  const confirmDeleteRemote = async () => {
    if (deleteRemoteId) {
      await deleteRemote(deleteRemoteId);
      setDeleteRemoteId(null);
      window.location.reload();
    }
  };

  const handleDeleteSource = (id: string) => {
    setDeleteSourceId(id);
  };

  const handleDeleteRemote = (id: string) => {
    setDeleteRemoteId(id);
  };

  // If there are no sources and remotes, auto finish
  useEffect(() => {
    if (initialSources.length === 0 && initialRemotes.length === 0) {
      handleFinish();
    }
  }, [initialSources, initialRemotes]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">Validating Configuration</CardTitle>
        <CardDescription>
          Checking if all imported sources and remotes are accessible.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        
        {initialSources.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-3">Sources</h3>
            <div className="grid gap-3">
              {initialSources.map((s: any) => {
                const stat = sourceStatus[s.id];
                return (
                  <div key={s.id} className="flex flex-col gap-2 p-3 border rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {stat?.loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
                         stat?.valid ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                         <XCircle className="h-5 w-5 text-destructive" />}
                        <span className="font-medium">{s.name}</span>
                        <span className="text-sm text-muted-foreground truncate max-w-[200px]">({s.path})</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditSource(s); setSourceDialogOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteSource(s.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {stat?.error && <div className="text-sm text-destructive pl-7">{stat.error}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {initialRemotes.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-3">Remotes</h3>
            <div className="grid gap-3">
              {initialRemotes.map((r: any) => {
                const stat = remoteStatus[r.id];
                return (
                  <div key={r.id} className="flex flex-col gap-2 p-3 border rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {stat?.loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
                         stat?.valid ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                         <XCircle className="h-5 w-5 text-destructive" />}
                        <span className="font-medium">{r.name}</span>
                        <span className="text-sm text-muted-foreground">({r.type})</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditRemote(r); setRemoteDialogOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteRemote(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {stat?.error && <div className="text-sm text-destructive pl-7">{stat.error}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={handleFinish} disabled={!allDone || anyLoading}>
          {anyLoading ? "Validating..." : "Finish & Continue"}
        </Button>
      </CardFooter>

      <AddSourceDialog 
        open={sourceDialogOpen} 
        onOpenChange={(open: any) => {
          setSourceDialogOpen(open);
          if (!open) {
            setEditSource(null);
            window.location.reload();
          }
        }} 
        editItem={editSource} 
      />

      <AddRemoteDialog 
        open={remoteDialogOpen} 
        onOpenChange={(open: any) => {
          setRemoteDialogOpen(open);
          if (!open) {
            setEditRemote(null);
            window.location.reload();
          }
        }} 
        editItem={editRemote} 
      />

      <ConfirmDeleteDialog 
        open={!!deleteSourceId} 
        onOpenChange={(open: any) => !open && setDeleteSourceId(null)}
        onConfirm={confirmDeleteSource}
        title="Delete Source?"
        description="This will remove the local folder from Sciurus. Any backup plans using this source will also be deleted."
      />

      <ConfirmDeleteDialog 
        open={!!deleteRemoteId} 
        onOpenChange={(open: any) => !open && setDeleteRemoteId(null)}
        onConfirm={confirmDeleteRemote}
        title="Delete Remote?"
        description="This will remove the remote from Sciurus. Any backup plans using this remote will also be deleted."
      />

    </Card>
  );
}
