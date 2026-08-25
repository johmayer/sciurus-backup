import { executeRcloneBackup } from './src/lib/rclone';
import prisma from './src/lib/db';

const id = process.argv[2];
if (!id) {
  console.error("No plan ID provided");
  process.exit(1);
}

executeRcloneBackup(id).then(() => {
  console.log(`[Manual Run] Finished manual backup for plan ${id}`);
  process.exit(0);
}).catch(async (e) => {
  console.error("[Manual Run Error]", e);
  try {
    await prisma.backupLog.create({
      data: {
        planId: id,
        status: "Failed",
        message: "Script crashed immediately",
        rawOutput: String(e.stack || e.message || e),
        completedAt: new Date()
      }
    });
  } catch (_) {}
  process.exit(1);
});
