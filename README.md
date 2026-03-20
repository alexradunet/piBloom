# NixPI

> Pi-native AI companion OS on NixOS

Very opinionated NixOS build personally for me and my workflows and how I imagine a PC will be in the future. My goal is to leverage the current AI Agents Technology to build an AI Firsts OS designed specifically for one end user to act like a personal life assistant and knowledge management system.

It is very experimental and I am still currently developing it based on my needs and my own code engineering preferences.

I plan to keep this project as minimal as possible so the end user can evolve the OS through Pi without carrying a large default runtime surface.

## 🌱 Why NixPI Exists

NixPI packages Pi, host integration, memory, and a small set of built-in user services into one self-hosted system.

NixPI exists to give Pi:

- a durable home directory under `~/nixpi/`
- first-class host tools for NixOS workflows
- a local repo proposal workflow for human-reviewed system changes
- a private Matrix-based messaging surface
- a minimal but inspectable operating model based on files, NixOS, and systemd

## 🚀 What Ships Today

Current platform capabilities:

- NixPI directory management and blueprint seeding for `~/nixpi/`
- persona injection, shell guardrails, durable-memory digest injection, and compaction context persistence
- local-only Nix proposal support for checking the seeded repo clone, refreshing `flake.lock`, and validating config before review
- host OS management tools for NixOS updates, local/remote switch, systemd, health, and reboot scheduling
- built-in user services for Home and Element Web
- markdown-native durable memory in `~/nixpi/Objects/`
- append-only episodic memory in `~/nixpi/Episodes/`
- a unified Matrix room daemon with synthesized host-agent fallback and optional multi-agent overlays
- proactive daemon jobs for heartbeat and simple cron-style scheduled turns
- a first-boot flow split between a bash wizard and a Pi-guided persona step

## 🚀 Quick Start

Install NixPI from the standard graphical NixPI installer image:

```bash
# 1. Build the installer ISO
nix build .#installerIso

# 2. Write ./result/iso/*.iso to a USB stick and boot it
# 3. Complete the graphical installer
# 4. Reboot into NixPI, then finish first boot
setup-wizard.sh
```

After install, NixPI is operated as a normal local flake-based NixOS system:

```bash
sudo nixos-rebuild switch --flake /etc/nixos
```

See the [documentation site](https://alexradunet.github.io/NixPI) for detailed instructions.

## 🧭 Documentation

Full documentation is available at **[alexradunet.github.io/NixPI](https://alexradunet.github.io/NixPI)**

Or browse by topic:

| Your Goal | Start Here |
|-----------|------------|
| Installing NixPI | [Quick Deploy](https://alexradunet.github.io/NixPI/operations/quick-deploy) |
| First-time setup | [First Boot Setup](https://alexradunet.github.io/NixPI/operations/first-boot-setup) |
| Understanding the system | [Architecture Overview](https://alexradunet.github.io/NixPI/architecture/) |
| Reading the code | [Codebase Guide](https://alexradunet.github.io/NixPI/codebase/) |
| Operating a running system | [Operations](https://alexradunet.github.io/NixPI/operations/) |
| Deep technical reference | [Reference](https://alexradunet.github.io/NixPI/reference/) |

To run the docs locally:

```bash
npm run docs:dev
```

## 💻 Default Install

Installed by default:

- `sshd.service`
- `netbird.service`
- `matrix-synapse.service`
- `nixpi-daemon.service` after setup once AI auth and defaults are ready
- `nixpi-home.service`
- `nixpi-element-web.service`

## 🌿 Repository Layout

| Path | Purpose |
|------|---------|
| `core/` | NixPI core: NixOS modules, daemon, persona, skills, built-in extensions, and shared runtime code |
| `core/os/` | NixOS modules and host configurations |
| `core/daemon/` | Matrix room daemon and multi-agent runtime |
| `core/pi/extensions/` | Pi-facing NixPI extensions shipped in the default runtime |
| `tests/` | unit, integration, daemon, and extension tests |
| `docs/` | live project documentation (VitePress site) |

## 🧩 Capability Model

NixPI extends Pi through two active runtime layers:

| Layer | What it is | Typical use |
|------|-------------|-------------|
| 📜 Skill | markdown instructions in `SKILL.md` | procedures, guidance, checklists |
| 🧩 Extension | in-process TypeScript | Pi-facing tools, hooks, commands |

Built-in service surface is part of the base NixOS system:

- `Home` on `:8080`
- `Element Web` on `:8081`
- `Matrix` on `:6167`

## 📚 Documentation Structure

| Section | Contains |
|---------|----------|
| [Overview](https://alexradunet.github.io/NixPI/) | Project summary and entry points |
| [Getting Started](https://alexradunet.github.io/NixPI/getting-started/) | New maintainer orientation |
| [Architecture](https://alexradunet.github.io/NixPI/architecture/) | Subsystem boundaries and runtime flows |
| [Codebase](https://alexradunet.github.io/NixPI/codebase/) | File-by-file responsibility guide |
| [Operations](https://alexradunet.github.io/NixPI/operations/) | Deploy, setup, and run procedures |
| [Reference](https://alexradunet.github.io/NixPI/reference/) | Deep technical documentation |
| [Contributing](https://alexradunet.github.io/NixPI/contributing/) | Maintainer guidelines |

## 🔗 Related

- [Documentation Site](https://alexradunet.github.io/NixPI)
- [GitHub Repository](https://github.com/alexradunet/NixPI)
