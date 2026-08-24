import prisma from './src/lib/db';
import fs from 'fs'
import path from 'path'
import * as yaml from 'js-yaml'
import { encryptSecret, isEncrypted } from './src/lib/encryption' // Adjust path since we are in root



async function syncConfig() {
  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.yaml')
  
  if (!fs.existsSync(configPath)) {
    console.log('[Sync] No config.yaml found, skipping declarative sync.')
    return
  }

  console.log(`[Sync] Reading config from ${configPath}...`)
  const fileContents = fs.readFileSync(configPath, 'utf8')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = yaml.load(fileContents)

  if (!doc) {
    console.log('[Sync] config.yaml is empty.')
    return
  }
  
  let needsRewrite = false;

  // Clean out legacy auth credentials block
  if (doc.auth) {
    console.log('[Sync] Cleaning plaintext auth from config.yaml...')
    delete doc.auth;
    needsRewrite = true;
  }

  // Sync Remotes
  if (doc.remotes && Array.isArray(doc.remotes)) {
    console.log(`[Sync] Found ${doc.remotes.length} remotes. Syncing...`)
    for (const remote of doc.remotes) {
      if (remote.config) {
        for (const key of ['pass', 'password', 'token', 'client_secret']) {
          if (remote.config[key] && !isEncrypted(remote.config[key])) {
            remote.config[key] = encryptSecret(remote.config[key]);
            needsRewrite = true;
          }
        }
      }
      
      await prisma.remote.upsert({
        where: { id: remote.id || `remote-${remote.name}` },
        update: {
          name: remote.name,
          type: remote.type,
          config: JSON.stringify(remote.config || {})
        },
        create: {
          id: remote.id || `remote-${remote.name}`,
          name: remote.name,
          type: remote.type,
          config: JSON.stringify(remote.config || {})
        }
      })
    }
  }

  // Sync Sources
  if (doc.sources && Array.isArray(doc.sources)) {
    console.log(`[Sync] Found ${doc.sources.length} sources. Syncing...`)
    for (const source of doc.sources) {
      await prisma.source.upsert({
        where: { id: source.id || `source-${source.name}` },
        update: {
          name: source.name,
          path: source.path
        },
        create: {
          id: source.id || `source-${source.name}`,
          name: source.name,
          path: source.path
        }
      })
    }
  }

  // Sync Plans
  if (doc.plans && Array.isArray(doc.plans)) {
    console.log(`[Sync] Found ${doc.plans.length} plans. Syncing...`)
    for (const plan of doc.plans) {
      let sourceId = plan.sourceId
      let remoteId = plan.remoteId

      if (!sourceId && plan.sourceName) {
        const source = await prisma.source.findFirst({ where: { name: plan.sourceName } })
        if (source) sourceId = source.id
      }

      if (!remoteId && plan.remoteName) {
        const remote = await prisma.remote.findFirst({ where: { name: plan.remoteName } })
        if (remote) remoteId = remote.id
      }
      
      if (plan.password && !isEncrypted(plan.password)) {
        plan.password = encryptSecret(plan.password);
        needsRewrite = true;
      }

      if (sourceId && remoteId) {
        await prisma.plan.upsert({
          where: { id: plan.id || `plan-${plan.name}` },
          update: {
            name: plan.name,
            schedule: plan.schedule,
            encrypt: plan.encrypt || false,
            enabled: plan.enabled !== false,
            remoteFolderPath: plan.remoteFolderPath || "",
            backupPrefix: plan.backupPrefix || "backup",
            password: plan.password || "",
            status: plan.status || "Active",
            sourceId,
            remoteId
          },
          create: {
            id: plan.id || `plan-${plan.name}`,
            name: plan.name,
            schedule: plan.schedule,
            encrypt: plan.encrypt || false,
            enabled: plan.enabled !== false,
            remoteFolderPath: plan.remoteFolderPath || "",
            backupPrefix: plan.backupPrefix || "backup",
            password: plan.password || "",
            status: plan.status || "Active",
            sourceId,
            remoteId
          }
        })
      } else {
        console.warn(`[Sync] Could not resolve Source or Remote for plan: ${plan.name}`)
      }
    }
  }
  
  if (needsRewrite) {
    console.log('[Sync] Rewriting config.yaml to persist encrypted secrets.');
    fs.writeFileSync(configPath, yaml.dump(doc), 'utf8');
  }

  console.log('[Sync] Finished syncing config.yaml')
}

syncConfig().catch(console.error)
