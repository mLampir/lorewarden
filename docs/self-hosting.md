# Hosting Lorewarden yourself

Every release is published as a Docker image for `linux/amd64` and `linux/arm64`:

```
ghcr.io/mlampir/lorewarden
```

| Tag | Follows |
|---|---|
| `latest` | the newest release |
| `0.2` | the newest `0.2.x` release |
| `0.2.0` | exactly this release |

While Lorewarden is below 1.0, a new minor version can change a lot, so pinning a minor version such as `0.2` is the safer choice for a server you rely on.

## Running it

A Linux server with Docker Compose. Save this as `compose.yaml`:

```yaml
services:
  lorewarden:
    image: ghcr.io/mlampir/lorewarden:latest
    restart: unless-stopped
    # Host networking lets the game master app on this server (or through an SSH tunnel) count as
    # "this computer"; see "The game master app" below.
    network_mode: host
    environment:
      LOREWARDEN_HOST: 127.0.0.1
      LOREWARDEN_PORT: 47616
    volumes:
      - ./adventures:/data
```

```sh
mkdir adventures && sudo chown 1000:1000 adventures   # the container runs as user 1000
docker compose up -d
```

Your adventures and session logs are kept as JSON files in `./adventures`, outside the container, so they survive every update. Back up that folder like any other.

## HTTPS with a reverse proxy

Lorewarden itself speaks plain HTTP. Put a reverse proxy in front of it for HTTPS, for example nginx:

```nginx
server {
    listen 443 ssl;
    server_name lorewarden.example.org;
    # ssl_certificate ... as usual

    location / {
        proxy_pass http://127.0.0.1:47616;
        # A fixed host name: Lorewarden only treats requests for "localhost" as the game master,
        # so a forged Host header must not reach it.
        proxy_set_header Host $server_name;
        # The player app receives reveals as server-sent events, which must not be buffered.
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

The server sends a keep-alive every 25 seconds, so proxies such as Cloudflare keep the event stream open.

## The game master app

Through the proxy, players reach the player app at `https://lorewarden.example.org/play/`. The game master app and its API answer only requests from the server itself, because Lorewarden has no sign-in yet. Until it does, open the game master app through an SSH tunnel:

```sh
ssh -L 47616:localhost:47616 your-server
```

and then http://localhost:47616 in your browser.

## Updates

The server asks GitHub twice a day whether a newer release is out. If so, the settings icon in the game master app gets a dot and the settings page shows the new version with a link to its release notes. Nothing updates on its own; to update, run on the server:

```sh
docker compose pull && docker compose up -d
```

To turn the check off, set `LOREWARDEN_UPDATE_CHECK: "off"` in `environment`. Builds from source (`pnpm start`) never check, as they have no release version.

## Publishing a release

For maintainers: push a tag such as `v0.2.0`. The release workflow builds and pushes the image, then creates the GitHub release that running servers look for. The very first image is private on the GitHub Container Registry; make the package public once in its package settings.
