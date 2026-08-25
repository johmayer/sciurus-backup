'use server'

import { auth } from '@/auth'
import bcrypt from 'bcryptjs'

export async function setupAdmin(username: string, passwordRaw: string) {
  const count = await prisma.user.count({ where: { password: { not: null } } });
  if (count > 0) throw new Error("Local authentication is already configured.");
  
  const bcrypt = await import('bcryptjs');
  const hashedPassword = await bcrypt.hash(passwordRaw, 10);
  
  await prisma.user.create({
    data: {
      name: "Admin",
      username,
      password: hashedPassword
    }
  });
  return { success: true };
}

import prisma from '@/lib/db';
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { encryptSecret, decryptSecret, isEncrypted } from '@/lib/encryption'
import path from 'path'
import fs from 'fs'
import * as yaml from 'js-yaml'




export async function getRemotes() {
  return await prisma.remote.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function createRemote(data: Prisma.RemoteCreateInput) {
  const configObj = JSON.parse(data.config as string);
  for (const key of ['pass', 'password', 'token', 'client_secret']) {
    if (configObj[key] && !isEncrypted(configObj[key])) {
      configObj[key] = encryptSecret(configObj[key]);
    }
  }
  data.config = JSON.stringify(configObj);
  await prisma.remote.create({ data })
  await syncStateToDisk()
  revalidatePath('/remotes')
}

export async function deleteRemote(id: string) {
  await prisma.remote.delete({ where: { id } })
  await syncStateToDisk()
  revalidatePath('/remotes')
}

export async function getSources() {
  return await prisma.source.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function createSource(data: Prisma.SourceCreateInput) {
  try {
    fs.accessSync(data.path, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    throw new Error(`Path does not exist or the software lacks read/write permissions: ${data.path}`);
  }
  await prisma.source.create({ data })
  await syncStateToDisk()
  revalidatePath('/sources')
}

export async function deleteSource(id: string) {
  await prisma.source.delete({ where: { id } })
  await syncStateToDisk()
  revalidatePath('/sources')
}

export async function getPlans() {
  return await prisma.plan.findMany({
    orderBy: { createdAt: 'desc' },
    include: { source: true, remote: true }
  })
}

export async function createPlan(data: Prisma.PlanUncheckedCreateInput) {
  if (data.encrypt && (!data.password || (typeof data.password === 'string' && data.password.trim() === ''))) {
    throw new Error("Password is required when encryption is enabled.");
  }
  if (data.password && !isEncrypted(data.password)) {
    data.password = encryptSecret(data.password);
  }
  await prisma.plan.create({ data })
  await syncStateToDisk()
  revalidatePath('/plans')
}

export async function deletePlan(id: string) {
  await prisma.plan.delete({ where: { id } })
  await syncStateToDisk()
  revalidatePath('/plans')
}


import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

export async function verifyRemoteConfig(type: string, configPayload: Record<string, string | number | boolean | null>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env[`RCLONE_CONFIG_TESTREMOTE_TYPE`] = type;
  
  for (const [key, value] of Object.entries(configPayload)) {
    if (value) {
      let finalValue = typeof value === 'string' ? value : JSON.stringify(value);
      if (isEncrypted(finalValue)) {
        finalValue = decryptSecret(finalValue);
      }
      if (key.toLowerCase() === 'pass' || key.toLowerCase() === 'password') {
        const { obscurePassword } = await import('@/lib/rclone');
        finalValue = await obscurePassword(finalValue as string);
      }
      env[`RCLONE_CONFIG_TESTREMOTE_${key.toUpperCase()}`] = finalValue;
    }
  }

  try {

    const { stdout } = await execAsync('rclone lsd testremote: --max-depth 1', { env, timeout: 10000 });
    return { success: true, message: stdout };
  } catch (error: unknown) {
    console.error("Rclone verify failed:", error);
    const err = error as { stderr?: string, message?: string };
    return { success: false, error: err.stderr || err.message || "Unknown verification error" };
  }
}


export async function listDirectories(dir: string) {
  try {
    const targetDir = dir || '/';
    // We only want directories, not files, for a backup source
    const items = await fs.promises.readdir(targetDir, { withFileTypes: true });
    const directories = items
      .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.')) // hide hidden dirs for cleanliness
      .map(dirent => ({
        name: dirent.name,
        path: path.join(/*turbopackIgnore: true*/ targetDir, dirent.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
      
    // Include a ".." option to go up, if not at root
    if (targetDir !== '/' && targetDir !== 'C:\\') {
      const parentDir = path.dirname(targetDir);
      directories.unshift({ name: '..', path: parentDir });
    }
    
    return { success: true, directories, currentPath: targetDir };
  } catch (error: unknown) {
    console.error("Failed to list directories:", error);
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

import { spawn } from 'child_process';

export async function runPlanNow(id: string) {
  const scriptPath = path.join(process.cwd(), 'run-backup.cjs');
  const p = spawn('node', [scriptPath, id], {
    detached: true,
    stdio: 'ignore'
  });
  p.unref();
  return { success: true };
}

export async function updateRemote(id: string, data: Prisma.RemoteUpdateInput) {
  if (data.config) {
    const configObj = JSON.parse(data.config as string);
    for (const key of ['pass', 'password', 'token', 'client_secret']) {
      if (configObj[key] && !isEncrypted(configObj[key])) {
        configObj[key] = encryptSecret(configObj[key]);
      }
    }
    data.config = JSON.stringify(configObj);
  }
  await prisma.remote.update({ where: { id }, data })
  await syncStateToDisk()
  revalidatePath('/remotes')
}

export async function updateSource(id: string, data: Prisma.SourceUpdateInput) {
  if (data.path) {
    try {
      fs.accessSync(data.path as string, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      throw new Error(`Path does not exist or the software lacks read/write permissions: ${data.path}`);
    }
  }
  await prisma.source.update({ where: { id }, data })
  await syncStateToDisk()
  revalidatePath('/sources')
}

export async function updatePlan(id: string, data: Prisma.PlanUncheckedUpdateInput) {
  if (data.encrypt && (!data.password || (typeof data.password === 'string' && data.password.trim() === ''))) {
    throw new Error("Password is required when encryption is enabled.");
  }
  if (data.password && typeof data.password === 'string' && !isEncrypted(data.password)) {
    data.password = encryptSecret(data.password);
  }
  await prisma.plan.update({ where: { id }, data })
  await syncStateToDisk()
  revalidatePath('/plans')
}


export async function syncStateToDisk() {
  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.yaml');
  let doc: any = {};
  
  if (fs.existsSync(/*turbopackIgnore: true*/ configPath)) {
    try {
      const fileContents = fs.readFileSync(/*turbopackIgnore: true*/ configPath, 'utf8');
      doc = yaml.load(fileContents) || {};
    } catch (e) {
      console.error("Failed to parse config.yaml", e);
    }
  }

  if (doc.auth) {
    delete doc.auth;
  }

  const remotes = await prisma.remote.findMany();
  const sources = await prisma.source.findMany();
  const plans = await prisma.plan.findMany();

  // Map to YAML format
  doc.remotes = remotes.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    config: JSON.parse(r.config || "{}")
  }));

  doc.sources = sources.map(s => ({
    id: s.id,
    name: s.name,
    path: s.path
  }));

  doc.plans = plans.map(p => ({
    id: p.id,
    name: p.name,
    sourceId: p.sourceId,
    remoteId: p.remoteId,
    schedule: p.schedule,
    encrypt: p.encrypt,
    enabled: p.enabled,
    remoteFolderPath: p.remoteFolderPath,
    backupPrefix: p.backupPrefix,
    password: p.password,
    status: p.status
  }));

  const newYaml = yaml.dump(doc, { lineWidth: -1 });
  fs.writeFileSync(configPath, newYaml, 'utf8');
  console.log('[Sync] Wrote state to config.yaml');
}

import { executeRcloneRestore } from '@/lib/rclone';

export async function executeRestore(planId: string, overridePassword?: string) {
  // Fire and forget, but return success immediately
  executeRcloneRestore(planId, overridePassword).catch(console.error);
  return { success: true };
}

export async function checkExportRequiresPassword() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return !!user?.password;
}

export async function exportDecryptedConfig(password?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new Error("User not found");
  
  if (user.password) {
    if (!password) throw new Error("Password required");
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error("Invalid password");
  }
  
  const remotes = await prisma.remote.findMany();
  const sources = await prisma.source.findMany();
  const plans = await prisma.plan.findMany();

  const doc: any = {};
  
  doc.remotes = remotes.map(r => {
    const config = JSON.parse(r.config || "{}");
    for (const key of ['pass', 'password', 'token', 'client_secret']) {
      if (config[key] && isEncrypted(config[key])) {
        config[key] = decryptSecret(config[key]);
      }
    }
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      config
    };
  });

  doc.sources = sources.map(s => ({
    id: s.id,
    name: s.name,
    path: s.path
  }));

  doc.plans = plans.map(p => {
    let plainPass = p.password;
    if (plainPass && isEncrypted(plainPass)) {
      plainPass = decryptSecret(plainPass);
    }
    return {
      id: p.id,
      name: p.name,
      sourceId: p.sourceId,
      remoteId: p.remoteId,
      schedule: p.schedule,
      encrypt: p.encrypt,
      enabled: p.enabled,
      remoteFolderPath: p.remoteFolderPath,
      backupPrefix: p.backupPrefix,
      password: plainPass,
      status: p.status
    };
  });

  return yaml.dump(doc, { lineWidth: -1 });
}

export async function markConfigValidated() {
  const { cookies } = await import('next/headers');
  (await cookies()).set('config_validated', 'true', { path: '/' });
}

export async function validateSourcePath(pathStr: string): Promise<{valid: boolean, error?: string}> {
  try {
    const fs = await import('fs');
    fs.accessSync(pathStr, fs.constants.R_OK | fs.constants.W_OK);
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: "Path does not exist or the software lacks read/write permissions" };
  }
}

export async function validateRemoteById(id: string): Promise<{valid: boolean, error?: string}> {
  try {
    const remote = await prisma.remote.findUnique({ where: { id } });
    if (!remote) return { valid: false, error: "Remote not found" };
    const res = await verifyRemoteConfig(remote.type, JSON.parse(remote.config || "{}"));
    if (res.success) return { valid: true };
    return { valid: false, error: res.error };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}
