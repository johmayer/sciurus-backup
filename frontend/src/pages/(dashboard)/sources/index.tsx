import { useState, useEffect } from "react";
import { Plus, Folder, Trash } from "lucide-react";
type Plan = any; type BackupLog = any; type Source = any; type Remote = any;
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AddSourceDialog from "@/components/Sources/AddSourceDialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { getSources, deleteSource } from "@/api";

export default function Sources() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [editItem, setEditItem] = useState<Source | null>(null);

  const fetchSources = async () => {
    try {
      const records = await getSources();
      setSources(records);
    } catch (e) {
      console.error("Could not fetch sources", e);
    }
  };

  useEffect(() => {
    fetchSources();
  }, [isAddOpen, editItem]);

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteSource(deleteId);
      setDeleteId(null);
      fetchSources();
    }
  };

  const openAdd = () => {
    setEditItem(null);
    setIsAddOpen(true);
  };

  const openEdit = (source: Source) => {
    setEditItem(source);
    setIsAddOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Local Sources</h1>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Source
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Folders</CardTitle>
          <CardDescription>
            Manage the local directories on the server that you want to back up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Path</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                    No sources configured yet. Add a local folder to get started.
                  </TableCell>
                </TableRow>
              )}
              {sources.map((source) => (
                <TableRow key={source.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEdit(source)}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    {source.name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{source.path}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); openEdit(source); }}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); setDeleteId(source.id); }}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddSourceDialog open={isAddOpen} onOpenChange={(val) => { setIsAddOpen(val); if(!val) setEditItem(null); }} editItem={editItem} />
      
      <ConfirmDeleteDialog 
        open={!!deleteId} 
        onOpenChange={(open: any) => !open && setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Source?"
        description="This will remove the local folder from Sciurus. Any backup plans using this source will also be deleted."
      />
    </div>
  );
}
