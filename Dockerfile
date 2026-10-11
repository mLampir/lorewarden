# Lorewarden server with both apps, for hosting it yourself. See docs/self-hosting.md.

# The build output is plain JavaScript, so it is built once on the build machine for every platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
ARG LOREWARDEN_VERSION=dev
RUN LOREWARDEN_VERSION=${LOREWARDEN_VERSION} pnpm -r build

FROM node:22-alpine
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
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -q -O /dev/null http://localhost:47616/play/ || exit 1
CMD ["node", "packages/server/dist/lorewarden-server.js"]
