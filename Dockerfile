FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apt-get update && apt-get install -y curl unzip sudo procps && \
    sudo -v ; curl https://rclone.org/install.sh | sudo bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# We use SQLite, so we need to generate the Prisma client before building
RUN npx prisma generate
RUN npx esbuild worker.ts --bundle --platform=node --target=node20 --outfile=worker.cjs --format=cjs
RUN npx esbuild sync-config.ts --bundle --platform=node --target=node20 --outfile=sync-config.cjs --format=cjs
RUN npx esbuild run-backup.ts --bundle --platform=node --target=node20 --outfile=run-backup.cjs --format=cjs
RUN sed -i 's|import_meta\.url|"file://" + __filename|g' worker.cjs sync-config.cjs run-backup.cjs
RUN npx prisma db push
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a dedicated user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install Prisma CLI globally to run migrations in start.sh
RUN npm i -g prisma@5.22.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/worker.cjs ./worker.cjs
COPY --from=builder --chown=nextjs:nodejs /app/sync-config.cjs ./sync-config.cjs
COPY --from=builder --chown=nextjs:nodejs /app/run-backup.cjs ./run-backup.cjs
COPY --from=builder --chown=nextjs:nodejs /app/start.sh ./start.sh

RUN chmod +x ./start.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./start.sh"]
