---
name: cinny
version: 0.1.0
description: Cinny Matrix web client for browser-based messaging with Pi
image: ghcr.io/cinnyapp/cinny:v4.3.0
---

# Cinny Web Client

Lightweight Matrix web client accessible at `http://<host>/cinny`.

## Overview

Cinny provides a browser-based interface for messaging Pi and other Matrix users on the local Bloom homeserver. It runs as a Podman container and is proxied through nginx.

## Setup

Install via service tools:

- `service_install(name="cinny")`

Or declare in manifest:

- `manifest_set_service(name="cinny", image="ghcr.io/cinnyapp/cinny:v4.3.0", version="0.1.0", enabled=true)`

The config file at `~/.config/bloom/cinny-config.json` is created automatically during installation.

## Usage

1. Open `http://<host>/cinny` in a browser
2. Register with the registration token (from `/var/lib/continuwuity/registration_token`)
3. Create a DM with `@pi:bloom`

## Configuration

- Config: `~/.config/bloom/cinny-config.json`
- Homeserver: uses the same origin (`/`) — nginx proxies `/_matrix/` to the local homeserver
- Container port: 18810 (proxied by nginx)

## Replacing with Another Client

To use a different Matrix web client (Element Web, FluffyChat, etc.):

1. Remove Cinny: `systemctl --user stop bloom-cinny && rm ~/.config/containers/systemd/bloom-cinny.container`
2. Install your preferred client as a new service
3. Update nginx config if needed

## Troubleshooting

- Logs: `journalctl --user -u bloom-cinny -n 50`
- Status: `systemctl --user status bloom-cinny`
- Restart: `systemctl --user restart bloom-cinny`
