FROM node:20-bookworm-slim

WORKDIR /app

# Cloud Run: set DB_DRIVER=pg to skip the native toolchain (better-sqlite3 prebuild usually
# suffices on bookworm; python/make/g++ are only needed when node-gyp must compile sqlite).
ARG DB_DRIVER=sqlite
RUN if [ "$DB_DRIVER" != "pg" ]; then \
    apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
    && rm -rf /var/lib/apt/lists/*; \
  fi
ENV DB_DRIVER=${DB_DRIVER}

# .npmrc must be present before `npm ci` (legacy-peer-deps for OpenAI/zod peer mismatch).
# --include=dev: CI / Cloud Build often sets NODE_ENV=production; without this, npm ci skips
# devDependencies and `npm run lint` (tsc) fails because typescript is not installed.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps --include=dev

COPY . .

# Fail fast if the Git/archive context is missing the Vite entry (common when
# `src/` was never pushed or a wrong build context is used).
RUN test -f index.html && test -f src/main.tsx && test -f vite.config.ts

ENV NODE_ENV=production
# Cloud Run sets PORT (default 8080). Do not bake PORT=3000 here — it can prevent the
# process from binding the port the platform health-checks.
EXPOSE 8080

# Type-check then bundle (matches local `npm run lint` + `npm run build`).
RUN npm run lint && npm run build

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
