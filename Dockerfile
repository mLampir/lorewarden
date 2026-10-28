# Lorewarden server with both apps, for hosting it yourself. See docs/self-hosting.md.

# The build output is plain JavaScript, so it is built once on the build machine for every platform.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /src
# Node 25 and newer no longer ship corepack, which installs the pnpm version from package.json.
RUN npm install -g corepack@0.36.0 && corepack enable
# The dependencies first, so a change to the sources does not install them again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dm/package.json apps/dm/
COPY apps/player/package.json apps/player/
COPY packages/content/package.json packages/content/
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY packages/server/package.json packages/server/
COPY packages/updater/package.json packages/updater/
RUN pnpm install --frozen-lockfile
COPY . .
ARG LOREWARDEN_VERSION=dev
RUN LOREWARDEN_VERSION=${LOREWARDEN_VERSION} pnpm -r build

FROM node:26-alpine
WORKDIR /app
# The server is one bundled file; it finds the apps at ../../../apps/*/dist from its own folder.
COPY --from=build /src/packages/server/dist packages/server/dist
COPY --from=build /src/apps/dm/dist apps/dm/dist
COPY --from=build /src/apps/player/dist apps/player/dist
COPY LICENSE ./
ENV LOREWARDEN_DIR=/data \
    LOREWARDEN_PORT=47616
RUN mkdir /data && chown node:node /data \
  # "docker compose exec lorewarden lorewarden reset-password" and other commands.
  && printf '#!/bin/sh\nexec node /app/packages/server/dist/lorewarden-server.js "$@"\n' \
    > /usr/local/bin/lorewarden \
  && chmod +x /usr/local/bin/lorewarden
VOLUME /data
USER node
EXPOSE 47616
# Shell form, so the check follows LOREWARDEN_PORT when it is changed.
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${LOREWARDEN_PORT:-47616}/play/" || exit 1
CMD ["node", "packages/server/dist/lorewarden-server.js"]
