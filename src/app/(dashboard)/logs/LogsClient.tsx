"use client";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, Clock, FileText, Trash2 } from "lucide-react";
import { BackupLog, Plan } from "@prisma/client";
import { getLogs, deleteLog, deleteMultipleLogs } from "@/app/actions";

type LogWithPlan = BackupLog & { plan?: Plan | null };

export default function LogsClient({ initialLogs }: { initialLogs: LogWithPlan[] }) {
  const [selectedLog, setSelectedLog] = useState<LogWithPlan | null>(null);
  const [logs, setLogs] = useState<LogWithPlan[]>(initialLogs);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const latestLogs = await getLogs();
        setLogs(latestLogs as LogWithPlan[]);
      } catch (e) {
        console.error(e);
      }
    };
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const getDuration = (start: Date, end: Date | null) => {
    if (!end) return "Running...";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === logs.length && logs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map(l => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await deleteMultipleLogs(Array.from(selectedIds));
      setLogs(logs.filter(l => !selectedIds.has(l.id)));
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteLog(id);
      setLogs(logs.filter(l => l.id !== id));
      const newSet = new Set(selectedIds);
      newSet.delete(id);
      setSelectedIds(newSet);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
          <span className="text-sm font-medium pl-2">{selectedIds.size} selected</span>
          <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete Selected
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <Checkbox 
                    checked={logs.length > 0 && selectedIds.size === logs.length} 
                    onCheckedChange={toggleSelectAll} 
                  />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan Name</TableHead>
                <TableHead>Started At</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    No logs recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {logs.map((log) => (
                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedLog(log)}>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox 
                      checked={selectedIds.has(log.id)} 
                      onCheckedChange={() => toggleSelect(log.id)} 
                    />
                  </TableCell>
                  <TableCell>
                    {log.status === "Success" && <span className="flex items-center text-green-600 font-medium"><CheckCircle2 className="w-4 h-4 mr-2" /> Success</span>}
                    {log.status === "Failed" && <span className="flex items-center text-destructive font-medium"><XCircle className="w-4 h-4 mr-2" /> Failed</span>}
                    {log.status === "Running" && <span className="flex items-center text-yellow-600 font-medium"><Clock className="w-4 h-4 mr-2" /> Running</span>}
                    {log.status === "Restoring" && <span className="flex items-center text-yellow-600 font-medium"><Clock className="w-4 h-4 mr-2" /> Restoring</span>}
                  </TableCell>
                  <TableCell className="font-medium">{log.plan?.name || "Deleted Plan"}</TableCell>
                  <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{getDuration(log.createdAt, log.completedAt)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}>
                      View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => handleDeleteSingle(e, log.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(v) => !v && setSelectedLog(null)}>
        {selectedLog && (
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Backup Job Details</DialogTitle>
              <DialogDescription>
                Executed for plan <strong>{selectedLog.plan?.name || "Unknown"}</strong> on {new Date(selectedLog.createdAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/20">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <p className={`font-medium ${selectedLog.status === 'Success' ? 'text-green-600' : selectedLog.status === 'Failed' ? 'text-destructive' : 'text-yellow-600'}`}>
                    {selectedLog.status}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Duration</p>
                  <p className="font-medium">{getDuration(selectedLog.createdAt, selectedLog.completedAt)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> 
                  Raw Output Logs
                </p>
                <div className="bg-zinc-950 p-4 rounded-md overflow-x-auto max-h-[300px] overflow-y-auto">
                  <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap">
                    {selectedLog.rawOutput || selectedLog.message || "No output captured."}
                  </pre>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
