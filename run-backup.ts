import { executeRcloneBackup } from './src/lib/rclone';

const id = process.argv[2];
if (!id) {
  console.error("No plan ID provided");
  process.exit(1);
}

console.log(`[Manual Run] Starting manual backup for plan ${id}`);
executeRcloneBackup(id).then(() => {
  console.log(`[Manual Run] Finished manual backup for plan ${id}`);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
