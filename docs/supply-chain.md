# Supply Chain & Reproducibility Policy

> 📖 [Emoji Legend](LEGEND.md)

This document defines Bloom's baseline supply-chain controls for bootc images and runtime container images.

## 🛡️ Goals

- Reproducible installs
- Drift-resistant runtime images
- Explicit trust decisions for mutable tags

## 📦 Runtime Image Policy (Quadlet)

Service container images must be pinned:

- Preferred: digest (`image@sha256:...`)
- Acceptable: explicit non-latest tag
- Disallowed: implicit latest / `latest*` tags

### 📦 Current Exceptions

- None.

## 💻 bootc Image Policy

- Base image is pinned by digest in `os/Containerfile`.
- Global npm CLIs in OS image are pinned to explicit versions.
- Build context excludes nested `node_modules` and worktrees.

## 🚀 Release Checklist

- [ ] Quadlet images pinned (digest preferred)
- [ ] `service_test` passes for each service
- [ ] Docs updated when image/digest references change

## 🔗 Related

- [Emoji Legend](LEGEND.md) — Notation reference
- [Service Architecture](service-architecture.md) — Extensibility hierarchy details
- [AGENTS.md](../AGENTS.md#-services) — Service reference
