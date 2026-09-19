FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --include=optional --no-audit --no-fund

COPY . .

# Keep build-time database files out of the application image.
ENV TQA_DATA_DIR=/tmp/tqa-build-data
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TQA_DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /app /app

# Coolify mounts the persistent tqa-data volume at /data.
RUN mkdir -p /data/captures && chown -R node:node /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "scripts/start-container.mjs"]
