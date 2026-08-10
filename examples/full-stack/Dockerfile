# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack install --global pnpm@11.15.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY examples/full-stack/package.json ./examples/full-stack/package.json
RUN pnpm fetch --frozen-lockfile
COPY config ./config
COPY dist ./dist
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json tsconfig.build.json LICENSE README.md ./
COPY examples/full-stack ./examples/full-stack
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build && pnpm --filter @ras-stack/example-full-stack build

FROM centrifugo/centrifugo:v6.9.1 AS centrifugo
FROM caddy:2.11.4-alpine AS caddy

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache tini && mkdir -p /data && chown -R node:node /app /data
COPY --from=build --chown=node:node /app/examples/full-stack/.output ./.output
COPY --from=centrifugo /usr/local/bin/centrifugo /usr/local/bin/centrifugo
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy
COPY --chown=node:node examples/full-stack/centrifugo.json ./centrifugo.json
COPY --chown=node:node LICENSE ./
ENV NODE_ENV=production DATA_DIR=/data CENTRIFUGO_CONFIG=/app/centrifugo.json CENTRIFUGO_API_URL=http://127.0.0.1:8100/api CENTRIFUGO_HTTP_SERVER_PORT=8100
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -q --spider http://127.0.0.1:3100/api/health || exit 1
USER node
ENTRYPOINT ["/sbin/tini", "-g", "--", "node", ".output/server/container-runtime.mjs"]
