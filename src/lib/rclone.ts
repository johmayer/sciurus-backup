import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import prisma from './db';;
import { decryptSecret, isEncrypted } from './encryption';

const execAsync = promisify(exec);


export async function obscurePassword(password: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`rclone obscure "${password}"`);
    return stdout.trim();
  } catch (e) {
    console.warn("Failed to obscure password natively, trying to pass plaintext...", e);
    return password;
  }
}

function getBaseEnv(plan: any): NodeJS.ProcessEnv {
  const remoteConfig = JSON.parse(plan.remote.config);
  const env: NodeJS.ProcessEnv = { ...process.env };
  
  const baseRemoteName = `remote_${plan.remote.id}`;
  env[`RCLONE_CONFIG_${baseRemoteName.toUpperCase()}_TYPE`] = plan.remote.type;
  for (const [key, value] of Object.entries(remoteConfig)) {
    if (value) {
      let finalValue = typeof value === 'string' ? value : JSON.stringify(value);
      if (isEncrypted(finalValue)) {
        finalValue = decryptSecret(finalValue);
      }
      // Rclone obscure doesn't need to be run here for env vars directly if they are tokens?
      // Actually we must obscure passwords in rclone config via env vars if it requires it, but usually standard env string is fine.
      env[`RCLONE_CONFIG_${baseRemoteName.toUpperCase()}_${key.toUpperCase()}`] = finalValue;
    }
  }
  return env;
}

export async function executeRcloneBackup(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { source: true, remote: true }
  });

  if (!plan) throw new Error("Plan not found");
  
  if (plan.status === 'Running') {
    console.warn(`[Backup] Plan ${plan.name} is already currently running. Skipping concurrent execution.`);
    return;
  }
  
  // Set lock
  await prisma.plan.update({
    where: { id: planId },
    data: { status: 'Running' }
  });

  try {
    const env = getBaseEnv(plan);
  const baseRemoteName = `remote_${plan.remote.id}`;
  
  const prefix = plan.backupPrefix || 'backup';
  const cleanFolder = (plan.remoteFolderPath || "").replace(/^\/+|\/+$/g, '');
  const folderPath = cleanFolder ? `${cleanFolder}/` : '';
  let destination = `${baseRemoteName}:/${folderPath}${prefix}_${plan.id}`;

  if (plan.encrypt && plan.password) {
    const cryptRemoteName = `crypt_${plan.id}`;
    env[`RCLONE_CONFIG_${cryptRemoteName.toUpperCase()}_TYPE`] = 'crypt';
    env[`RCLONE_CONFIG_${cryptRemoteName.toUpperCase()}_REMOTE`] = destination;
    
    let rawPass = plan.password;
    if (isEncrypted(rawPass)) {
      rawPass = decryptSecret(rawPass);
    }
    const obscured = await obscurePassword(rawPass);
    env[`RCLONE_CONFIG_${cryptRemoteName.toUpperCase()}_PASSWORD`] = obscured;
    
    destination = `${cryptRemoteName}:/`;
  }

  return new Promise((resolve, reject) => {
    const child = spawn('rclone', ['sync', plan.source.path, destination, '--verbose'], { env });
    let log = '';
    
    child.stdout.on('data', data => log += data.toString());
    child.stderr.on('data', data => log += data.toString());

    child.on('close', async code => {
      await prisma.plan.update({
        where: { id: planId },
        data: { status: 'Active' }
      });
      
      await prisma.backupLog.create({
        data: {
          planId: plan.id,
          status: code === 0 ? "Success" : "Failed",
          rawOutput: log,
          completedAt: new Date()
        }
      });
      if (code === 0) resolve(log);
      else reject(new Error(`Backup failed with code ${code}`));
    });
  });
  } catch (err) {
    await prisma.plan.update({
      where: { id: planId },
      data: { status: 'Active' }
    });
    throw err;
  }
}

export async function executeRcloneRestore(planId: string, overridePassword?: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { source: true, remote: true }
  });

  if (!plan) throw new Error("Plan not found");

  const env = getBaseEnv(plan);
  const baseRemoteName = `remote_${plan.remote.id}`;
  
  const prefix = plan.backupPrefix || 'backup';
  const cleanFolder = (plan.remoteFolderPath || "").replace(/^\/+|\/+$/g, '');
  const folderPath = cleanFolder ? `${cleanFolder}/` : '';
  let remotePath = `${baseRemoteName}:/${folderPath}${prefix}_${plan.id}`;

  if (plan.encrypt) {
    const activePassword = overridePassword || plan.password;
    if (activePassword) {
      let rawPass = activePassword;
      if (isEncrypted(rawPass)) {
        rawPass = decryptSecret(rawPass);
      }
      const cryptRemoteName = `crypt_${plan.id}`;
      env[`RCLONE_CONFIG_${cryptRemoteName.toUpperCase()}_TYPE`] = 'crypt';
      env[`RCLONE_CONFIG_${cryptRemoteName.toUpperCase()}_REMOTE`] = remotePath;
      
      const obscured = await obscurePassword(rawPass);
      env[`RCLONE_CONFIG_${cryptRemoteName.toUpperCase()}_PASSWORD`] = obscured;
      
      const baseRemotePath = remotePath;
      remotePath = `${cryptRemoteName}:/`;

      // Pre-restore check to prevent wipeout on bad MAC
      try {
        const { stdout: baseSizeStr } = await execAsync(`rclone size ${baseRemotePath} --json`, { env });
        const baseSize = JSON.parse(baseSizeStr);
        if (baseSize.count > 0) {
          const { stdout: cryptSizeStr } = await execAsync(`rclone size ${remotePath} --json`, { env });
          const cryptSize = JSON.parse(cryptSizeStr);
          if (cryptSize.count === 0) {
            throw new Error("Password mismatch! Remote is not empty but crypt sees 0 files (MAC authentication failed). Aborting restore to prevent data loss.");
          }
        }
      } catch (err: any) {
        throw new Error(err.message || "Failed password check");
      }
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn('rclone', ['sync', remotePath, plan.source.path, '--verbose'], { env });
    let log = '';
    
    child.stdout.on('data', data => log += data.toString());
    child.stderr.on('data', data => log += data.toString());

    child.on('close', async code => {
      await prisma.backupLog.create({
        data: {
          planId: plan.id,
          status: code === 0 ? "Success" : "Failed",
          rawOutput: log + "\n[Restore Action]",
          completedAt: new Date()
        }
      });
      if (code === 0) resolve(log);
      else reject(new Error(`Restore failed with code ${code}`));
    });
  });
}
