"use client";
import { useState, useEffect } from "react";
import { Plus, Clock, Trash, Shield, ShieldOff, Play, DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma, Plan } from "@prisma/client";
import { Switch } from "@/components/ui/switch";
import AddPlanDialog from "@/components/Plans/AddPlanDialog";
import RestorePlanDialog from "@/components/Plans/RestorePlanDialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { getPlans, deletePlan, runPlanNow, updatePlan } from "@/app/actions";

type PlanWithRelations = Prisma.PlanGetPayload<{ include: { source: true, remote: true } }>;

export default function Plans() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [plans, setPlans] = useState<PlanWithRelations[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [restoreItem, setRestoreItem] = useState<PlanWithRelations | null>(null);

  const [editItem, setEditItem] = useState<PlanWithRelations | null>(null);

  const fetchPlans = async () => {
    try {
      const records = await getPlans();
      setPlans(records as PlanWithRelations[]);
    } catch (e) {
      console.error("Could not fetch plans", e);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [isAddOpen, editItem]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deletePlan(deleteId);
      await fetchPlans();
      setDeleteId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      // Optimistic update
      setPlans(plans.map(p => p.id === id ? { ...p, enabled: !currentEnabled } : p));
      await updatePlan(id, { enabled: !currentEnabled });
      await fetchPlans();
    } catch (e) {
      console.error(e);
      await fetchPlans(); // Revert on error
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await runPlanNow(id);
    } catch (e) {
      console.error(e);
    }
  };

  const openAdd = () => {
    setEditItem(null);
    setIsAddOpen(true);
  };

  const openEdit = (plan: PlanWithRelations) => {
    setEditItem(plan);
    setIsAddOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Backup Plans</h1>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Create Plan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automated Schedules</CardTitle>
          <CardDescription>
            Manage the scheduled sync routines between your local sources and remotes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Encryption</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                    No backup plans configured.
                  </TableCell>
                </TableRow>
              )}
              {plans.map((plan) => (
                <TableRow key={plan.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEdit(plan)}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {plan.name}
                  </TableCell>
                  <TableCell>{plan.source?.name || "Unknown"}</TableCell>
                  <TableCell>{plan.remote?.name || "Unknown"}</TableCell>
                  <TableCell className="font-mono">{plan.schedule}</TableCell>
                  <TableCell>
                    {plan.encrypt ? (
                      <span className="flex items-center text-green-600 gap-1 text-sm"><Shield className="h-4 w-4"/> Encrypted</span>
                    ) : (
                      <span className="flex items-center text-muted-foreground gap-1 text-sm"><ShieldOff className="h-4 w-4"/> Plaintext</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}><Switch checked={plan.enabled} onCheckedChange={() => handleToggleEnabled(plan.id, plan.enabled)} /></TableCell>
                  <TableCell>{plan.status || "Active"}</TableCell>
                  <TableCell className="text-right space-x-2 flex justify-end">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setRestoreItem(plan); }}>
                      <DownloadCloud className="h-3 w-3 mr-1" /> Restore
                    </Button>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleRunNow(plan.id); }}>
                      <Play className="h-3 w-3 mr-1" /> Run Now
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(plan); }}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteId(plan.id); }}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddPlanDialog open={isAddOpen} onOpenChange={(val) => { setIsAddOpen(val); if(!val) setEditItem(null); }} editItem={editItem} />
      
      <RestorePlanDialog open={!!restoreItem} onOpenChange={(open) => !open && setRestoreItem(null)} plan={restoreItem} />

      <ConfirmDeleteDialog 
        open={!!deleteId} 
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Backup Plan?"
        description="This will permanently delete this automated backup schedule. Your existing backed up data will remain on the remote."
      />
    </div>
  );
}
