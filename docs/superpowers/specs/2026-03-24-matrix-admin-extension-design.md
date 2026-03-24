# Matrix Admin Extension Design

**Date:** 2026-03-24
**Status:** Ready for implementation
**Topic:** Give the pi agent the ability to issue Continuwuity admin commands from within Matrix

---

## Overview

The pi agent (nixpi-daemon) runs as a Matrix room supervisor on a local Continuwuity homeserver. Currently it can only send and receive messages. This extension gives it a new Pi tool — `matrix_admin` — that sends `!admin` commands to the Continuwuity admin room, captures the server bot's response, and returns it to the agent.

Continuwuity has no REST admin API yet. All admin operations are performed by sending `!admin <subcommand>` messages to the server's `#admins:nixpi` room, where the built-in server bot (`@conduit:nixpi`) replies with results.

---

## Architecture

### Approach

A self-contained Pi extension (`matrix-admin`) that calls the Continuwuity Matrix Client-Server API directly via `fetch`. No daemon changes required.

### Data Flow

```
Pi agent calls matrix_admin tool
  → GET /sync?timeout=0&filter=admin-room-only  — capture current `since` token (lightweight, no long-poll)
  → POST !admin <command> to admin room via CS API
  → GET /sync?since=<token>&timeout=15000&filter=admin-room-only  — long-poll for reply
  → find first m.room.message from @conduit:nixpi in timeline events (by event ordering)
  → return { ok: true, response: "<server reply>" }
```

**Since token capture:** A `GET /sync?timeout=0` immediately before the send call returns the current stream position with no waiting. The `since` token is captured *before* the send. Any reply the bot sends after the send — regardless of when the long-poll is issued — will appear at a position after the token and will therefore be returned by the long-poll. The extension does not skip events; it reads all timeline events in the batch ordered by server timestamp and returns the first one from `@conduit:nixpi`.

**Response correlation:** The extension correlates responses by event ordering, not content matching. It takes the first `m.room.message` event from `@conduit:nixpi` that arrives after the `since` token. Concurrent calls are serialised via a per-extension mutex (see Concurrency section below).

### Concurrency

Concurrent `matrix_admin` calls are serialised with a single async mutex held for the duration of each call (token capture → send → poll → return). If a second call arrives while one is in flight, it queues and runs after the first completes. This prevents `since` token overlap and response cross-contamination.

The timeout clock starts when the mutex is acquired and the call begins executing — not when the tool is invoked. A call waiting in the queue does not consume its timeout.

### Credentials

Uses `@pi:nixpi`'s existing access token from `~/.pi/matrix-credentials.json`. No new credentials needed.

### Admin Room Discovery

On first use, the extension resolves `#admins:nixpi` via `GET /_matrix/client/v3/directory/room/%23admins%3Anixpi` to obtain the canonical room ID, then caches it in `~/.pi/matrix-admin.json`. Subsequent calls use the cached room ID directly.

**Cache invalidation:** If a send call returns a 403 or 404 (room not found / not joined), the extension discards the cached room ID, re-runs discovery once, updates the cache, and retries the send. If discovery also fails, it returns `{ ok: false, error: "admin room not found" }`.

---

## Tool Interface

```typescript
tool: "matrix_admin"

input: {
  command: string          // e.g. "users create-user --username alex --password s3cr3t"
  body?: string            // optional newline-delimited list for bulk codeblock commands
  await_response?: boolean // default true; false for fire-and-forget
  timeout_ms?: number      // default 15000
}

output: {
  ok: boolean
  response?: string        // server bot reply text
  error?: string           // "timeout" | "send failed: <status>" | "admin room not found"
}
```

The `command` value is everything after `!admin `. The extension prepends the prefix automatically. Codeblock formatting via `body` is always applied before the send, regardless of `await_response`. If `body` is passed for a command that does not require a codeblock, it is still appended as a codeblock — it is the caller's responsibility to pass `body` only for appropriate commands.

### Codeblock Commands

Some commands require a newline-delimited list in a Markdown codeblock (e.g. `deactivate-all`, `ban-list-of-rooms`). Pass the list via the `body` field:

```typescript
{
  command: "rooms moderation ban-list-of-rooms",
  body: "!badroom1:nixpi\n!badroom2:nixpi"
}
```

The extension formats the full message as:

```
!admin rooms moderation ban-list-of-rooms
```
!badroom1:nixpi
!badroom2:nixpi
```
```

---

## File Structure

### New files

```
core/pi/extensions/matrix-admin/
  index.ts      — tool definition and registration
  client.ts     — Matrix CS API: send message, incremental sync, room discovery
  commands.ts   — typed command catalogue, dangerous command list, and pre-send command transformations
```

**Command transformations** are owned by `commands.ts`. Before `client.ts` sends any message, `commands.ts` applies any required mutations to the command string. Current transformations:

- `users force-join-list-of-local-users` — appends `--yes-i-want-to-do-this` automatically if not already present

### Modified files

```
core/pi/extensions/index.ts   — register the matrix-admin extension
```

### Config sidecar (auto-created on first run)

```
~/.pi/matrix-admin.json
{
  "adminRoomId": "!abc123:nixpi"
}
```

The `~/.pi/` directory is guaranteed to exist before the extension runs — it is created during first-boot setup and also holds `matrix-credentials.json`. The extension does not need to create it.

---

## Full Command Surface

### `!admin users`

| Command | Description | Dangerous |
|---|---|---|
| `users list-users` | List all local users | |
| `users create-user --username <u> --password <p>` | Create a user | |
| `users reset-password <@u:nixpi> --password <p>` | Reset password | |
| `users deactivate <@u:nixpi>` | Deactivate user, removes from rooms | ⚠️ |
| `users deactivate-all` | Deactivate list of users (codeblock) | ⚠️ |
| `users logout <@u:nixpi>` | Invalidate all access tokens | ⚠️ |
| `users suspend <@u:nixpi>` | Can read but not send | |
| `users unsuspend <@u:nixpi>` | Reverse suspend | |
| `users lock <@u:nixpi>` | Temporary deactivation | |
| `users unlock <@u:nixpi>` | Reverse lock | |
| `users enable-login <@u:nixpi>` | Allow new sessions | |
| `users disable-login <@u:nixpi>` | Block new sessions | |
| `users list-joined-rooms <@u:nixpi>` | List rooms a user is in | |
| `users force-join-room <@u:nixpi> <roomId>` | Force join user to room | |
| `users force-leave-room <@u:nixpi> <roomId>` | Force leave | |
| `users force-demote <@u:nixpi> <roomId>` | Drop power level to default | |
| `users make-user-admin <@u:nixpi>` | Grant server-admin privileges | ⚠️ |
| `users redact-event <@u:nixpi> <eventId>` | Force-redact an event | |
| `users force-join-list-of-local-users <roomId> --yes-i-want-to-do-this` | Bulk force-join (codeblock); extension appends flag automatically when this command is used | ⚠️ |
| `users force-join-all-local-users <roomId>` | Join all local users to room | ⚠️ |

### `!admin rooms`

| Command | Description | Dangerous |
|---|---|---|
| `rooms list-rooms` | List all rooms the server knows about | |
| `rooms info <roomId>` | View room details | |
| `rooms info list-joined-members <roomId>` | List joined members | |
| `rooms info view-room-topic <roomId>` | View room topic | |
| `rooms moderation ban-room <room>` | Ban room, evict all local users | ⚠️ |
| `rooms moderation ban-list-of-rooms` | Bulk ban (codeblock) | ⚠️ |
| `rooms moderation unban-room <room>` | Unban room | |
| `rooms moderation list-banned-rooms` | List banned rooms | |
| `rooms alias set <#alias:nixpi> <roomId>` | Set a room alias | |
| `rooms alias remove <alias>` | Remove a local alias | |
| `rooms alias which <alias>` | Which room uses an alias | |
| `rooms alias list` | List all aliases | |
| `rooms directory publish <roomId>` | Publish to room directory | |
| `rooms directory unpublish <roomId>` | Unpublish from directory | |
| `rooms directory list` | List published rooms | |
| `rooms exists <roomId>` | Check if room is known | |

### `!admin server`

| Command | Description | Dangerous |
|---|---|---|
| `server uptime` | Time since startup | |
| `server show-config` | Show all config values (contains secrets — do not display output unless user asks) | ⚠️ |
| `server reload-config` | Reload config from disk | |
| `server memory-usage` | DB memory stats | |
| `server clear-caches` | Clear all caches | |
| `server backup-database` | Online RocksDB backup | |
| `server list-backups` | List DB backups | |
| `server admin-notice <message>` | Send message to admin room | |
| `server reload-mods` | Hot-reload server | |
| `server restart` | Restart server | ⚠️ |
| `server shutdown` | Shutdown server | ⚠️ |

### `!admin federation`

| Command | Description | Dangerous |
|---|---|---|
| `federation incoming-federation` | List rooms handling incoming PDU | |
| `federation disable-room <roomId>` | Disable incoming federation for room | ⚠️ |
| `federation enable-room <roomId>` | Re-enable federation for room | |
| `federation fetch-support-well-known <server>` | Fetch `/.well-known/matrix/support` | |
| `federation remote-user-in-rooms <@u:server>` | List shared rooms with remote user | |

### `!admin media`

| Command | Description | Dangerous |
|---|---|---|
| `media delete <mxc or eventId>` | Delete single media file | |
| `media delete-list` | Delete list of MXC URLs (codeblock) | ⚠️ |
| `media delete-past-remote-media -b <duration>` | Delete remote media older than duration | ⚠️ |
| `media delete-all-from-user <@u:nixpi>` | Delete all local media from user | ⚠️ |
| `media delete-all-from-server <server>` | Delete all remote media from server | ⚠️ |
| `media delete-url-preview [--all]` | Delete cached URL previews | |

### `!admin appservices`

| Command | Description | Dangerous |
|---|---|---|
| `appservices list-registered` | List all registered appservices | |
| `appservices register` | Register appservice (YAML codeblock) | |
| `appservices unregister <id>` | Unregister appservice | ⚠️ |
| `appservices show-appservice-config <id>` | Show appservice config | |

### `!admin token`

| Command | Description | Dangerous |
|---|---|---|
| `token list` | List all registration tokens | |
| `token create` | Create a new registration token | |
| `token create --token <t>` | Create token with specific value | |
| `token create --uses-allowed <n>` | Create token limited to N uses | |
| `token create --expiry-time <ts>` | Create token with expiry timestamp | |
| `token destroy --token <t>` | Permanently delete a token | ⚠️ |
| `token disable --token <t>` | Disable a token without deleting | |
| `token enable --token <t>` | Re-enable a disabled token | |

### `!admin check` / `!admin debug` / `!admin query`

These namespaces are pass-through: the extension accepts any `command` string starting with `check`, `debug`, or `query` and forwards it without validation. No commands in these namespaces are pre-catalogued in `commands.ts`. None are listed in agent instructions — use only when explicitly requested by the user.

Dangerous flag: `debug force-set-room-state-from-server` and `query raw raw-del` should be treated as ⚠️ if the agent ever surfaces them.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Timeout (no reply within 15s) | `{ ok: false, error: "timeout" }` |
| HTTP error sending message | `{ ok: false, error: "send failed: <status>" }` |
| Since token capture fails (non-200) | `{ ok: false, error: "sync failed: <status>" }` — abort, do not send |
| Long-poll sync returns HTTP error | `{ ok: false, error: "sync error: <status>" }` — do not retry |
| Server bot replies with error text | `{ ok: true, response: "<error text>" }` — agent reads and reports |
| Admin room ID not found / not joined | Retry discovery once, update cache; if still fails: `{ ok: false, error: "admin room not found" }` |
| `await_response: false` | Send and return `{ ok: true }` immediately; `timeout_ms` is ignored |
| Credentials file missing or malformed | Fatal throw at extension init — tool is not registered; startup error is logged |
| Concurrent call while one is in flight | Queued behind mutex; runs after current call completes; timeout clock starts at mutex acquisition |

---

## Agent Instructions (to add to AGENTS.md)

```markdown
## Matrix Admin Commands

Use the `matrix_admin` tool to manage the Continuwuity homeserver.
Pass the command string exactly as shown below (without the `!admin` prefix).

### Rules
- Commands marked ⚠️ are destructive or irreversible. Always confirm with the user before running them.
- For bulk operations requiring a codeblock, pass the newline-delimited list in the `body` field.
- If a command returns an error, report it verbatim and ask the user how to proceed.
- `server show-config` contains secrets — do not display the full output unless the user asks.

### Common commands
- `users list-users` — list all local users
- `users create-user --username <u> --password <p>` — create a user
- `users reset-password <@u:nixpi> --password <p>` — reset password
- `users deactivate <@u:nixpi>` — deactivate user ⚠️
- `users make-user-admin <@u:nixpi>` — grant admin ⚠️
- `users force-join-room <@u:nixpi> <roomId>` — force join
- `users list-joined-rooms <@u:nixpi>` — list user's rooms
- `rooms list-rooms` — list all rooms
- `rooms info <roomId>` — room details
- `rooms alias set <#alias:nixpi> <roomId>` — set alias
- `rooms directory publish <roomId>` — publish to directory
- `rooms moderation ban-room <roomId>` — ban room ⚠️
- `server uptime` — server uptime
- `server memory-usage` — memory stats
- `server clear-caches` — clear caches
- `server restart` — restart server ⚠️
- `server shutdown` — shutdown server ⚠️
- `appservices list-registered` — list bridges
- `appservices unregister <id>` — remove bridge ⚠️
```

---

## Testing Plan

1. **Unit tests** — mock CS API responses; verify sync polling logic, codeblock formatting, timeout handling
2. **Integration test** — register a test user via `users create-user`, verify it appears in `users list-users`, deactivate it
3. **Timeout test** — simulate no server reply; verify graceful `{ ok: false, error: "timeout" }` return
4. **Admin room discovery** — clear cache, verify room is found and cached on first call
5. **Dangerous command guard** — parse AGENTS.md and assert each ⚠️ command from the catalogue appears in the dangerous list in agent instructions
6. **Concurrency** — fire two simultaneous calls; verify responses are not cross-contaminated and both complete successfully with correct responses
