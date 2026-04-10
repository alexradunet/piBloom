# Infrastructure

> Runtime services and access infrastructure

## Operator-Facing Runtime

NixPI exposes a shell-first Pi runtime rather than a browser-hosted terminal surface.

### Configuration

| Setting | Value |
|---------|-------|
| Runtime setup unit | `nixpi-app-setup.service` |
| Remote shell access | `sshd.service` |
| Remote admin boundary | Public SSH restricted to configured admin CIDRs |
| Canonical authoring source | Personal `nixpi` Git repository |
| Running host apply target | `/etc/nixos` or another applied host flake location |
| Standard bootstrap command | `nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- ...` |
| Standard local workflow | `validate -> commit -> push -> apply` |
| Standard rebuild command | `sudo nixpi-rebuild` |

NixPI is authored from a personal Git repository and applied onto a host runtime. `/etc/nixos` is the running host's source of truth, while the host remains the deployment target rather than the default collaboration surface.

### Intentional imperative helpers

The remaining imperative commands are operator-initiated wrappers, not boot-time convergence requirements.

| Command | Why it remains imperative |
|---------|---------------------------|
| `nix run .#plain-host-deploy -- ...` | Fresh provisioning still needs runtime inputs such as the rescue host, target disk, and optional staged `nixos-anywhere` flags. The plain-host installer keeps that imperative surface at install time instead of pretending rescue-mode inputs are steady-state host configuration. |
| `nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- ...` | Host-local bootstrap still needs explicit machine details such as the primary user and hostname, and it may need to integrate with an already-existing `/etc/nixos` tree before rebuilding the host-owned configuration. |

### Troubleshooting

```bash
systemctl status nixpi-app-setup.service
systemctl status sshd.service
systemctl status nixpi-update.timer
sshd -T | grep -E 'passwordauthentication|permitrootlogin'
sudo nft list ruleset | grep 'dport 22'
```
