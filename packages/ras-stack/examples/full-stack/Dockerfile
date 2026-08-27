# syntax=docker/dockerfile:1
ARG RUNTIME_BINARIES_IMAGE=ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.1@sha256:581a691b59a603685bee8ba9576e80d419b967b63017f82d778fce39ca6f0c0b
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack install --global pnpm@11.15.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ras-stack/package.json ./packages/ras-stack/package.json
COPY packages/ras-stack/examples/full-stack/package.json ./packages/ras-stack/examples/full-stack/package.json
COPY packages/create-ras-app/package.json ./packages/create-ras-app/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm fetch --frozen-lockfile
COPY packages/ras-stack ./packages/ras-stack
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build && pnpm --filter @ras-stack/example-full-stack build

FROM ${RUNTIME_BINARIES_IMAGE} AS runtime-binaries

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache tini \
    && rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /data \
    && chown -R node:node /app /data
COPY --from=build --chown=node:node /app/packages/ras-stack/examples/full-stack/.output ./.output
COPY --from=runtime-binaries /usr/local/bin/centrifugo /usr/local/bin/centrifugo
COPY --from=runtime-binaries /usr/local/bin/caddy /usr/local/bin/caddy
COPY --chown=node:node packages/ras-stack/examples/full-stack/centrifugo.json ./centrifugo.json
COPY --chown=node:node packages/ras-stack/LICENSE ./
ENV NODE_ENV=production DATA_DIR=/data TRUST_PROXY=false CENTRIFUGO_CONFIG=/app/centrifugo.json CENTRIFUGO_API_URL=http://127.0.0.1:8100/api CENTRIFUGO_HTTP_SERVER_PORT=8100
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -q --spider http://127.0.0.1:3100/api/ready || exit 1
USER node
ENTRYPOINT ["/sbin/tini", "-g", "--", "node", ".output/server/containerRuntime.mjs"]
