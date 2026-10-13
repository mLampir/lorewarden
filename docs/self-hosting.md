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

Without Compose, the same container starts with:

```sh
docker run -d --name lorewarden --restart unless-stopped \
  -p 127.0.0.1:47616:47616 -v ./adventures:/data -e LOREWARDEN_TRUST_PROXY=1 \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  ghcr.io/mlampir/lorewarden:latest
```

Compose keeps these options in one file, which makes updates simpler: with `docker run`, an update means stopping and removing the container and starting it again with the same options.

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

Players reach the player app at `https://lorewarden.example.org/play/`, the game master app is at `https://lorewarden.example.org/`. Whoever opens the bare address without being signed in first picks *Game master* (then the password) or *Player* (then the player app); the browser remembers the choice, and a phone that has been at the table before goes straight to the player app. The sign-up link of a party also works from there, so players can enter their characters from home before the game day.

## AI assistants

A hosted Lorewarden offers its tools for AI assistants at `https://lorewarden.example.org/mcp`. In Claude, add it as a custom connector with that address; other apps that speak the [Model Context Protocol](https://modelcontextprotocol.io) with OAuth work the same way. The app sends you to Lorewarden, where you sign in and allow it. Nothing needs to be installed or configured on your computer, and it works in the Claude apps on the web and on phones too.

The settings page of the game master app shows the address and how many assistants are connected, and disconnects them all. Changing the password disconnects them as well. Lorewarden needs a password before an assistant can connect.

Lorewarden takes its public address from the requests the proxy passes on (`Host` and `X-Forwarded-Proto`). If that does not fit, set it with `LOREWARDEN_PUBLIC_URL: https://lorewarden.example.org`.

The [Lorewarden MCP server](../packages/mcp/README.md) on your own computer also still works with a hosted Lorewarden. It needs the server's address and its token for programs, which is kept next to the adventures:

```sh
docker compose exec lorewarden cat /data/.lorewarden/token
```

Pass both with `--server https://lorewarden.example.org --token ...`. Keep the token as secret as the password.

## Updates

The server asks GitHub twice a day whether a newer release is out. If so, the settings icon in the game master app gets a dot and the settings page shows the new version with a link to its release notes. To update by hand, run on the server:

```sh
docker compose pull && docker compose up -d
```

To turn the check off, set `LOREWARDEN_UPDATE_CHECK: "off"` in `environment`. Builds from source (`pnpm start`) never check, as they have no release version.

### Updating from the app

With the optional updater container, the settings page gets an **Update** button and a switch to update automatically at night. Lorewarden itself never gets access to Docker: that would mean root on your server for an app that is reachable from the internet. Only the updater gets the Docker socket. It publishes no port, sits in a Docker network that only Lorewarden reaches and that has no way out to the internet, and does nothing without a token that only it and Lorewarden know. Even with the token, it can only update Lorewarden to the newest image of the tag in `compose.yaml`.

An update goes like this: the updater downloads the new image while Lorewarden keeps running, stops Lorewarden, copies the `adventures` folder to `backups`, and starts a new Lorewarden container with the same settings. If that one does not report itself healthy within three minutes, the updater removes it, puts the backup back and starts the old version again. The settings page shows how the last update went. The three newest backups are kept.

Create the token once, next to `compose.yaml`:

```sh
echo "LOREWARDEN_UPDATER_TOKEN=$(openssl rand -hex 32)" > .env
chmod 600 .env
mkdir backups
```

Then extend `compose.yaml`. The Lorewarden container needs a fixed name, the token and the second network; the rest stays as above:

```yaml
services:
  lorewarden:
    image: ghcr.io/mlampir/lorewarden:latest
    # The updater finds the container by this name (or set LOREWARDEN_CONTAINER in the updater).
    container_name: lorewarden
    environment:
      LOREWARDEN_UPDATER_TOKEN: ${LOREWARDEN_UPDATER_TOKEN}
      # ... the other settings as above
    networks:
      - default
      - updater
    # ... ports, volumes and the security options as above

  updater:
    image: ghcr.io/mlampir/lorewarden-updater:latest
    restart: unless-stopped
    environment:
      LOREWARDEN_UPDATER_TOKEN: ${LOREWARDEN_UPDATER_TOKEN}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      # The same folder as Lorewarden's /data, to back it up and put it back.
      - ./adventures:/data
      - ./backups:/backups
    networks:
      - updater
    read_only: true
    cap_drop:
      - ALL
    cap_add:
      # Copies and restores files that belong to Lorewarden's user.
      - CHOWN
      - DAC_OVERRIDE
      - FOWNER
    security_opt:
      - no-new-privileges:true

networks:
  updater:
    # Lorewarden reaches the updater here; nothing in this network reaches the internet.
    internal: true
```

```sh
docker compose up -d
```

Automatic updates start between 3 and 5 at night in the server's time zone, which is UTC in the container unless you set `TZ: Europe/Berlin` or similar in Lorewarden's `environment`. A release that did not work is not tried again: Lorewarden stays on its version, the settings page says why, and the button is still there. Automatic updates need the update check, so they do not work with `LOREWARDEN_UPDATE_CHECK: "off"`.

Some things to know:

- The updater follows the tag in `compose.yaml`. With `0.2`, it updates within `0.2.x`; for `0.3`, change the tag and run `docker compose up -d` yourself.
- The updater does not update itself. Its image is rebuilt with every release, mainly for security fixes in its base image, and you update it with `docker compose pull && docker compose up -d` whenever you like.
- To go back to a backup by hand: `docker compose stop lorewarden`, copy the folder from `backups` into `adventures`, `sudo chown -R 1000:1000 adventures` and `docker compose start lorewarden`.
- Without a password, the update button only works on the server itself, like everything else in the game master app.

## Publishing a release

For maintainers: publish a release such as `v0.2.0` on GitHub. Its tag starts the release workflow, which builds both images, `lorewarden` and `lorewarden-updater`, and pushes them to the GitHub Container Registry. Running servers see the release right away, a few minutes before the image is ready; an automatic update that comes too early finds no new image yet and tries again half an hour later. The very first image of each package is private on the GitHub Container Registry; make the package public once in its package settings.
