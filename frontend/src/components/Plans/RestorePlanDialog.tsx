import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2 } from "lucide-react";
import { executeRestore } from "@/api";
type Plan = any; type Source = any; type Remote = any; type Prisma = any;

type PlanWithRelations = any;

interface RestorePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanWithRelations | null;
}

export default function RestorePlanDialog({ open, onOpenChange, plan }: RestorePlanDialogProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Pre-fill password when dialog opens
  useState(() => {
    if (open && plan && plan.encrypt) {
      // The password in the DB is obscured, we don't know the plaintext. 
      // Actually, if we leave it blank, the backend can use the existing one, or if provided, use the new one.
    }
  });

  const handleRestore = async () => {
    if (!plan) return;
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      await executeRestore(plan.id, password);
      setSuccess(true);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!loading) onOpenChange(val); if (!val) { setSuccess(false); setError(""); setPassword(""); } }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5" /> Restore from Remote
          </DialogTitle>
          <DialogDescription>
            You are about to restore the state of <strong>{plan?.remote?.name}</strong> to the local source <strong>{plan?.source?.path}</strong>.
          </DialogDescription>
        </DialogHeader>

        {!success ? (
          <div className="grid gap-4 py-4">
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive font-semibold">
              Warning: This will overwrite ALL files in the local source directory with the exact state of the remote. Any files present in the local directory but missing from the remote will be DELETED.
            </div>

            {plan?.encrypt && (
              <div className="grid gap-2">
                <Label htmlFor="restore-pass">Decryption Password (Optional)</Label>
                <Input 
                  id="restore-pass" 
                  type="password" 
                  value={password} 
                  onChange={(e: any) => setPassword(e.target.value)} 
                  placeholder="Leave blank to use the plan's saved password" 
                />
                <p className="text-xs text-muted-foreground">Only provide this if you need to override the saved encryption password for this restore.</p>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive whitespace-pre-wrap max-h-48 overflow-y-auto">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-green-600 font-medium">
            Restore job has been successfully submitted to the background! Check the logs for progress.
          </div>
        )}

        <DialogFooter>
          {!success ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
              <Button variant="destructive" onClick={handleRestore} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Restore
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
