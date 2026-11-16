# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
FROM ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.9@sha256:b72916b0db314c9cdaab83142b845e3cba77777c44ecefaaf9e2661c24b5e164 AS runtime-binaries

FROM node:24-alpine AS build
WORKDIR /app
# A native module with no prebuilt binary for the image's platform and libc compiles from source.
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack install
RUN pnpm install --frozen-lockfile
COPY . .
# The PostHog project token is public, since it ships in the browser bundle; the upload key arrives as a secret instead.
ARG VITE_POSTHOG_PROJECT_TOKEN VITE_POSTHOG_HOST POSTHOG_UPLOAD_SOURCEMAPS POSTHOG_CLI_PROJECT_ID POSTHOG_CLI_HOST
RUN --mount=type=secret,id=posthog_cli_api_key,env=POSTHOG_CLI_API_KEY pnpm build

FROM node:24-alpine
WORKDIR /app
RUN apk upgrade --no-cache \
    && apk add --no-cache tini \
    && rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm /opt/yarn-* \
    && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir /data \
    && chown node:node /data
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts/database.ts /app/scripts/databaseFile.ts ./.output/server/
COPY --from=runtime-binaries /usr/local/bin/caddy /usr/local/bin/caddy
COPY --from=runtime-binaries /usr/local/bin/centrifugo /usr/local/bin/centrifugo
COPY --chown=node:node centrifugo.json ./
COPY --chown=node:node scripts/realtime.ts ./scripts/
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "scripts/realtime.ts", "container"]
