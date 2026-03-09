# Matrix Messaging Design

**Date:** 2026-03-09
**Status:** Approved

## Goal

Replace WhatsApp and Signal with a self-hosted Matrix stack as the core messaging backbone of Bloom. Fully open-source, European-hosted, no US data dependencies.

## Motivation

- Full data sovereignty: all messages stay on the local Bloom machine
- No dependency on WhatsApp (Meta/USA) or Signal (USA)
- Matrix is an open standard with many client options (Element, FluffyChat, etc.)
- Future bridges to other platforms plug into Matrix, not custom channel transports

## Architecture

```
User's Matrix Client (Element, FluffyChat, etc.)
        |
        |  Matrix CS API (HTTP :6167)
        v
+--------------------+
|  bloom-matrix      |  Continuwuity homeserver (Rust, SQLite)
|  Port 6167         |  No federation, registration token
+--------------------+
        ^
        |  Matrix CS API (HTTP, bloom.network internal)
        |
+--------------------+
|  bloom-element     |  Node.js bridge transport
|  matrix-bot-sdk    |  Logs in as @pi:bloom
|  Port 18803        |  Health check endpoint
+--------------------+
        |
        |  Unix socket (channel protocol)
        v
+--------------------+
|  bloom-channels    |  Existing channel bridge extension
|  (Pi extension)    |  -> Pi Agent
+--------------------+
```

Both containers on `bloom.network`. Only bloom-matrix exposes port 6167 to the host for external Matrix clients.

## Components

### bloom-matrix (Continuwuity homeserver)

- **Image:** `forgejo.ellis.link/continuwuation/continuwuity:latest`
- **Non-optional:** Baked into the OS image, always running
- **Config (env vars):**
  - `CONTINUWUITY_SERVER_NAME=bloom`
  - `CONTINUWUITY_DATABASE_PATH=/var/lib/continuwuity`
  - `CONTINUWUITY_PORT=6167`
  - `CONTINUWUITY_ALLOW_FEDERATION=false`
  - `CONTINUWUITY_ALLOW_REGISTRATION=true`
  - `CONTINUWUITY_REGISTRATION_TOKEN=<generated-at-install>`
  - `CONTINUWUITY_ADDRESS=0.0.0.0`
- **Volume:** `bloom-matrix-data` -> `/var/lib/continuwuity`
- **Pi user:** Created on first start via `--execute "users create_user pi"`
- **Health check:** HTTP GET on port 6167

### bloom-element (bridge transport)

- **Image:** `localhost/bloom-element:latest` (built from `services/element/`)
- **Non-optional:** Baked into the OS image, always running
- **Follows existing service template:** Node.js, same structure as former whatsapp/signal services
- **Dependencies:** `matrix-bot-sdk`, `SimpleFsStorageProvider`
- **Behavior:**
  - Logs in as `@pi:bloom` via password, caches access token
  - `AutojoinRoomsMixin` — Pi auto-joins any room it's invited to
  - Receives messages via Matrix sync loop -> forwards to bloom-channels Unix socket
  - Receives responses from bloom-channels -> sends via `client.sendText()`
  - Media: downloads Matrix media via SDK, saves to `/var/lib/bloom/media/`
  - Sender allowlist via `BLOOM_ALLOWED_SENDERS` (Matrix user IDs, optional)
- **Health check:** Port 18803
- **Volume:** `bloom-element-data` -> `/data` (bot state + access token cache)

### Pairing flow

1. bloom-matrix starts automatically, `@pi:bloom` user exists
2. `service_pair("element")` generates a registration token and displays it + server URL
3. User registers their account from any Matrix client
4. User creates a DM with `@pi:bloom`
5. Pi auto-joins, messaging works

### Catalog entry

```yaml
matrix:
  description: "Continuwuity Matrix homeserver"
  category: communication
  image: forgejo.ellis.link/continuwuation/continuwuity:latest
  version: "0.1.0"
  optional: false
  dependencies: []

element:
  description: "Matrix bridge for Pi messaging"
  category: communication
  image: localhost/bloom-element:latest
  version: "0.1.0"
  optional: false
  dependencies: [matrix, stt]
```

## Removals

- Delete `services/whatsapp/` entirely
- Delete `services/signal/` entirely
- Remove whatsapp and signal from `services/catalog.yaml`
- Remove `/wa` and `/signal` commands from bloom-channels extension
- Update skills referencing WhatsApp/Signal
- Update docs: service-architecture.md, channel-protocol.md

## Configuration

- **No federation:** Fully isolated server, only local users
- **No E2EE between Pi and server:** Server is local, Pi owns it. Users can use E2EE between their own devices.
- **Registration token:** Generated during setup, required to register new accounts

## Future: Bridging other platforms

If WhatsApp, Signal, Telegram, or other platforms are desired later, they connect as Matrix bridges (e.g., mautrix-whatsapp, mautrix-signal) that register with the Continuwuity server. The bloom-element transport stays the same — it only sees Matrix messages regardless of origin.

## Technology choices

| Component | Technology | Reason |
|-----------|-----------|--------|
| Homeserver | Continuwuity (Rust) | Lightweight, single binary, SQLite, European community |
| Bot SDK | matrix-bot-sdk (TypeScript) | Fits Node.js service template, well-maintained, simple API |
| Auth | Local admin API + password login | Simplest approach, fits existing service_pair flow |
| Encryption | Server-only (no E2EE for bot) | Pi owns the server, crypto state adds complexity |
| Federation | Disabled | Private server, zero external attack surface |
