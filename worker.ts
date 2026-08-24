import prisma from './src/lib/db';
import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { executeRcloneBackup } from './src/lib/rclone'


const tasks = new Map<string, ScheduledTask>()

async function reloadSchedules() {
  console.log('[Worker] Reloading schedules...')
  
  const plans = await prisma.plan.findMany({
    where: { status: 'Active', enabled: true }
  })
  
  // Clear old tasks
  for (const task of tasks.values()) {
    task.stop()
  }
  tasks.clear()
  
  // Start new tasks
  for (const plan of plans) {
    if (!cron.validate(plan.schedule)) {
      console.error(`[Worker] Invalid cron expression for plan ${plan.name}: ${plan.schedule}`)
      continue
    }
    
    const task = cron.schedule(plan.schedule, () => {
      console.log(`[Worker] Cron triggered for plan ${plan.name}`)
      executeRcloneBackup(plan.id).catch(console.error)
    })
    
    tasks.set(plan.id, task)
    console.log(`[Worker] Scheduled plan ${plan.name} with cron: ${plan.schedule}`)
  }
}

async function main() {
  console.log('[Worker] Starting background scheduler...')
  await reloadSchedules()
  
  // Reload schedules from DB every minute
  setInterval(reloadSchedules, 60000)
}

main().catch(console.error)
