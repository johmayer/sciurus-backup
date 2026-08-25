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
- **First-Time Setup**: If local auth is enabled and no admin exists, you will be automatically redirected to `/setup` on your first visit to create a Master Admin account. The password is securely hashed via `bcryptjs` and stored in the local SQLite database.
- **SSO Enforcement**: Setting `DISABLE_LOCAL_AUTH="true"` removes the login form entirely and routes all authentication exclusively through your configured OIDC provider.

## Declarative Configuration (GitOps) & Encryption Vault

Sciurus state can be entirely managed declaratively via a `config.yaml` file located in the project root. This file is bidirectionally synced: changes made in the UI update the YAML, and modifying the YAML directly syncs back (after a restart) to the database.

**Transparent Encryption:**
Sciurus features an automatic encryption vault. If you drop a `config.yaml` into the directory containing plaintext secrets (e.g. `client_secret`, `token`, `password`), Sciurus will automatically encrypt them using AES-256 on boot and rewrite the YAML file with secure `ENC[...]` blobs. The background worker uses the `CONFIG_ENCRYPTION_KEY` to decrypt them in memory for unattended backups. The unencrypted `config.yaml` can be exported from the settings page.

### `config.yaml` Structure

```yaml
# Cloud / Storage destinations
remotes:
  - name: my_drive
    type: drive # Any valid rclone remote type (although only SFTP, Google Drive, OneDrive and WebDAV are supported from the UI all types should work)
    config:
      # Key-value pairs for rclone configuration
      client_id: xxx
      # Secrets are automatically encrypted by Sciurus!
      client_secret: ENC[iv:ciphertext:authtag]
      token: ENC[...]

# Local directories to back up
sources:
  - name: documents
    path: /path/to/my/documents

# Scheduled Jobs
plans:
  - name: Daily Backup
    sourceName: documents
    remoteName: my_drive
    schedule: '0 0 * * *' # Standard Cron syntax
    encrypt: true # Natively wrap the remote in rclone crypt
    password: ENC[...] # Automatically encrypted
    enabled: true
    remoteFolderPath: /backups/
    backupPrefix: my_daily_backup
    status: Active
```