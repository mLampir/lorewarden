# Optional companion container that updates a self-hosted Lorewarden. See docs/self-hosting.md.
# Build it from the repository root: docker build -f packages/updater/Dockerfile .

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @lorewarden/updater
RUN pnpm --filter @lorewarden/updater build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/packages/updater/dist/lorewarden-updater.js ./
COPY LICENSE ./
# Runs as root: it needs the Docker socket, and it backs up and restores files of any owner.
# It publishes no port; only Lorewarden reaches it, inside a Docker network of their own.
EXPOSE 47617
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -q -O /dev/null http://localhost:47617/health || exit 1
CMD ["node", "lorewarden-updater.js"]
