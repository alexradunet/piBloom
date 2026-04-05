# Scripts & Tools

> Setup apply and local installer helpers

## Responsibilities

There are only two script areas that matter:

- `core/scripts/nixpi-setup-apply.sh` for first-boot Netbird setup and ready-marker creation
- `tools/run-installer-iso.sh` for local ISO-based install testing

## Cleanup rule

Keep setup logic split by responsibility, not by historical flow:

- `nixpi-setup-apply.sh` should only configure Netbird and write the system-ready marker
- `run-installer-iso.sh` should not embed product logic — it only boots the ISO in QEMU

First boot is now a single flow:

1. The system boots into the installed NixPI desktop (pre-baked from the ISO closure)
2. The chat server redirects unauthenticated requests to `/setup` until `~/.nixpi/wizard-state/system-ready` exists
3. The operator optionally submits a Netbird setup key via the web wizard
4. `nixpi-setup-apply` runs under `sudo`, starts Netbird, and writes the ready marker

---

## When To Run Scripts

| Script | Safe to Run | When |
|--------|-------------|------|
| `nixpi-setup-apply.sh` | Production | First boot only (via web wizard) |
| `run-installer-iso.sh` | Development | Anytime for install-flow testing |

---

## Related

- [Operations: Quick Deploy](../operations/quick-deploy) - Deployment procedures
- [Operations: First Boot](../operations/first-boot-setup) - Setup procedures
- [Tests](./tests) - Testing documentation
