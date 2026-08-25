<div align="center">
  <img src="public/logo.png" width="200" alt="Sciurus Logo" />
  <h1>Sciurus</h1>
</div>

Sciurus is a self-hosted, web-based backup tool powered by `rclone`. It features a full-stack Next.js (App Router) architecture, utilizing an embedded Prisma SQLite database and Auth.js for robust authentication.


## Features
- Manage rclone remotes from the browser (SFTP, WebDAV, Google Drive, OneDrive, etc.).
- Automated scheduling for background backups via a dedicated `worker.ts`.
- Support for `rclone crypt` for encrypted backups.
- SSO via **OIDC** (Authelia, Keycloak, Authentik, etc.) or local credentials.

## Prerequisites
- Node.js (v20+)
- `rclone` (Ensure `rclone` is installed and available in the system PATH if running locally without Docker)

## Setup Instructions (Development)

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Initialize Database:**
   ```bash
   npx prisma db push
   ```
3. **Run the Next.js server:**
   ```bash
   npm run dev
   ```
4. **Run the background scheduler (in a separate terminal):**
   ```bash
   npx tsx --env-file=.env worker.ts
   ```

## Production Docker Deployment (Recommended)

Sciurus includes a production-ready Dockerfile that bundles Next.js, the background cron worker, and the `rclone` binary into a single container!

You can build and run it locally:
```bash
docker build -t sciurus .
docker run -p 3000:3000 sciurus
```

The repository is also configured with a GitHub Actions workflow (`.github/workflows/docker.yml`) that automatically builds the Docker image and publishes it to the GitHub Container Registry (`ghcr.io`).


## Environment Variables

Sciurus uses environment variables for secure, server-level configurations. You should create a `.env` file at the root of the project. Or pass the environment variables to the docker container.

```env
# Required: Generate a secure secret for session encryption (e.g., openssl rand -base64 32)
AUTH_SECRET="your_secure_random_string"

# Required: Encryption key for securing config.yaml secrets (e.g., openssl rand -base64 32)
CONFIG_ENCRYPTION_KEY="your_secure_encryption_key"

# Optional: Path to your GitOps config file (default: ./config.yaml)
CONFIG_PATH="./config.yaml"

# SSO / OIDC Configuration (Optional)
# Supports Authelia, Keycloak, Authentik, etc.
OIDC_ISSUER="https://sso.yourdomain.com"
OIDC_CLIENT_ID="sciurus"
OIDC_CLIENT_SECRET="your_client_secret"
OIDC_NAME="Authelia" # Changes the login button text

# Optional: Disable local credentials to strictly enforce OIDC SSO
DISABLE_LOCAL_AUTH="true"
```

## Authentication & Onboarding

Sciurus supports secure local authentication and Generic OIDC SSO:
- **First-Time Setup**: On your first visit, you will be automatically redirected to `/setup` to create a Master Admin account, **regardless** of your SSO configuration. This secures your local vault and ensures you always have a fallback "break-glass" login if your OIDC provider goes offline. The password is securely hashed via `bcryptjs` and stored in the local SQLite database.

## Declarative Configuration (GitOps) & Encryption Vault

Sciurus state can be entirely managed declaratively via a `config.yaml` file located in the project root. This file is bidirectionally synced: changes made in the UI update the YAML, and modifying the YAML directly syncs back (after a restart) to the database.

**Transparent Encryption:**
Sciurus features an automatic encryption vault. If you drop a `config.yaml` into the directory containing plaintext secrets (e.g. `client_secret`, `token`, `password`), Sciurus will automatically encrypt them using AES-256 on boot and rewrite the YAML file with secure `ENC[...]` blobs. The background worker uses the `CONFIG_ENCRYPTION_KEY` to decrypt them in memory for unattended backups. The unencrypted `config.yaml` can be exported from the settings page.

### `config.yaml` Reference Guide

The `config.yaml` file is divided into three main sections: `remotes`, `sources`, and `plans`. 

#### 1. Remotes (Cloud / Storage Destinations)
Remotes define where your backups are sent. They map 1:1 with standard `rclone` remotes.

- `name` *(string)*: A unique, friendly identifier for this remote (e.g., `my_google_drive`).
- `type` *(string)*: The rclone remote type. Common options include `drive` (Google Drive), `onedrive` (Microsoft OneDrive), `sftp`, `webdav`, `s3`, `dropbox`, `b2`, etc. Sciurus supports *any* valid rclone type.
- `config` *(object)*: Key-value pairs matching the exact rclone configuration fields for the chosen `type`. 
  - Examples: `user`, `host`, `url`, `client_id`, `client_secret`, `token`.
  - **Security Note:** Any fields named `pass`, `password`, `token`, or `client_secret` will be automatically encrypted by Sciurus upon startup and replaced with secure `ENC[...]` blobs.

#### 2. Sources (Local Directories)
Sources define the local folders on the server (or inside the Docker container) that you want to back up.

- `name` *(string)*: A unique, friendly identifier for this source (e.g., `app_database`, `docker_volumes`).
- `path` *(string)*: The absolute path to the directory on the local filesystem (e.g., `/var/lib/docker/volumes`). **Note:** Sciurus will test this path on startup; the software must have both read and write permissions to this folder.

#### 3. Plans (Scheduled Jobs)
Plans glue a Source and a Remote together, defining when and how the backup should occur.

- `name` *(string)*: A friendly name for the backup job.
- `sourceName` *(string)*: Must exactly match the `name` of a Source defined above.
- `remoteName` *(string)*: Must exactly match the `name` of a Remote defined above.
- `schedule` *(string)*: A standard cron expression defining the backup frequency (e.g., `'0 0 * * *'` for daily at midnight, `'*/15 * * * *'` for every 15 minutes).
- `enabled` *(boolean)*: `true` or `false`. If `false`, the background worker will ignore this schedule. Defaults to `true`.
- `encrypt` *(boolean)*: `true` or `false`. If `true`, Sciurus will automatically wrap the target destination in an `rclone crypt` overlay, encrypting filenames and file contents before they leave the server.
- `password` *(string)*: Required if `encrypt` is `true`. The master password used to encrypt the backup. Sciurus will automatically encrypt this string in the YAML file.
- `remoteFolderPath` *(string)*: The specific directory path inside the remote destination where backups should be stored (e.g., `/server_backups/app_data/`). Defaults to `""` (the root of the remote).
- `backupPrefix` *(string)*: A prefix string used to name the backup folder/archive on the remote. Defaults to `"backup"`.
- `status` *(string)*: Tracks the health of the plan. Typically set to `"Active"`, but can also be `"Paused"` or `"Failed"`.

### Example `config.yaml`
```yaml
remotes:
  - name: my_drive
    type: drive
    config:
      client_id: my_oauth_id
      client_secret: ENC[iv:ciphertext:authtag] # Auto-encrypted!
      token: ENC[...]

sources:
  - name: documents
    path: /path/to/my/documents

plans:
  - name: Daily Backup
    sourceName: documents
    remoteName: my_drive
    schedule: '0 0 * * *'
    encrypt: true
    password: ENC[...] # Auto-encrypted!
    enabled: true
    remoteFolderPath: /backups/
    backupPrefix: my_daily_backup
    status: Active
```