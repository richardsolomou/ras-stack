# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
# A native module with no prebuilt binary for the image's platform and libc compiles from source.
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack install
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
RUN apk upgrade --no-cache \
    && apk add --no-cache tini \
    && rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm /opt/yarn-* \
    && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir /data \
    && chown node:node /data
COPY --from=build --chown=node:node /app/.output ./.output
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
