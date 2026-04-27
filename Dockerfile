FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 compiles from source when no matching prebuild exists.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --include=dev

COPY . .

RUN test -f index.html && test -f src/main.tsx && test -f vite.config.ts

ENV NODE_ENV=production
EXPOSE 8080

RUN npm run lint && npm run build

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
