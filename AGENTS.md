# AGENTS.md

> 📖 [Emoji Legend](docs/LEGEND.md)

This file is the Bloom reference index for current tools, hooks, runtime paths, and packaged capabilities.

## 🌱 Current Model

Bloom extends Pi through three mechanisms:

| Layer | What | Current use |
|------|------|-------------|
| 📜 Skill | bundled or user-created `SKILL.md` files | guidance, procedures, service docs |
| 🧩 Extension | in-process TypeScript | tools, hooks, commands, stateful host integration |
| 📦 Service | packaged container workloads | optional long-running user services |

OS-level infrastructure is separate from service packages and baked into the image:

- `bloom-matrix.service`
- `netbird.service`
- `pi-daemon.service`

Repository structure note:

- `core/` is Bloom itself: OS image assets, daemon, persona, bundled skills, built-in extensions, and shared runtime code
- `core/pi-extensions/` contains all Pi-facing Bloom extensions, including dev and repo helpers

## 🌿 Bloom Directory

Default Bloom home is `~/Bloom/` unless `BLOOM_DIR` is set.

| Path | Purpose |
|------|---------|
| `~/Bloom/Persona/` | active persona files |
| `~/Bloom/Skills/` | installed and seeded skills |
| `~/Bloom/Evolutions/` | proposed persona / system evolutions |
| `~/Bloom/Objects/` | flat-file object store |
| `~/Bloom/Episodes/` | append-only episodic memory |
| `~/Bloom/Agents/` | multi-agent overlays (`AGENTS.md`) |
| `~/Bloom/manifest.yaml` | declarative service manifest |
| `~/Bloom/guardrails.yaml` | command-block policy override |
| `~/Bloom/blueprint-versions.json` | blueprint seeding state |

Related state outside `~/Bloom/`:

| Path | Purpose |
|------|---------|
| `~/.pi/` | Pi runtime state |
| `~/.pi/bloom-context.json` | compacted Bloom context |
| `~/.pi/matrix-credentials.json` | primary Matrix credentials |
| `~/.pi/matrix-agents/` | per-agent Matrix credentials |
| `~/.pi/agent/sessions/bloom-rooms/` | daemon session directories |
| `~/.config/containers/systemd/` | installed Quadlet units |
| `~/.config/systemd/user/` | user socket units and user services |
| `~/.config/bloom/` | service env/config files |

## 🧩 Extensions

### `bloom-persona`

Purpose:

- seed Bloom identity into Pi
- enforce shell guardrails
- inject a compact durable-memory digest at session start
- persist compacted context

Hooks:

- `session_start` sets the session name to `Bloom`
- `before_agent_start` injects persona plus restored compacted context and durable-memory digest
- `tool_call` blocks matching `bash` commands using the compiled guardrail policy
- `session_before_compact` saves context and adds compaction guidance

Notes:

- guardrails are a safety net for obvious dangerous shell patterns, not a security boundary
- invalid regex entries in guardrail config are skipped with an error log

### `bloom-localai`

Purpose:

- register LocalAI as a Pi provider for local LLM inference

Notes:

- llama-server (from `pkgs.llama-cpp`) runs on port `11435` with the `Qwen3.5-4B-Q4_K_M` model pre-seeded
- no tools or hooks — provider registration only

### `bloom-os`

Purpose:

- host OS management for NixOS, systemd, containers, and updates

Tools:

- `nixos_update`
- `container`
- `systemd_control`
- `system_health`
- `update_status`
- `schedule_reboot`

Hooks:

- `before_agent_start` injects pending-update guidance once per session

### `bloom-repo`

Purpose:

- bootstrap and sync the repo clone in `~/.bloom/pi-bloom`
- submit PRs through a fork/upstream workflow

Tools:

- `bloom_repo`
  - actions: `configure`, `status`, `sync`
- `bloom_repo_submit_pr`

### `bloom-services`

Purpose:

- scaffold service packages
- install packaged services
- manage declarative service state and Matrix bridges

Tools:

- `service_scaffold`
- `service_install`
- `service_test`
- `manifest_show`
- `manifest_sync`
- `manifest_set_service`
- `manifest_apply`
- `bridge_create`
- `bridge_remove`
- `bridge_status`

Hooks:

- `session_start` reports service and manifest status to the UI

Notes:

- `service_install` rebuilds `localhost/*` images during install instead of trusting an already-present mutable tag
- `manifest_apply` attempts persistent `enable --now` / `disable --now` first, then falls back to start/stop when the unit cannot be enabled
- corrupt `~/Bloom/manifest.yaml` files are moved aside to `manifest.yaml.corrupt-*` before Bloom recreates an empty manifest

### `bloom-episodes`

Purpose:

- append episodic memory files to `~/Bloom/Episodes/`
- preserve raw observations before consolidation into durable objects

Tools:

- `episode_create`
- `episode_list`
- `episode_promote`
- `episode_consolidate`

### `bloom-objects`

Purpose:

- flat-file durable memory objects in `~/Bloom/Objects/`

Tools:

- `memory_create`
- `memory_update`
- `memory_upsert`
- `memory_read`
- `memory_query`
- `memory_search`
- `memory_link`
- `memory_list`

### `bloom-garden`

Purpose:

- create and seed the Bloom directory
- discover skills
- provision Matrix agents
- record persona evolutions

Tools:

- `garden_status`
- `skill_create`
- `skill_list`
- `agent_create`
- `mention_agent`
- `persona_evolve`

Hooks / commands:

- `session_start`
- `resources_discover`
- `/bloom` with `init`, `status`, `update-blueprints`

### `bloom-dev`

Purpose:

- on-device developer workflow helpers

Tools:

- `dev_enable`
- `dev_disable`
- `dev_status`
- `dev_code_server`
- `dev_build`
- `dev_switch`
- `dev_rollback`
- `dev_loop`
- `dev_test`
- `dev_submit_pr`
- `dev_push_skill`
- `dev_push_service`
- `dev_push_extension`
- `dev_install_package`

Notes:

- most tools are gated by the dev sentinel in `~/.bloom/.dev-enabled`

### `bloom-setup`

Purpose:

- track Pi-side completion of the post-wizard persona setup

Tools:

- `setup_status`
- `setup_advance`
- `setup_reset`

Hooks:

- `before_agent_start` injects persona-setup guidance only after the bash wizard is complete and before the persona step is marked done

## 📡 Daemon

`pi-daemon.service` is the always-on Matrix daemon.

Current behavior:

- always runs through one supervisor/runtime path
- synthesizes a default host agent from the primary Pi account if no valid agent overlays exist
- skips malformed agent overlays with warnings instead of aborting startup
- keeps one room session per `(room, agent)` pair
- schedules optional proactive agent jobs declared in agent frontmatter
- runs heartbeat jobs as synthetic proactive turns and can suppress configured no-op replies such as `HEARTBEAT_OK`
- prunes duplicate-event and reply-budget state over time so long-lived sessions stay bounded

Proactive job frontmatter shape:

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

Notes:

- `cron` supports `@hourly`, `@daily`, `@weekly`, and `minute hour * * day-of-week`
- Cron expressions use UTC time
- Day-of-month and month fields must be `*`
- Day-of-week: 0=Sunday, 1=Monday, ..., 6=Saturday
- Examples: `0 9 * * *` (daily 9 AM), `0 9 * * 1` (Mondays 9 AM)
- See [docs/daemon-architecture.md](docs/daemon-architecture.md) for full cron documentation
- duplicate proactive job ids are rejected within the same room for a single agent overlay
- heartbeat failures back off by the configured interval instead of immediately looping

### Agent-to-Agent Collaboration

Agents can trigger each other via Matrix mentions:

1. Agent A sends a message containing `@agent-b:bloom` (Agent B's Matrix User ID)
2. The router detects the mention and forwards the message to Agent B
3. Agent B receives the message and can respond

Example:
```
Pickle: @cookie:bloom Please remember that I prefer dark mode
Cookie: Got it! I'll remember that preference.
```

Routing rules for agent mentions:
- The mention must be the agent's full Matrix User ID (`@username:server`)
- Target agent must have `respond.allow_agent_mentions: true` (default: true)
- An agent cannot trigger itself (prevents loops)
- Standard cooldown and reply budget rules apply

Frontmatter configuration:
```yaml
respond:
  allow_agent_mentions: true   # Allow other agents to mention this agent
```

Alternatively, use the `mention_agent` tool from `bloom-garden` to format mentions correctly.

Key daemon files:

| Path | Purpose |
|------|---------|
| `core/daemon/index.ts` | bootstrap and default-host fallback selection |
| `core/daemon/contracts/matrix.ts` | Bloom-owned Matrix bridge contract |
| `core/daemon/runtime/matrix-js-sdk-bridge.ts` | official Matrix SDK bridge and per-identity client lifecycle |
| `core/daemon/runtime/pi-room-session.ts` | Pi SDK-backed room session lifecycle |
| `core/daemon/agent-supervisor.ts` | room routing, session orchestration, and proactive dispatch |
| `core/daemon/multi-agent-runtime.ts` | unified bridge, supervisor, and scheduler lifecycle |
| `core/daemon/lifecycle.ts` | shared retry/backoff helper for daemon startup |
| `core/daemon/scheduler.ts` | daemon-owned heartbeat and cron-style proactive scheduling |
| `core/daemon/router.ts` | routing policy |
| `core/daemon/room-state.ts` | duplicate, cooldown, and reply-budget tracking |

## 📜 Bundled Skills

Bundled skill directories seeded into `~/Bloom/Skills/`:

- `first-boot`
- `local-llm`
- `object-store`
- `os-operations`
- `recovery`
- `self-evolution`
- `service-management`

## 📦 Bundled Service Packages

Current packages in `services/`:

| Package | Status |
|---------|--------|
| `cinny` | packaged web client installable via `service_install` |
| `dufs` | packaged service installable via `service_install` |
| `code-server` | packaged service with local image build flow |
| `_template` | scaffold source for new packages |

Additional service documentation in-tree:

| Path | Role |
|------|------|
| `docs/matrix-infrastructure.md` | Matrix infrastructure reference |
| `docs/netbird-infrastructure.md` | NetBird infrastructure reference |

Built-in infrastructure:

| Name | Role |
|------|------|
| `Bloom Home` | image-baked landing page on port `8080`, generated from installed web services |

## 🛡️ Safety And Trust

- shell command guardrails are loaded from `~/Bloom/guardrails.yaml` if present, else from the packaged default
- service manifests live in `~/Bloom/manifest.yaml`
- service image trust rules are documented in [docs/supply-chain.md](docs/supply-chain.md)
- PR-based repo workflow is documented in [docs/fleet-pr-workflow.md](docs/fleet-pr-workflow.md)

### High-Sensitivity Bloom Paths

The following paths in `~/Bloom/` have elevated security impact. If an attacker
gains a foothold (e.g., via a compromised mesh container), writes to these paths
can establish persistence or bypass safety controls:

| Path | Sensitivity | Why |
|------|-------------|-----|
| `~/Bloom/Agents/` | **Critical** | Loaded by the daemon on every restart. A new `AGENTS.md` creates a persistent agent with arbitrary instructions and proactive jobs that survives reboots. |
| `~/Bloom/guardrails.yaml` | **Critical** | User-override for shell command blocks. An empty or permissive file disables all shell command blocks. |
| `~/Bloom/Objects/` | **High** | Injected into Pi's context at session start. Writing here achieves persistent system-prompt injection. |
| `~/Bloom/Persona/` | **High** | Injected into Pi's context at session start. Writing here achieves persistent system-prompt injection. |

**Guidance:** Writes to `Agents/` and `guardrails.yaml` should be surfaced to the
user explicitly, not done silently. These are high-sensitivity operations.

## 📚 Reference Routing

Use this file when you need exact current-state facts.

- For repo rules and architecture intent: [ARCHITECTURE.md](ARCHITECTURE.md)
- For daemon walkthroughs: [docs/daemon-architecture.md](docs/daemon-architecture.md)
- For service/package model: [docs/service-architecture.md](docs/service-architecture.md)
- For operator workflows: [docs/README.md](docs/README.md)

## 🔗 Related Docs

- [README.md](README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/README.md](docs/README.md)
- [docs/daemon-architecture.md](docs/daemon-architecture.md)
- [docs/memory-model.md](docs/memory-model.md)
- [docs/service-architecture.md](docs/service-architecture.md)
- [docs/quick_deploy.md](docs/quick_deploy.md)
- [docs/pibloom-setup.md](docs/pibloom-setup.md)
- [docs/fleet-pr-workflow.md](docs/fleet-pr-workflow.md)
- [docs/supply-chain.md](docs/supply-chain.md)
