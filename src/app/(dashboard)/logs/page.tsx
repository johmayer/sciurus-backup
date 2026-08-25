export const dynamic = "force-dynamic";
import { PrismaClient } from '@prisma/client'
import LogsClient from './LogsClient'

const prisma = new PrismaClient()

export default async function LogsPage() {
  const logs = await prisma.backupLog.findMany({
    orderBy: { createdAt: 'desc' },
    include: { plan: true }
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">Backup Logs</h1>
      <p className="text-muted-foreground">Detailed history of all automated and manual backup jobs.</p>
      
      <LogsClient initialLogs={logs} />
    </div>
  )
}
