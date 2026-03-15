# Daemon Architecture

> 📖 [Emoji Legend](LEGEND.md)

Audience: maintainers changing daemon behavior or diagnosing room-runtime issues.

## 🌱 Why The Daemon Exists

`pi-daemon.service` is Bloom's always-on room runtime.

It exists to:

- bridge Matrix rooms into Pi sessions
- preserve room continuity outside interactive local sessions
- support simple default-host deployments and optional multi-agent overlays
- schedule proactive turns without external orchestration

## 📡 How The Daemon Works

Bloom runs through one supervisor/runtime path:

- if valid agent overlays exist, it uses those Matrix identities
- if no valid overlays exist, it synthesizes a default host agent from the primary Pi account
- session management is always one Pi session per `(room, agent)`

At startup:

1. Bloom loads `~/Bloom/Agents/*/AGENTS.md`
2. if no valid overlays exist, the daemon synthesizes a default host agent from the primary Pi credentials
3. malformed overlays are skipped with warnings instead of aborting startup

### Runtime Path

Primary files:

- [`../core/daemon/multi-agent-runtime.ts`](../core/daemon/multi-agent-runtime.ts)
- [`../core/daemon/agent-supervisor.ts`](../core/daemon/agent-supervisor.ts)
- [`../core/daemon/router.ts`](../core/daemon/router.ts)
- [`../core/daemon/room-state.ts`](../core/daemon/room-state.ts)

Current behavior:

- one Matrix client per configured or synthesized agent identity
- one Pi session per `(room, agent)`
- routing based on host mode, the first eligible explicit mention, cooldowns, and per-root reply budgets
- supervisor shutdown suppresses fresh message and proactive dispatch

### Proactive Jobs

Agent overlays may declare proactive jobs in frontmatter:

```yaml
proactive:
  jobs:
    - id: daily-heartbeat
      kind: heartbeat
      room: "!ops:bloom"
      interval_minutes: 1440
      prompt: |
        Review the room and host state.
        Reply HEARTBEAT_OK if nothing needs surfacing.
      quiet_if_noop: true
      no_op_token: HEARTBEAT_OK
    - id: morning-check
      kind: cron
      room: "!ops:bloom"
      cron: "0 9 * * *"
      prompt: Send the morning operational check-in.
```

Current rules:

- `heartbeat` jobs use `interval_minutes`
- `cron` jobs support `@hourly`, `@daily`, and fixed `minute hour * * *`
- proactive job ids must be unique per `(room, id)` within one agent overlay
- scheduler state is persisted per `(agent, room, job)`
- heartbeat failures back off by the configured interval instead of tight-loop retrying
- heartbeat replies can be suppressed when `quiet_if_noop: true` and the reply exactly matches `no_op_token`

## 📚 Reference

Important implementation files:

- [`../core/daemon/index.ts`](../core/daemon/index.ts): bootstrap and mode selection
- [`../core/daemon/contracts/matrix.ts`](../core/daemon/contracts/matrix.ts): Matrix bridge contract
- [`../core/daemon/runtime/matrix-js-sdk-bridge.ts`](../core/daemon/runtime/matrix-js-sdk-bridge.ts): Matrix SDK transport bridge
- [`../core/daemon/runtime/pi-room-session.ts`](../core/daemon/runtime/pi-room-session.ts): Pi SDK-backed session lifecycle
- [`../core/daemon/lifecycle.ts`](../core/daemon/lifecycle.ts): startup retry/backoff helper
- [`../core/daemon/scheduler.ts`](../core/daemon/scheduler.ts): proactive heartbeat and cron scheduling
- [`../core/daemon/proactive.ts`](../core/daemon/proactive.ts): proactive dispatch helpers

Important current failure behavior:

- startup uses retry/backoff instead of one-shot failure
- malformed agent overlays are skipped, not fatal
- duplicate-event and cooldown state is bounded and pruned over time

## 🔗 Related

- [../AGENTS.md](../AGENTS.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [service-architecture.md](service-architecture.md)
