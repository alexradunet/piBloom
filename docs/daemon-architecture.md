# Daemon Architecture

> 📖 [Emoji Legend](LEGEND.md)

Audience: maintainers changing daemon behavior or diagnosing room-runtime issues.

## 🌱 Why The Daemon Exists

`pi-daemon.service` is Bloom's always-on room runtime.

It exists to:

- bridge Matrix rooms into Pi sessions
- preserve room continuity outside interactive local sessions
- support both simple single-agent deployments and optional multi-agent overlays
- schedule proactive turns without external orchestration

## 📡 How The Daemon Works

Bloom has two runtime modes:

- single-agent mode: one Matrix identity, one Pi session per room
- multi-agent mode: one Matrix identity per agent overlay, one Pi session per `(room, agent)`

At startup:

1. Bloom loads `~/Bloom/Agents/*/AGENTS.md`
2. if no valid overlays exist, the daemon starts in single-agent fallback mode
3. if at least one valid overlay exists, the daemon starts in multi-agent mode
4. malformed overlays are skipped with warnings instead of aborting startup

### Single-Agent Path

Primary files:

- [`../core/daemon/single-agent-runtime.ts`](../core/daemon/single-agent-runtime.ts)
- [`../core/daemon/runtime/pi-room-session.ts`](../core/daemon/runtime/pi-room-session.ts)
- [`../core/daemon/room-failures.ts`](../core/daemon/room-failures.ts)

Current behavior:

- one Matrix identity: the primary Pi account
- one Pi session per room
- room alias lookup before first message preamble
- typing state while the agent is actively responding
- repeated room failures can quarantine that room temporarily
- Matrix send failures on final reply forwarding are best-effort and do not crash the runtime

### Multi-Agent Path

Primary files:

- [`../core/daemon/multi-agent-runtime.ts`](../core/daemon/multi-agent-runtime.ts)
- [`../core/daemon/agent-supervisor.ts`](../core/daemon/agent-supervisor.ts)
- [`../core/daemon/router.ts`](../core/daemon/router.ts)
- [`../core/daemon/room-state.ts`](../core/daemon/room-state.ts)

Current behavior:

- one Matrix client per configured agent identity
- one Pi session per `(room, agent)`
- routing based on host mode, mentions, cooldowns, and per-root reply budgets
- sequential handoff when multiple agents are explicitly targeted in order
- supervisor shutdown suppresses fresh handoffs and proactive dispatch

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
- room failure quarantine applies only to single-agent room sessions
- duplicate-event and cooldown state is bounded and pruned over time

## 🔗 Related

- [../AGENTS.md](../AGENTS.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [service-architecture.md](service-architecture.md)
