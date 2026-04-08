# Runtime Flows

> End-to-end startup and operator-entry flow for the current NixPI runtime

## Active Runtime Path

1. `nixpi-app-setup.service` prepares `~/.pi`
2. `sshd.service` and local login shells provide operator entry
3. the operator runs `pi`
4. Pi loads extensions, persona, and workspace state from the seeded runtime

## Boot and Service Startup Flow

```text
multi-user.target
├─ sshd.service
├─ wireguard-wg0.service
├─ nixpi-app-setup.service
└─ nixpi-update.timer
```

## Key Files

| File | Role |
|------|------|
| `core/os/modules/app.nix` | Pi runtime install and state-directory setup |
| `core/os/modules/shell.nix` | Shell-facing environment wiring |
| `core/pi/extensions/os/` | OS and update tooling exposed to Pi |

## Important Runtime Properties

- SSH and local terminals are the supported interactive entrypoints
- Pi owns the actual user experience
- `~/.pi` is seeded before the operator starts work
- `/srv/nixpi` remains the canonical editable checkout for rebuilds

## Verification Commands

```bash
systemctl status nixpi-app-setup.service
systemctl status sshd.service
systemctl status wireguard-wg0.service
systemctl status nixpi-update.timer
command -v pi
pi --help
```
