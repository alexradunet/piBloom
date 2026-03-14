# Bloom Documentation

> 📖 [Emoji Legend](LEGEND.md)

This page is the documentation hub for Bloom.

## 🌱 Why This Docs Set Exists

Bloom documentation is meant to stay live, not archival.

The system is organized to answer three different questions:

- `Why`: what this part of Bloom is for and why it exists
- `How`: how to operate it, change it, or use it safely
- `Reference`: exact current-state facts, paths, tools, and constraints

It also serves two audiences:

- maintainers working in this repo
- operators running or deploying Bloom devices

## 🧭 How To Use The Docs

Pick an audience first, then a depth level.

### Maintainers

- Start with [../ARCHITECTURE.md](../ARCHITECTURE.md)
- Use [../AGENTS.md](../AGENTS.md) for current tools, hooks, paths, and runtime facts
- Use topic guides in `docs/` for architecture context and workflows

### Operators

- Start with [pibloom-setup.md](pibloom-setup.md)
- Use [quick_deploy.md](quick_deploy.md) for image build and install
- Use [live-testing-checklist.md](live-testing-checklist.md) for release validation

## 📚 Reference Map

| Topic | Audience | Primary question | Main doc |
|------|----------|------------------|----------|
| Platform overview | both | what is Bloom | [../README.md](../README.md) |
| Architecture and repo rules | maintainers | why the system is shaped this way | [../ARCHITECTURE.md](../ARCHITECTURE.md) |
| Tools, hooks, paths, and packaged capabilities | maintainers | what exists right now | [../AGENTS.md](../AGENTS.md) |
| Daemon model | maintainers | how room runtime works | [daemon-architecture.md](daemon-architecture.md) |
| Capability model and packaged services | both | when to use a skill, extension, or service | [service-architecture.md](service-architecture.md) |
| First boot and persona completion | operators | how setup works on a new device | [pibloom-setup.md](pibloom-setup.md) |
| Build, image, and VM flows | operators | how to build and boot Bloom | [quick_deploy.md](quick_deploy.md) |
| Fresh-device validation | operators | how to verify a release candidate | [live-testing-checklist.md](live-testing-checklist.md) |
| Memory model | maintainers | how Bloom stores and promotes memory | [memory-model.md](memory-model.md) |
| Image trust and package policy | maintainers | what is allowed in service/image sourcing | [supply-chain.md](supply-chain.md) |
| Contribution workflow | maintainers | how repo sync and PR submission works | [fleet-pr-workflow.md](fleet-pr-workflow.md) |
| Packaged service operations | operators | how bundled packages install and run | [../services/README.md](../services/README.md) |

## 🛡️ Documentation Maintenance Rules

Documentation must follow these rules:

- keep one authoritative home for each fact
- prefer linking over restating
- update docs when code changes user-facing tools, paths, ports, setup flow, daemon behavior, or service workflow
- keep root pages short and route readers to the right level of detail
- use emoji anchors from [LEGEND.md](LEGEND.md) in root and `docs/` pages for consistent scanning

## 🔗 Related

- [../README.md](../README.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../AGENTS.md](../AGENTS.md)
