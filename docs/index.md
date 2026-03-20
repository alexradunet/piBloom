# NixPI Documentation

> Pi-native AI companion OS on NixOS

## 🌱 Why NixPI Exists

NixPI is a very opinionated NixOS build designed as an AI-first operating system. It packages Pi (the AI agent), host integration, memory management, and a small set of built-in user services into one self-hosted system.

The design pressures that shaped NixPI:

- **Single-user focus**: Built for one end user as a personal life assistant and knowledge management system
- **AI-native interaction**: Matrix-based messaging as the primary interface, not just an add-on
- **Inspectable by design**: All memory is file-based Markdown, editable without special tooling
- **Minimal footprint**: Carries only what's necessary, letting the user evolve the system through Pi
- **Deterministic**: NixOS foundation provides reproducible system state

## 🚀 What Ships Today

NixPI delivers a complete platform with:

| Component | What It Does |
|-----------|--------------|
| **NixPI Directory** | Durable home under `~/nixpi/` with blueprint seeding |
| **Persona System** | Injected personality, shell guardrails, memory compaction |
| **NixOS Integration** | Proposal workflow for human-reviewed system changes |
| **Matrix Daemon** | Always-on room runtime with multi-agent support |
| **Built-in Services** | Home (`:8080`), Element Web (`:8081`), Matrix (`:6167`) |
| **Memory System** | Markdown-native durable memory in `~/nixpi/Objects/` |
| **Episodic Memory** | Append-only capture in `~/nixpi/Episodes/` |
| **First-Boot Flow** | Bash wizard + Pi-guided persona completion |

## 🧭 Where to Start

Choose your entry point:

| Your Goal | Start Here |
|-----------|------------|
| Installing NixPI | [Quick Deploy](./operations/quick-deploy) |
| First-time setup | [First Boot Setup](./operations/first-boot-setup) |
| Understanding the system | [Architecture Overview](./architecture/) |
| Reading the code | [Codebase Guide](./codebase/) |
| Operating a running system | [Operations](./operations/) |
| Deep technical reference | [Reference](./reference/) |

## 📚 Documentation Map

| Section | Contains |
|---------|----------|
| [Getting Started](./getting-started/) | New maintainer orientation |
| [Architecture](./architecture/) | Subsystem boundaries and runtime flows |
| [Codebase](./codebase/) | File-by-file responsibility guide |
| [Operations](./operations/) | Deploy, setup, and run procedures |
| [Reference](./reference/) | Deep technical documentation |
| [Contributing](./contributing/) | Maintainer guidelines |

## 🔗 Quick Links

- [GitHub Repository](https://github.com/alexradunet/NixPI)
- [Architecture Overview](./architecture/)
- [Runtime Flows](./architecture/runtime-flows)
- [Codebase Index](./codebase/)

---

**Note**: This documentation uses emoji notation for visual scanning. See the [Emoji Legend](./reference/emoji-legend) for the full reference.
