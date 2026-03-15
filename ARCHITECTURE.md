# Architecture

> 📖 [Emoji Legend](docs/LEGEND.md)

This document is maintainer-facing architecture guidance for the current Bloom repository.

## 🌱 Why The System Looks Like This

Bloom is intentionally built from simple host-native primitives:

- markdown for durable human-readable state
- TypeScript extensions for Pi integration
- systemd and Quadlet for long-running workloads
- a bootc image for host distribution

The design goal is inspectability over abstraction. Bloom should be understandable from the repo and from the host filesystem without requiring hidden control planes or databases.

## 🧩 How The Product Is Shaped

Bloom has three capability layers:

| Layer | What it is | Typical use |
|------|-------------|-------------|
| 📜 Skill | markdown instructions in `SKILL.md` | procedures, guidance, checklists |
| 🧩 Extension | in-process TypeScript | Pi-facing tools, hooks, commands |
| 📦 Service | packaged container workload | isolated long-running software |

OS-level infrastructure is separate from service packages and part of the image:

- `bloom-matrix.service`
- `netbird.service`
- `pi-daemon.service`

Repository structure:

```text
core/                 Bloom core: OS image, daemon, persona, skills, built-in extensions, runtime helpers
core/pi-extensions/   Pi-facing Bloom extensions
services/             bundled service packages and template
tests/                unit, integration, daemon, and extension tests
docs/                 live documentation
```

## 💻 How To Extend Bloom

Use the lightest mechanism that solves the problem.

- choose a Skill when Pi only needs instructions or reference material
- choose an Extension when Pi needs tools, hooks, commands, or session integration
- choose a Service when software should run outside the Pi process

Extension conventions:

1. `index.ts` is the registration entry point
2. handler logic should live in `actions.ts` or focused `actions-*.ts` files
3. `types.ts` is optional but preferred when an extension owns non-trivial types
4. reusable core helpers belong in `core/lib/`

Current exception worth documenting honestly:

- some extensions still keep light gating or setup helpers in `index.ts`
- some `core/lib/` modules are host-aware and perform filesystem or process work

## 📡 Daemon Architecture Guidance

The daemon is first-class platform code, not an add-on.

Current invariants:

1. always run through one supervisor/runtime path
2. synthesize a default host agent from the primary Pi account when no valid overlays exist
3. skip malformed overlays with warnings instead of aborting startup
4. bound duplicate-event, cooldown, and reply-budget state over time
5. suppress fresh dispatch during supervisor shutdown

Use [docs/daemon-architecture.md](docs/daemon-architecture.md) for the runtime walkthrough and [AGENTS.md](AGENTS.md) for the exact current file and tool reference.

## 📜 Documentation Policy

Bloom documentation is part of the product surface.

Rules:

1. root docs and `docs/*.md` must describe the current repository state
2. keep one authoritative location per fact instead of duplicating operational detail across pages
3. when code changes tools, hooks, paths, daemon behavior, setup flow, service workflow, ports, or build commands, update the authoritative doc in the same change
4. root pages should route readers; detailed facts belong in focused guides or reference docs
5. use emoji anchors from [docs/LEGEND.md](docs/LEGEND.md) in root and `docs/` pages
6. delete stale design archives instead of keeping dead competing docs

## 📚 Reference

Important current references:

- [AGENTS.md](AGENTS.md) for tools, hooks, paths, and runtime facts
- [docs/daemon-architecture.md](docs/daemon-architecture.md) for daemon behavior and module layout
- [docs/service-architecture.md](docs/service-architecture.md) for the capability hierarchy and package model
- [docs/README.md](docs/README.md) for the full docs map

## 🔗 Related

- [README.md](README.md)
- [AGENTS.md](AGENTS.md)
- [docs/README.md](docs/README.md)
