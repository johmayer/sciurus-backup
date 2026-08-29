import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, HardDrive, Server, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPlans, getRemotes, getLogs } from "@/api";

export default function Dashboard() {
  const [data, setData] = useState({
    remoteCount: 0,
    planCount: 0,
    activePlans: 0,
    totalGb: "0.00",
    errorCount: 0,
    rcloneVersion: "Checking...",
    recentLogs: [],
    activeTransfers: []
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [plans, remotes, logs] = await Promise.all([
          getPlans(),
          getRemotes(),
          getLogs()
        ]);
        
        const totalBytes = plans.reduce((acc: number, plan: any) => acc + Number(plan.lastBackupSize || 0), 0);
        
        const recentLogs = logs
            .sort((a: any, b: any) => new Date(b.createdAt + 'Z').getTime() - new Date(a.createdAt + 'Z').getTime())
            .slice(0, 5);
            
        const activeTransfers = logs
            .filter((l: any) => l.status === 'Running' || l.status === 'Restoring')
            .map((l: any) => {
                const plan = plans.find((p: any) => p.id === l.planId);
                let progress = 0, speed = "Calculating...", eta = "...", transferred = "", total = "";
                if (l.message) {
                    const progMatch = l.message.match(/(\d+)%/);
                    if (progMatch) progress = parseInt(progMatch[1]);
                    
                    const speedMatch = l.message.match(/,\s+([0-9.]+\s+[KMG]?i?B\/s)/);
                    if (speedMatch) speed = speedMatch[1];
                    
                    const etaMatch = l.message.match(/ETA\s+([0-9a-z]+)/);
                    if (etaMatch) eta = etaMatch[1];
                    
                    const transMatch = l.message.match(/([0-9.]+\s+[KMG]?i?B)\s+\//);
                    if (transMatch) transferred = transMatch[1];
                    
                    const totMatch = l.message.match(/\/\s+([0-9.]+\s+[KMG]?i?B)/);
                    if (totMatch) total = totMatch[1];
                }
                return {
                    id: l.id,
                    planName: plan?.name || "Unknown Plan",
                    status: l.status,
                    progress,
                    speed,
                    eta,
                    transferred,
                    total
                };
            });
            
        setData({
          remoteCount: remotes.length,
          planCount: plans.length,
          activePlans: plans.filter((p: any) => p.status === 'Active').length,
          totalGb: (totalBytes / (1024 * 1024 * 1024)).toFixed(2),
          errorCount: logs.filter((l: any) => l.status === 'Failed' && new Date(l.createdAt + 'Z').getTime() > Date.now() - 24 * 60 * 60 * 1000).length,
          rcloneVersion: "Backend API Connected",
          recentLogs,
          activeTransfers
        });
      } catch (err) {
        console.error("Dashboard failed to load", err);
        setData(prev => ({ ...prev, rcloneVersion: "Backend API Disconnected" }));
      }
    }
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

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
            <div className="text-2xl font-bold">{data.totalGb} GB</div>
            <p className="text-xs text-muted-foreground">Across all configured plans</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configured Remotes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.remoteCount}</div>
            <p className="text-xs text-muted-foreground">Available backup destinations</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Plans</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activePlans}</div>
            <p className="text-xs text-muted-foreground">Out of {data.planCount} total plans</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors (24h)</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.errorCount}</div>
            <p className="text-xs text-muted-foreground">
              {data.errorCount === 0 ? "All systems operational" : "Check backup logs"}
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
            {data.recentLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No recent backups.</div>
            ) : (
              <div className="space-y-4">
                {data.recentLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{log.plan?.name || "Deleted Plan"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.createdAt + 'Z').toLocaleString()}
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
              <Link to="/logs" className="text-sm font-medium text-primary hover:underline">
                View all logs &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                Active Transfers
                {data.activeTransfers.length > 0 && (
                    <span className="relative flex h-3 w-3 ml-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                    </span>
                )}
            </CardTitle>
            <CardDescription>Live backup and restore progress</CardDescription>
          </CardHeader>
          <CardContent>
            {data.activeTransfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Activity className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">No active transfers</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {data.activeTransfers.map((t: any) => (
                        <div key={t.id} className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="font-medium text-foreground">{t.planName}</span>
                                <span className="text-muted-foreground font-mono text-xs">{t.speed}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span>{t.status === 'Restoring' ? 'Downloading...' : 'Uploading...'}</span>
                                {t.eta !== "..." && <span>ETA {t.eta}</span>}
                            </div>
                            <div className="w-full bg-secondary rounded-full h-2">
                                <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${t.progress}%` }}></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                <span>{t.transferred}</span>
                                <span>{t.total}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
