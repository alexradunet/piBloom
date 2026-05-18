# Hermes Agent Runbook

Hermes Agent is installed through the upstream Hermes NixOS module and runs as `hermes-agent.service`.

## Runtime shape

```text
inputs.hermes-agent.nixosModules.default -> nix/modules/host/hermes-agent.nix -> services.hermes-agent
```

Nazar uses native mode by default:

- service unit: `hermes-agent.service`
- state directory: `/var/lib/hermes`
- managed home: `/var/lib/hermes/.hermes`
- workspace: `/var/lib/hermes/workspace`
- CLI: `hermes` is on the system PATH with `HERMES_HOME=/var/lib/hermes/.hermes`

The service runs as the unprivileged `hermes` user. The `alex` user is in the `hermes` group so interactive CLI sessions from SSH or `code.nazar.studio` can share the managed state.

## Secrets

Do not put API keys in Nix files. Seed the host-local environment file before first real use:

```bash
printf 'OPENROUTER_API_KEY=sk-or-your-key\n' \
  | sudo install -m 0600 -o hermes -g hermes /dev/stdin /var/lib/hermes/env
```

Other provider or gateway tokens can go in the same file, one `KEY=value` per line. The Hermes module merges `/var/lib/hermes/env` into `/var/lib/hermes/.hermes/.env` during `nixos-rebuild switch`.

## Switch

From the repository root on the host:

```bash
nix flake check --no-build
sudo nix --accept-flake-config build .#nixosConfigurations.nazar.config.system.build.toplevel --print-build-logs
sudo nixos-rebuild switch --flake .#nazar
```

Or use the repository app:

```bash
nix run .#switch-host
```

## Validate

```bash
systemctl status hermes-agent
journalctl -u hermes-agent -n 100 --no-pager
hermes version
hermes config
```

If a fresh shell cannot read `/var/lib/hermes/.hermes`, confirm group membership and re-login:

```bash
id alex
getent group hermes
```

## Updating Hermes

```bash
cd /etc/nixos # or this repository checkout on the host
nix flake update hermes-agent
sudo nixos-rebuild switch --flake .#nazar
```

## Rollback

```bash
sudo nixos-rebuild switch --rollback
```
