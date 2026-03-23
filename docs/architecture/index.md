# NixPI Architecture

> Major subsystem boundaries and design principles

## Why This Architecture Exists

NixPI combines several technologies to create a self-hosted AI companion OS. The architecture is shaped by these design goals:

1. **Deterministic systems**: NixOS provides reproducible system state
2. **Always-available AI**: Matrix daemon keeps Pi active outside local sessions
3. **Inspectable memory**: Markdown files for human-readable, editable storage
4. **Minimal base**: Small footprint that users evolve through Pi
5. **Human-in-the-loop**: Local proposal workflow for system changes

## What The Platform Ships

### High-Level Subsystems

| Subsystem | Purpose | Location |
|-----------|---------|----------|
| **NixOS Modules** | System provisioning and service definitions | `core/os/` |
| **Matrix Daemon** | Always-on room runtime | `core/daemon/` |
| **Pi Extensions** | Tool surface for Pi | `core/pi/extensions/` |
| **Core Library** | Shared runtime primitives | `core/lib/` |
| **Persona & Skills** | Behavior configuration | `core/pi/persona/`, `core/pi/skills/` |

### Built-in Services

| Service | Port | Purpose |
|---------|------|---------|
| Home | `:8080` | Service directory and status page |
| Element Web | `:8081` | Element Web client |
| Matrix | `:6167` | Continuwuity homeserver |

## How The Layers Connect

### Dependency Flow

```
┌─────────────────────────────────────────┐
│           User Interface                │
│   (Matrix, Element Web, CLI tools)      │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Pi Extensions                 │
│  (nixpi, os, objects, episodes, etc.)   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Matrix Daemon                 │
│  (multi-agent runtime, routing,         │
│   scheduling, room state)               │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           NixOS System                  │
│  (services, networking, storage)        │
└─────────────────────────────────────────┘
```

### Control Flow Summary

1. **NixOS provisions runtime**: System boots with NixPI modules applied
2. **Packaged app launches daemon**: `nixpi-daemon.service` starts on boot
3. **Daemon connects Matrix**: Authenticates to local homeserver
4. **Extensions expose tools**: Pi uses extensions for OS operations
5. **Scripts drive setup**: First-boot wizard configures the system

## Data And Control Surfaces

### Primary Data Surfaces

| Surface | Location | Purpose |
|---------|----------|---------|
| Durable Memory | `~/nixpi/Objects/*.md` | Long-term facts, preferences, decisions |
| Episodic Memory | `~/nixpi/Episodes/YYYY-MM-DD/*.md` | Raw observations, append-only |
| Setup Markers | `~/.nixpi/.setup-complete`, `~/.nixpi/wizard-state/persona-done` | Machine setup and persona completion |
| Agent State | `~/.pi/` | Runtime credentials and context |
| Guardrails | `~/nixpi/guardrails.yaml` | Tool execution safety rules |

### Control Surfaces

| Surface | Interface | Purpose |
|---------|-----------|---------|
| `just` commands | Local shell | Development and VM operations |
| `nixos-rebuild` | System | Apply system configuration |
| Matrix rooms | Messaging | Interactive Pi sessions |
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

## Subsystem Details

Each subsystem has its own detailed documentation:

- [Core Library](../codebase/core-lib) - Shared primitives and helpers
- [Daemon](../codebase/daemon) - Room runtime and multi-agent support
- [Pi Extensions](../codebase/pi-extensions) - Tool and command surface
- [OS Modules](../codebase/os) - NixOS integration

## Related

- [Runtime Flows](./runtime-flows) - End-to-end flow documentation
- [Codebase Guide](../codebase/) - File-level documentation
- [Security Model](../reference/security-model) - Detailed security documentation
