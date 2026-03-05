---
name: demo-socket-echo
version: 0.1.0
description: Example socket-activated service package used to reference Bloom socket unit wiring
image: docker.io/mendhak/http-https-echo:31
---

# Demo Socket Echo Service (Reference)

This package demonstrates Bloom's socket-activation file layout:

- `bloom-demo-socket-echo.socket` (listener)
- `bloom-demo-socket-echo.container` (service started on demand)

## Purpose

Use this as a reference when creating new socket-activated services.

## Notes

- This is a wiring reference package (not a production service).
- For a real in-tree socket-activated service, see `services/whisper/quadlet/`.

## Local Install (reference only)

```bash
cp services/examples/demo-socket-echo/quadlet/* ~/.config/containers/systemd/
mkdir -p ~/Garden/Bloom/Skills/demo-socket-echo
cp services/examples/demo-socket-echo/SKILL.md ~/Garden/Bloom/Skills/demo-socket-echo/SKILL.md
systemctl --user daemon-reload
systemctl --user enable --now bloom-demo-socket-echo.socket
```
