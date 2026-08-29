# Sciurus Backup

Sciurus Backup is a management interface and scheduler for `rclone` backups, built with a Rust (Axum) backend and a React (Vite) frontend.

## Architecture

* **Backend**: `backend/` (Rust, Axum, Tokio, SQLx, SQLite)
  * Features an integrated cron scheduler (`tokio-cron-scheduler`).
  * Direct execution of `rclone` subprocesses.
  * AES-GCM encryption for stored secrets.
* **Frontend**: `frontend/` (React, Vite, React Router, Tailwind v4, Shadcn)
  * Standard SPA communicating over REST API routes (`/api`).
* **Database**: SQLite

## Getting Started

### Prerequisites
* [Rust](https://rustup.rs/) (cargo, rustc)
* npm (Only required for building the frontend)
* [Rclone](https://rclone.org/) (Must be installed on the host system)
* SQLite3

### 1. Backend Setup

The backend handles the API routing, background scheduling, and SQLite database connections.

```bash
cd backend

# Copy the example environment file
cp .env.example .env

# Start the server (Listens on 127.0.0.1:3001)
# The database will be created and initialized automatically!
cargo run
```

### 2. Frontend Setup

The frontend runs purely in the browser. In development mode, Vite will proxy `/api` calls directly to the backend.

```bash
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

Visit `http://localhost:5173` to access the dashboard.


## Environment Variables

Sciurus Backend relies on environment variables for configuration. Below is a detailed breakdown of which variables are required and which are optional.

| Variable | Requirement | Default | Description |
|----------|-------------|---------|-------------|
| `AUTH_SECRET` | **Required** | | A secure, long, random string used to sign web session cookies. In development, a random string is generated if missing. In production, you must set this to persist login sessions across reboots. |
| `CONFIG_ENCRYPTION_KEY` | **Required** | | Base64-encoded AES-256 key used to securely encrypt remote secrets (like API tokens) inside `config.yaml`. Generate one using: `openssl rand -base64 32` |
| `DATABASE_URL` | Optional | `sqlite://data/sciurus.db` | Path to the SQLite database. By default, it stores data in the `./data` directory which is optimal for Docker volume mounts. |
| `CONFIG_PATH` | Optional | `config.yaml` | Path to the declarative configuration file. |
| `PORT` | Optional | `3001` | The port the backend listens on. |
| `DISABLE_LOCAL_AUTH` | Optional | `false` | If set to `"true"`, completely disables local password login and mandates OIDC. |
| `OIDC_ISSUER` | Optional | | The root URL of your OpenID Connect issuer (e.g. Authentik, Keycloak). Required if configuring OIDC. |
| `OIDC_CLIENT_ID` | Optional | | Your OIDC Client ID. Required if configuring OIDC. |
| `OIDC_CLIENT_SECRET`| Optional | | Your OIDC Client Secret. Required if configuring OIDC. |
| `OIDC_NAME` | Optional | `Single Sign-On (OIDC)` | The display name for the login button (e.g. `"Authentik"`). |
| `OIDC_WELL_KNOWN_URL`| Optional | *(derived from issuer)* | Explicit override for the OIDC discovery document URL if the default `{issuer}/.well-known/openid-configuration` fails. |

## Declarative Configuration (`config.yaml`)

Sciurus supports a declarative GitOps approach via a `config.yaml` file. On startup, Sciurus syncs the objects defined in this file to its database. 

Plain-text secrets (like rclone passwords or API tokens) found in `config.yaml` are automatically encrypted on startup (using your `CONFIG_ENCRYPTION_KEY`), and the YAML file is instantly rewritten to safely persist the encrypted values.

### Structure and Options

```yaml
# Optional: Pre-configure the local admin user
auth:
  username: admin
  password: my-secure-password

# Define storage locations you want to back up
sources:
  - id: my-local-server         # Optional: Defaults to name if omitted
    name: "My Local Server"
    path: /app/data             # The absolute path to the directory being backed up

# Define rclone storage destinations
remotes:
  - id: aws-s3                  # Optional: Defaults to name if omitted
    name: "AWS S3 Backup"
    type: s3                    # The rclone backend type (e.g., s3, drive, b2)
    config:
      provider: AWS
      access_key_id: AKIA...
      secret_access_key: secret # Will be automatically encrypted!
      region: us-east-1

# Define backup schedules that link a Source to a Remote
plans:
  - id: daily-s3-backup         # Optional: Defaults to name if omitted
    name: "Daily S3 Backup"
    schedule: "0 0 2 * * *"     # Standard cron expression (Seconds Minutes Hours Day Month DayOfWeek)
    sourceId: my-local-server   # ID of the source to backup (can also use sourceName)
    remoteId: aws-s3            # ID of the remote destination (can also use remoteName)
    remoteFolderPath: backups   # Optional: Subdirectory within the remote
    backupPrefix: my-server     # Optional: Prefix for the backup archive (defaults to "backup")
    encrypt: true               # Whether to encrypt the backup archive
    password: archive-password  # Optional: Password for the encrypted archive (Will be automatically encrypted in this file!)
    enabled: true               # Optional: Defaults to true
```


## Production Deployment

Sciurus can be easily deployed in production using Docker or Kubernetes. The application is packaged as a single lightweight Alpine Linux container that serves both the frontend and the backend.

### Docker

You can run the application using `docker run`:

```bash
docker run -d \
  -p 3001:3001 \
  -v sciurus_data:/app/data \
  -v /path/to/your/config.yaml:/app/config.yaml \
  -e AUTH_SECRET="your-super-secret-key" \
  -e CONFIG_ENCRYPTION_KEY="your-base64-encryption-key" \
  ghcr.io/johmayer/sciurus-backup:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  sciurus:
    image: ghcr.io/johmayer/sciurus-backup:latest
    ports:
      - "3001:3001"
    volumes:
      # Persists the SQLite database
      - sciurus_data:/app/data
      # Mount the declarative config file (Optional)
      - ./config.yaml:/app/config.yaml
      # Mount paths from the host system that you want to back up
      - /path/on/host/to/backup:/mnt/backup_source:ro
    environment:
      - AUTH_SECRET=your-super-secret-key
      - CONFIG_ENCRYPTION_KEY=your-base64-encryption-key
      # Optional: OIDC Configuration
      # - OIDC_CLIENT_ID=your-client-id
      # - OIDC_CLIENT_SECRET=your-client-secret
      # - OIDC_ISSUER=https://auth.example.com
      # - OIDC_WELL_KNOWN_URL=https://auth.example.com/.well-known/openid-configuration

volumes:
  sciurus_data:
```

### Kubernetes

A basic Kubernetes deployment configuration:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sciurus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sciurus
  template:
    metadata:
      labels:
        app: sciurus
    spec:
      containers:
      - name: sciurus
        image: ghcr.io/johmayer/sciurus-backup:latest
        ports:
        - containerPort: 3001
        env:
        - name: AUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: sciurus-secrets
              key: auth-secret
        - name: CONFIG_ENCRYPTION_KEY
          valueFrom:
            secretKeyRef:
              name: sciurus-secrets
              key: config-encryption-key
        volumeMounts:
        - name: data
          mountPath: /app/data
        # Optional: Mount your config.yaml from a ConfigMap
        - name: config
          mountPath: /app/config.yaml
          subPath: config.yaml
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: sciurus-pvc
      - name: config
        configMap:
          name: sciurus-config
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: sciurus-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```
