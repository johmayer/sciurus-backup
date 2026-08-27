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

import * as fs from 'fs';
import * as path from 'path';
import { encryptSecret } from './encryption';

function truncateLog(log: string, maxLines = 50): string {
  if (!log) return "";
  const lines = log.split('\n');
  if (lines.length > maxLines) {
    return lines.slice(lines.length - maxLines).join('\n');
  }
  return log;
}

async function prepareConfigFile(plan: any, overridePassword?: string): Promise<{ confPath: string, destination: string, env: NodeJS.ProcessEnv }> {
  const remoteConfig = JSON.parse(plan.remote.config);
  const baseRemoteName = `remote_${plan.remote.id}`;
  let content = `[${baseRemoteName}]\n`;
  content += `type = ${plan.remote.type}\n`;
  
  for (const [key, value] of Object.entries(remoteConfig)) {
    if (value) {
      let finalValue = typeof value === 'string' ? value : JSON.stringify(value);
      if (isEncrypted(finalValue)) {
        finalValue = decryptSecret(finalValue);
      }
      content += `${key} = ${finalValue}\n`;
    }
  }

  const prefix = plan.backupPrefix || 'backup';
  const cleanFolder = (plan.remoteFolderPath || "").replace(/^\/+|\/+$/g, '');
  const folderPath = cleanFolder ? `${cleanFolder}/` : '';
  let destination = `${baseRemoteName}:/${folderPath}${prefix}_${plan.id}`;
  let finalDestination = destination;

  const activePassword = overridePassword !== undefined ? overridePassword : plan.password;
  if (plan.encrypt && activePassword) {
    const cryptRemoteName = `crypt_${plan.id}`;
    content += `\n[${cryptRemoteName}]\n`;
    content += `type = crypt\n`;
    content += `remote = ${destination}\n`;
    
    let rawPass = activePassword;
    if (isEncrypted(rawPass)) {
      rawPass = decryptSecret(rawPass);
    }
    const obscured = await obscurePassword(rawPass);
    content += `password = ${obscured}\n`;
    finalDestination = `${cryptRemoteName}:/`;
  }

  const confPath = path.join('/tmp', `rclone-plan-${plan.id}-${Date.now()}.conf`);
  fs.writeFileSync(confPath, content, 'utf8');
  return { confPath, destination: finalDestination, env: { ...process.env } };
}

async function extractAndUpdateRemoteConfig(confPath: string, plan: any) {
  try {
    const content = fs.readFileSync(confPath, 'utf8');
    const lines = content.split('\n');
    const baseRemoteName = `remote_${plan.remote.id}`;
    
    let inRemote = false;
    const newConfig: Record<string, string> = {};
    
    for (const line of lines) {
      if (line.trim().startsWith('[')) {
        inRemote = line.trim() === `[${baseRemoteName}]`;
        continue;
      }
      if (inRemote && line.includes('=')) {
        const idx = line.indexOf('=');
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        if (key !== 'type') newConfig[key] = val;
      }
    }

    const oldConfig = JSON.parse(plan.remote.config);
    let changed = false;
    
    for (const [key, val] of Object.entries(newConfig)) {
      const oldValRaw = oldConfig[key];
      let oldValPlain = oldValRaw;
      if (oldValRaw && typeof oldValRaw === 'string' && isEncrypted(oldValRaw)) {
        oldValPlain = decryptSecret(oldValRaw);
      } else if (oldValRaw && typeof oldValRaw === 'object') {
        oldValPlain = JSON.stringify(oldValRaw);
      }
      
      if (val !== oldValPlain) {
        changed = true;
        if (oldValRaw && typeof oldValRaw === 'string' && isEncrypted(oldValRaw)) {
          oldConfig[key] = encryptSecret(val);
        } else {
          try { oldConfig[key] = JSON.parse(val); } catch { oldConfig[key] = val; }
        }
      }
    }
    
    if (changed) {
      await prisma.remote.update({
        where: { id: plan.remote.id },
        data: { config: JSON.stringify(oldConfig) }
      });
      console.log(`[Backup] Automatically updated refreshed tokens in database for remote ${plan.remote.name}`);
    }
  } catch (e) {
    console.error(`[Backup] Failed to parse updated config for remote ${plan.remote.id}:`, e);
  } finally {
    try { fs.unlinkSync(confPath); } catch (_) {}
  }
}
export async function checkPlanRemoteData(planId: string): Promise<{ hasData: boolean }> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { remote: true, source: true }
  });
  if (!plan) throw new Error("Plan not found");
  
  let confPath = '';
  try {
    const prepared = await prepareConfigFile(plan);
    confPath = prepared.confPath;
    const { stdout, stderr } = await execAsync(`rclone size ${prepared.destination} --config ${confPath} --json`, { env: prepared.env });
    const size = JSON.parse(stdout);
    return { hasData: size.count > 0 };
  } catch (err: any) {
    const errorMsg = String(err.message || err.stderr || "");
    if (errorMsg.includes('directory not found') || errorMsg.includes('error reading source directory')) {
      return { hasData: false };
    }
    console.error("[Backup] checkPlanRemoteData error:", err);
    throw new Error("Failed to check remote size");
  } finally {
    if (confPath) {
      try { fs.unlinkSync(confPath); } catch (_) {}
    }
  }
}

export async function purgePlanRemoteData(planId: string): Promise<{ success: boolean }> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { remote: true, source: true }
  });
  if (!plan) throw new Error("Plan not found");
  
  let confPath = '';
  try {
    const prepared = await prepareConfigFile(plan);
    confPath = prepared.confPath;
    
    const baseRemoteName = `remote_${plan.remote.id}`;
    const prefix = plan.backupPrefix || 'backup';
    const cleanFolder = (plan.remoteFolderPath || "").replace(/^\/+|\/+$/g, '');
    const folderPath = cleanFolder ? `${cleanFolder}/` : '';
    const underlyingDestination = `${baseRemoteName}:/${folderPath}${prefix}_${plan.id}`;

    await execAsync(`rclone purge ${underlyingDestination} --config ${confPath}`, { env: prepared.env });
    return { success: true };
  } catch (err: any) {
    const errorMsg = String(err.message || err.stderr || "");
    if (errorMsg.includes('directory not found')) {
      return { success: true };
    }
    console.error("[Backup] purgePlanRemoteData error:", err);
    throw new Error("Failed to purge remote data");
  } finally {
    if (confPath) {
      try { fs.unlinkSync(confPath); } catch (_) {}
    }
  }
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

  let confPath = '';
  try {
    const prepared = await prepareConfigFile(plan);
    confPath = prepared.confPath;
    const destination = prepared.destination;
    const env = prepared.env;

    const backupLog = await prisma.backupLog.create({
      data: {
        planId: plan.id,
        status: "Running",
        message: "Starting backup..."
      }
    });

    return new Promise((resolve, reject) => {
      const child = spawn('rclone', ['sync', plan.source.path, destination, '--config', confPath, '--verbose', '--stats=1s', '--stats-one-line'], { env });
      let log = '';
      let lastUpdate = 0;
      
      child.on('error', (err) => {
        reject(new Error(`Failed to spawn rclone: ${err.message}`));
      });
      
      child.stdout.on('data', data => log += data.toString());
      child.stderr.on('data', data => {
      const chunk = data.toString();
      log += chunk;
      
      const now = Date.now();
      if (now - lastUpdate > 1000) {
        const lines = chunk.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line && (line.includes('ETA') || line.includes('/s,'))) {
            lastUpdate = now;
            prisma.backupLog.update({
              where: { id: backupLog.id },
              data: { message: line }
            }).catch(console.error);
            break;
          }
        }
      }
    });

      child.on('close', async code => {
        await extractAndUpdateRemoteConfig(confPath, plan);

        await prisma.plan.update({
          where: { id: planId },
          data: { status: code === 0 ? 'Active' : 'Error' }
        });
        
        if (code === 0) {
          // Delete logs for successful executions
          await prisma.backupLog.delete({ where: { id: backupLog.id } });
        } else {
          await prisma.backupLog.update({
            where: { id: backupLog.id },
            data: {
              status: "Failed",
              message: "Backup failed",
              rawOutput: truncateLog(log),
              completedAt: new Date()
            }
          });
        }
        if (code === 0) resolve(log);
        else reject(new Error(`Backup failed with code ${code}`));
      });
    });
  } catch (err) {
    if (confPath) {
      try { fs.unlinkSync(confPath); } catch (_) {}
    }
    await prisma.plan.update({
      where: { id: planId },
      data: { status: 'Error' }
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
  if (plan.status === 'Running' || plan.status === 'Restoring') {
    throw new Error(`Plan ${plan.name} is already active. Skipping execution.`);
  }

  // Set lock
  await prisma.plan.update({
    where: { id: planId },
    data: { status: 'Restoring' }
  });

  let confPath = '';
  try {
    const prepared = await prepareConfigFile(plan, overridePassword);
    confPath = prepared.confPath;
    let remotePath = prepared.destination;
    const env = prepared.env;

    if (plan.encrypt) {
      const activePassword = overridePassword || plan.password;
      if (activePassword) {
        // Pre-restore check to prevent wipeout on bad MAC
        const baseRemoteName = `remote_${plan.remote.id}`;
        const prefix = plan.backupPrefix || 'backup';
        const cleanFolder = (plan.remoteFolderPath || "").replace(/^\/+|\/+$/g, '');
        const folderPath = cleanFolder ? `${cleanFolder}/` : '';
        const baseRemotePath = `${baseRemoteName}:/${folderPath}${prefix}_${plan.id}`;

        try {
          const { stdout: baseSizeStr } = await execAsync(`rclone size ${baseRemotePath} --config ${confPath} --json`, { env });
          const baseSize = JSON.parse(baseSizeStr);
          if (baseSize.count > 0) {
            const { stdout: cryptSizeStr } = await execAsync(`rclone size ${remotePath} --config ${confPath} --json`, { env });
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

    const backupLog = await prisma.backupLog.create({
      data: {
        planId: plan.id,
        status: "Restoring",
        message: "Starting restore..."
      }
    });

    return new Promise((resolve, reject) => {
      const child = spawn('rclone', ['sync', remotePath, plan.source.path, '--config', confPath, '--verbose', '--stats=1s', '--stats-one-line'], { env });
      let log = '';
      let lastUpdate = 0;
      
      child.on('error', (err) => {
        reject(new Error(`Failed to spawn rclone: ${err.message}`));
      });

      child.stdout.on('data', data => log += data.toString());
      child.stderr.on('data', data => {
        const chunk = data.toString();
        log += chunk;
        
        const now = Date.now();
        if (now - lastUpdate > 1000) {
          const lines = chunk.split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line && (line.includes('ETA') || line.includes('/s,'))) {
              lastUpdate = now;
              prisma.backupLog.update({
                where: { id: backupLog.id },
                data: { message: line }
              }).catch(console.error);
              break;
            }
          }
        }
      });

      child.on('close', async code => {
        await extractAndUpdateRemoteConfig(confPath, plan);
        
        await prisma.plan.update({
          where: { id: planId },
          data: { status: code === 0 ? 'Active' : 'Error' }
        });

        if (code === 0) {
          await prisma.backupLog.delete({ where: { id: backupLog.id } });
        } else {
          await prisma.backupLog.update({
            where: { id: backupLog.id },
            data: {
              status: "Failed",
              message: "Restore failed",
              rawOutput: truncateLog(log + "\n[Restore Action]"),
              completedAt: new Date()
            }
          });
        }
        if (code === 0) resolve(log);
        else reject(new Error(`Restore failed with code ${code}`));
      });
    });
  } catch (err) {
    if (confPath) {
      try { fs.unlinkSync(confPath); } catch (_) {}
    }
    await prisma.plan.update({
      where: { id: planId },
      data: { status: 'Error' }
    });
    throw err;
  }
}
