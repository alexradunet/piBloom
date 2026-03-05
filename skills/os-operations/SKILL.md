---
name: os-operations
description: Inspect, manage, and remediate the Bloom OS system — bootc status, services, containers, and timers
---

# OS Operations Skill

Use this skill when the user asks about the health or state of the Bloom OS system, or when an error suggests infrastructure inspection is warranted.

## Bloom OS Architecture

Bloom runs on **Fedora bootc 42** — an immutable, image-based OS:

- `/usr` — read-only, managed by bootc OS image updates
- `/etc` — writable, managed by Quadlet files
- `/var` — persistent across reboots, holds object store and runtime data

**Podman Quadlet** containers are managed by systemd. Each bloom service is a `.container` unit file in `/etc/containers/systemd/`.

## Available Tools

Use the registered bloom-os tools directly:

- `bootc_status` — Show OS image status, pending updates, rollback availability
- `bootc_update` — Check for, download, or apply OS updates (supports staged workflow)
- `bootc_rollback` — Rollback to previous OS image (requires user confirmation)
- `container_status` — List running bloom-* containers with health status
- `container_logs` — Show recent logs for a bloom service
- `systemd_control` — Start/stop/restart/status of bloom systemd services
- `container_deploy` — Deploy a container from a Quadlet unit file

## Health Assessment

When inspecting system health, use tools and look for:

### Healthy signals
- All bloom-* units show `active running`
- All containers show running with healthy status
- Timers show a future next-run time
- bootc status shows booted image matches desired

### Unhealthy signals
- Unit in `failed` state → check logs, suggest restart
- Container in `exited` or `unhealthy` state → check logs, suggest restart
- Staged image present → reboot needed to apply pending OS update

### Alert Severities
- **CRITICAL**: Service failed or container exited
- **WARNING**: OS update staged awaiting reboot, or container unhealthy
- **INFO**: No bloom services running (may be expected on first boot)

## Safety Rules

- All mutation commands require user confirmation.
- Only bloom-* services and containers can be managed.
- Never trigger `bootc upgrade` without explicit user confirmation.
- Always check health after mutations.
