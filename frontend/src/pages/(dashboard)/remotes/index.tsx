import { useState, useEffect } from "react";
import { Plus, Server, Trash } from "lucide-react";
type Plan = any; type BackupLog = any; type Source = any; type Remote = any;
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AddRemoteDialog from "@/components/Remotes/AddRemoteDialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { getRemotes, deleteRemote } from "@/api";

export default function Remotes() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [editItem, setEditItem] = useState<Remote | null>(null);

  const fetchRemotes = async () => {
    try {
      const records = await getRemotes();
      setRemotes(records);
    } catch (e) {
      console.error("Could not fetch remotes", e);
    }
  };

  useEffect(() => {
    fetchRemotes();
  }, [isAddOpen, editItem]);

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteRemote(deleteId);
      setDeleteId(null);
      fetchRemotes();
    }
  };

  const openAdd = () => {
    setEditItem(null);
    setIsAddOpen(true);
  };

  const openEdit = (remote: Remote) => {
    setEditItem(remote);
    setIsAddOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Remotes</h1>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Remote
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Storage Remotes</CardTitle>
          <CardDescription>
            Manage your external storage providers where backups will be stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                    No remotes configured yet. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
              {remotes.map((remote) => (
                <TableRow key={remote.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEdit(remote)}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    {remote.name}
                  </TableCell>
                  <TableCell className="uppercase">{remote.type}</TableCell>
                  <TableCell>Ready</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); openEdit(remote); }}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); setDeleteId(remote.id); }}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddRemoteDialog open={isAddOpen} onOpenChange={(val) => { setIsAddOpen(val); if (!val) setEditItem(null); }} editItem={editItem} />
      
      <ConfirmDeleteDialog 
        open={!!deleteId} 
        onOpenChange={(open: any) => !open && setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Remote?"
        description="This will permanently delete this remote configuration. Any backup plans using this remote will also be deleted."
      />
    </div>
  );
}
