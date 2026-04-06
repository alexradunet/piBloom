# NixPI Architecture

> Major subsystem boundaries and design principles

## Why This Architecture Exists

NixPI combines several technologies to create a self-hosted AI companion OS. The architecture is shaped by these design goals:

1. **Deterministic systems**: NixOS provides reproducible system state
2. **Local-first AI runtime**: the built-in web chat keeps Pi available without external messaging infrastructure
3. **Inspectable memory**: Markdown files for human-readable, editable storage
4. **Minimal base**: Small footprint that users evolve through Pi
5. **Human-in-the-loop**: Local proposal workflow for system changes

## What The Platform Ships

### High-Level Subsystems

| Subsystem | Purpose | Location |
|-----------|---------|----------|
| **NixOS Modules** | System provisioning and service definitions | `core/os/` |
| **Local Chat Runtime** | Session-backed web chat server and frontend | `core/chat-server/` |
| **Pi Extensions** | Tool surface for Pi | `core/pi/extensions/` |
| **Core Library** | Shared runtime primitives | `core/lib/` |
| **Persona & Skills** | Behavior configuration | `core/pi/persona/`, `core/pi/skills/` |

### Built-in Services

| Service | Port | Purpose |
|---------|------|---------|
| Local chat backend | `127.0.0.1:8080` by default | Session-backed Pi chat server |
| HTTP entrypoint | `:80` | Reverse proxy into the local chat runtime |
| HTTPS entrypoint | `:443` | Canonical secure web entrypoint |

## How The Layers Connect

### Dependency Flow

```
┌─────────────────────────────────────────┐
│           User Interface                │
│   (Local web chat, CLI tools)           │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Pi Extensions                 │
│  (nixpi, os, objects, episodes, etc.)   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Local Chat Runtime              │
│  (HTTP server, session manager,         │
│   streaming events)                     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           NixOS System                  │
│  (services, networking, storage)        │
└─────────────────────────────────────────┘
```

### Control Flow Summary

1. **NixOS provisions runtime**: System boots with NixPI modules applied
2. **Packaged app launches local chat**: `nixpi-chat.service` starts on boot
3. **Nginx fronts the app**: local HTTP/HTTPS entrypoints proxy into the backend
4. **Extensions expose tools**: Pi uses extensions for OS operations
5. **Scripts drive setup**: First-boot wizard configures the system

## Data And Control Surfaces

### Primary Data Surfaces

| Surface | Location | Purpose |
|---------|----------|---------|
| Durable Memory | `~/nixpi/Objects/*.md` | Long-term facts, preferences, decisions |
| Episodic Memory | `~/nixpi/Episodes/YYYY-MM-DD/*.md` | Raw observations, append-only |
| Setup Markers | `~/.nixpi/wizard-state/system-ready`, `~/.nixpi/wizard-state/persona-done` | Machine setup and persona completion |
| Pi Runtime State | `~/.pi/` | Settings, chat sessions, and agent runtime state |
| Guardrails | `~/nixpi/guardrails.yaml` | Tool execution safety rules |

### Control Surfaces

| Surface | Interface | Purpose |
|---------|-----------|---------|
| `just` commands | Local shell | Development and VM operations |
| `nixos-rebuild` | System | Apply system configuration |
| Local web chat | Browser | Interactive Pi sessions |
| `nixpi-broker` | Privileged service | Elevated OS operations |

## Security Boundaries

### NetBird as Security Perimeter

The `wt0` interface (NetBird WireGuard tunnel) is the only trusted interface in the firewall. Services are only accessible through this interface.

**Critical**: Without NetBird running, services are exposed to the local network.

### Privilege Separation

| Boundary | Purpose |
|----------|---------|
| Primary operator | Human administrator and interactive Pi runtime |
| `/var/lib/nixpi` | Service and secret state owned by the appliance runtime |
| `root` (via broker) | Elevated operations only |

## Detailed References

Use the reference section for topic-level details:

- [Service Architecture](../reference/service-architecture) - Built-in service surface
- [Daemon Architecture](../reference/daemon-architecture) - Chat runtime internals
- [Infrastructure](../reference/infrastructure) - Network and service boundaries
- [Memory Model](../reference/memory-model) - Durable and episodic storage
- [Security Model](../reference/security-model) - Threat model and trust boundary
- [Supply Chain](../reference/supply-chain) - Dependency and image trust

## Related

- [Runtime Flows](./runtime-flows) - End-to-end flow documentation
- [Daemon Architecture](../reference/daemon-architecture) - Runtime internals
- [Operations](../operations/) - Deployment and validation procedures
- [Reference](../reference/) - Detailed technical documentation
