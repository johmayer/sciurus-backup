#!/bin/sh

# Push database migrations (SQLite will be created in /app/prisma/prod.db if it doesn't exist)
npx prisma db push

# Kill any existing background workers to prevent duplicates
pkill -f "worker.cjs" || true

ENV_ARGS=""
if [ -f .env ]; then
  ENV_ARGS="--env-file=.env"
fi

# Start the background worker for cron schedules in the background
node $ENV_ARGS sync-config.cjs
node $ENV_ARGS worker.cjs &

# Start the Next.js standalone server
export NODE_ENV=production
node $ENV_ARGS server.js
