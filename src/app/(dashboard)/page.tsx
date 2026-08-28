export const dynamic = "force-dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, HardDrive, Server, AlertCircle } from "lucide-react";
import prisma from '@/lib/db';;
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);



async function getRcloneVersion() {
  try {
    const { stdout } = await execAsync('rclone --version');
    // Extract just the first line (e.g. "rclone v1.65.0")
    return stdout.split('\n')[0];
  } catch (err) {
    return "Not installed or unavailable";
  }
}

export default async function Dashboard() {
  const remoteCount = await prisma.remote.count();
  const planCount = await prisma.plan.count();
  const activePlans = await prisma.plan.count({ where: { status: 'Active' } });
  
  // Calculate total bytes directly from the plans
  const plans = await prisma.plan.findMany({ select: { lastBackupSize: true } });
  const totalBytes = plans.reduce((acc, plan) => {
    return acc + Number(plan.lastBackupSize || 0);
  }, 0);
  const totalGb = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);

  const errorCount = await prisma.backupLog.count({
    where: { 
      status: 'Failed',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });

  const rcloneVersion = await getRcloneVersion();
  const recentLogs = await prisma.backupLog.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { plan: true }
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage Backed Up</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGb} GB</div>
            <p className="text-xs text-muted-foreground">Across all configured plans</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configured Remotes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{remoteCount}</div>
            <p className="text-xs text-muted-foreground">Available backup destinations</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Plans</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePlans}</div>
            <p className="text-xs text-muted-foreground">Out of {planCount} total plans</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors (24h)</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{errorCount}</div>
            <p className="text-xs text-muted-foreground">
              {errorCount === 0 ? "All systems operational" : "Check backup logs"}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Backup Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No recent backups.</div>
            ) : (
              <div className="space-y-4">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{log.plan?.name || "Deleted Plan"}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.createdAt.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${log.status === 'Success' ? 'text-green-600' : log.status === 'Failed' ? 'text-destructive' : 'text-yellow-600'}`}>
                        {log.status}
                      </div>
                      {log.status === 'Failed' && log.message && (
                        <p className="text-xs text-destructive max-w-[200px] truncate" title={log.message}>
                          {log.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 border-t pt-4 text-center">
              <a href="/logs" className="text-sm font-medium text-primary hover:underline">
                View all logs &rarr;
              </a>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Backend health and version info</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">Rclone Version</p>
                  <p className="text-sm text-muted-foreground font-mono">{rcloneVersion}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
