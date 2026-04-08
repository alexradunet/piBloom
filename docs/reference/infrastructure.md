# Infrastructure

> Runtime services and access infrastructure

## Operator-Facing Runtime

NixPI exposes a shell-first Pi runtime rather than a browser-hosted terminal surface.

### Configuration

| Setting | Value |
|---------|-------|
| Runtime setup unit | `nixpi-app-setup.service` |
| Remote shell access | `sshd.service` |
| Preferred private management network | `wireguard-wg0.service` |

### Troubleshooting

```bash
systemctl status nixpi-app-setup.service
systemctl status sshd.service
systemctl status wireguard-wg0.service
systemctl status nixpi-update.timer
wg show wg0
```
