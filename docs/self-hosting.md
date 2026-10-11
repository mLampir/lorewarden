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
    # Only the reverse proxy on this server reaches Lorewarden.
    ports:
      - "127.0.0.1:47616:47616"
    environment:
      # The proxy passes on the visitor's address, so sign-in attempts are limited per visitor.
      LOREWARDEN_TRUST_PROXY: "1"
    volumes:
      - ./adventures:/data
    # Lorewarden writes only to /data and needs no special rights.
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
```

```sh
mkdir adventures && sudo chown 1000:1000 adventures   # the container runs as user 1000
docker compose up -d
```

Your adventures and session logs are kept as JSON files in `./adventures`, outside the container, so they survive every update. Back up that folder like any other.

## Choosing the password

The game master app asks for a password everywhere once there is one. A new server has none yet, so it prints a setup link when it starts:

```sh
docker compose logs lorewarden
```

```
Lorewarden has no password yet. To use it from another computer, open /setup?token=... at its address and choose one, or set LOREWARDEN_PASSWORD.
```

Open `https://lorewarden.example.org/setup?token=...` and choose a password of at least 12 characters. Only someone who can read the server's log has the link, and it stops working once there is a password. You can change the password later in the game master app's settings; that signs out every other browser. A sign-in lasts 30 days.

Instead, you can set the password in `compose.yaml`. It then takes the place of the one chosen in the app and can only be changed there:

```yaml
    environment:
      LOREWARDEN_PASSWORD_FILE: /run/secrets/lorewarden_password   # or LOREWARDEN_PASSWORD: "..."
```

Forgot the password? This removes it and prints a new setup link:

```sh
docker compose exec lorewarden lorewarden reset-password
```

After five wrong passwords, an address has to wait 15 minutes. The same holds for 20 wrong join codes in the player app.

## HTTPS with a reverse proxy

Lorewarden itself speaks plain HTTP. Put a reverse proxy in front of it for HTTPS, with a certificate from Let's Encrypt or any other. For example nginx:

```nginx
server {
    listen 443 ssl;
    server_name lorewarden.example.org;
    # ssl_certificate ... as usual

    location / {
        proxy_pass http://127.0.0.1:47616;
        proxy_set_header Host $host;
        # The visitor's address, for the limit on sign-in attempts (LOREWARDEN_TRUST_PROXY).
        proxy_set_header X-Real-IP $remote_addr;
        # Lets Lorewarden mark its sign-in cookie as HTTPS only.
        proxy_set_header X-Forwarded-Proto $scheme;
        # The player app receives reveals as server-sent events, which must not be buffered.
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

Or Caddy, which gets the certificate on its own:

```
lorewarden.example.org {
    reverse_proxy 127.0.0.1:47616 {
        header_up X-Real-IP {remote_host}
        flush_interval -1
    }
}
```

The server sends a keep-alive every 25 seconds, so proxies and CDNs in front of it keep the event stream open. If another proxy or a CDN sits in front of nginx, configure nginx's `real_ip` module so that `$remote_addr` is the visitor's address. Without a proxy that sets `X-Real-IP`, leave `LOREWARDEN_TRUST_PROXY` out: otherwise anybody could send the header and get around the limit.

Players reach the player app at `https://lorewarden.example.org/play/`, the game master app is at `https://lorewarden.example.org/`.

## AI assistants

The [Lorewarden MCP server](../packages/mcp/README.md) on your own computer can work with a hosted Lorewarden. It needs the server's address and its token for programs, which is kept next to the adventures:

```sh
docker compose exec lorewarden cat /data/.lorewarden/token
```

Pass both to the MCP server with `--server https://lorewarden.example.org --token ...`. Keep the token as secret as the password.

## Updates

The server asks GitHub twice a day whether a newer release is out. If so, the settings icon in the game master app gets a dot and the settings page shows the new version with a link to its release notes. Nothing updates on its own; to update, run on the server:

```sh
docker compose pull && docker compose up -d
```

To turn the check off, set `LOREWARDEN_UPDATE_CHECK: "off"` in `environment`. Builds from source (`pnpm start`) never check, as they have no release version.

## Publishing a release

For maintainers: push a tag such as `v0.2.0`. The release workflow builds and pushes the image, then creates the GitHub release that running servers look for. The very first image is private on the GitHub Container Registry; make the package public once in its package settings.
