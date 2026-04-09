FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 compiles from source when no matching prebuild exists (common on newer Node
# or non-default platforms). bookworm-slim omits python/make/g++, which breaks node-gyp.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Fail fast if the Git/archive context is missing the Vite entry (common when
# `src/` was never pushed or a wrong build context is used).
RUN test -f index.html && test -f src/main.tsx && test -f vite.config.ts

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Type-check then bundle (matches local `npm run lint` + `npm run build`).
RUN npm run lint && npm run build

CMD ["npm", "run", "start"]
