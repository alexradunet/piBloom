# Minecraft PaperMC MicroVM runbook

Canonical runtime: Nazar MicroVM only. Do not create alternate VM variants for Minecraft.

## Ownership

- Orchestrator repo: `/root/nazar`
- Monorepo checkout in guest: `/home/alex/nazar`
- Service workspace in guest: `/home/alex/nazar/services/minecraft`
- Guest hostname: `minecraft`
- Guest IP: `10.10.10.30`
- Public game endpoint: `mc.nazar.studio:25565/tcp`
- Simple Voice Chat: `24454/udp`
- Host NixPi route: `http://nixpi.nazar.studio/` through sshuttle; select the Minecraft workspace there.

## State and persistence

State is declarative at the OS/service layer and persistent through MicroVM virtiofs shares declared in `nazar/nix/fleet/vms.nix`:

- `/var/lib/minecraft` from `/persist/microvms/minecraft/state`
- `/home/alex/nazar` from `/persist/microvms/minecraft/repo` (monorepo checkout; service workspace is `services/minecraft`)
- guest SSH host keys from `/persist/microvms/minecraft/ssh`

## Deploy

From the guest for service-only edits and validation:

```bash
ssh alex@minecraft
nazar-vm-repo-bootstrap
cd ~/nazar/services/minecraft
nix flake check --no-build
git -C ~/nazar status
# commit and push durable changes from ~/nazar
```

Switch production from the Nazar host after committing the monorepo change:

```bash
cd /root/nazar
nix flake check --no-build
nix run .#switch-minecraft
```

## Lifecycle

Lifecycle is managed by the Nazar host MicroVM unit:

```bash
systemctl status microvm@minecraft
systemctl restart microvm@minecraft
journalctl -u microvm@minecraft -f
```

## Service checks

```bash
ssh alex@minecraft systemctl status minecraft-server --no-pager
ssh alex@minecraft journalctl -u minecraft-server -n 100 --no-pager
nc -vz mc.nazar.studio 25565
```

## Policy

- Keep Minecraft as a MicroVM in the declarative Nazar fleet.
- Keep host firewall/public forwarding in `/root/nazar` only.
- Keep mutable world/plugin state under `/var/lib/minecraft`.
- Do not add alternate VM builders or host-specific hardware profiles.
