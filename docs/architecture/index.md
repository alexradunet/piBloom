# NixPI Architecture

> Major subsystem boundaries and design principles

## Why This Architecture Exists

NixPI combines several technologies to create a self-hosted AI companion OS. The architecture is shaped by these design goals:

1. **Deterministic systems**: NixOS provides reproducible system state
2. **Shell-first AI runtime**: Pi is available directly from SSH and local terminals
3. **Inspectable memory**: Markdown files for human-readable, editable storage
4. **Minimal base**: Small footprint that users evolve through Pi
5. **Human-in-the-loop**: Local proposal workflow for system changes

## What The Platform Ships

| Subsystem | Purpose | Location |
|-----------|---------|----------|
| **NixOS Modules** | System provisioning and service definitions | `core/os/` |
| **Shell Runtime** | Pi packaging and runtime-state setup | `core/os/modules/app.nix` |
| **Pi Extensions** | Tool surface for Pi, including the wiki memory extension | `core/pi/extensions/` |
| **Core Library** | Shared runtime primitives | `core/lib/` |
| **Persona & Skills** | Behavior configuration | `core/pi/persona/`, `core/pi/skills/` |

## Built-in Services

| Service | Purpose |
|---------|---------|
| `nixpi-app-setup.service` | Seeds `~/.pi` and runtime defaults |
| `sshd.service` | Remote shell access |

## Control Flow Summary

1. **NixOS provisions runtime**: System boots with NixPI modules applied
2. **Packaged app prepares Pi state**: `nixpi-app-setup.service` seeds the shell runtime
3. **Operator enters through shell**: SSH or a local terminal launches `pi`
4. **Extensions expose tools**: Pi uses extensions for OS operations and wiki memory maintenance
5. **Scripts drive setup**: First-boot workflow configures the system
