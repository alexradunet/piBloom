# Quick Deploy

> Install a plain OVH base system with `nixos-anywhere`, bootstrap NixPI once, then manage it from your personal Git repo

## Audience

Operators and maintainers provisioning a standard NixOS host on a headless x86_64 VPS, then managing it from a workstation-first `nixpi` repository workflow.

## Security Note: Public SSH Is CIDR-Restricted

NixPI uses plain SSH for remote administration, but only from explicitly allowlisted admin CIDRs. If the allowlist is wrong, recover through OVH console or rescue mode rather than a separate VPN overlay.

## Canonical Deployment Path

The recommended deployment flow is:

1. Put the VPS into rescue mode.
2. Run the `plain-host-deploy` wrapper.
3. Let `nixos-anywhere` install the `ovh-vps-base` system.
4. Reconnect to the installed machine after first boot.
5. Bootstrap NixPI on the host once.
6. Clone and maintain your personal `nixpi` repo on your workstation.
7. Validate, push, and explicitly apply repo changes to the host.

The host remains the deployment target. The personal `nixpi` repository is the canonical authoring source for ongoing changes.

## 1. Enter rescue mode

Use the provider control panel to boot the VPS into rescue mode, then confirm you can SSH into the rescue environment as `root`.

For OVH-specific steps, follow [OVH Rescue Deploy](./ovh-rescue-deploy).

## 2. Run the install wrapper

From your local checkout:

```bash
nix run .#plain-host-deploy -- \
  --target-host root@SERVER_IP \
  --disk /dev/disk/by-id/PERSISTENT_TARGET_DISK_ID
```

The install is destructive and installs the plain `ovh-vps-base` provisioner preset only.

If the install fails with `No space left on device` during closure upload, do not assume the VPS disk is too small. On some OVH rescue hosts the disk order changes after `nixos-anywhere` kexecs into its temporary installer. Follow the staged troubleshooting flow in [OVH Rescue Deploy](./ovh-rescue-deploy) to inspect `/dev/disk/by-id` inside the installer and rerun the remaining phases with the correct installer-side disk ID.

If OVH KVM later stalls at SeaBIOS `Booting from Hard Disk...`, treat that as a boot-layout mismatch rather than a finished install. Reinstall from the updated repo so the current hybrid BIOS+EFI OVH disk layout is applied.

## 3. Optionally bootstrap NixPI after first boot

If the machine appears to reboot correctly but KVM still shows the OVH rescue environment, confirm the OVH control panel has been switched back from rescue mode to normal disk boot before debugging the installed system itself.

After the base system boots, reconnect to the machine and run:

```bash
nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- \
  --primary-user alex \
  --ssh-allowed-cidr YOUR_ADMIN_IP/32 \
  --authorized-key-file /root/.ssh/authorized_keys \
  --timezone Europe/Bucharest \
  --keyboard us
```

Without `--hostname`, the installed host keeps the default `nixos` hostname.
The first rebuild stays in bootstrap mode so public SSH remains available from the configured admin CIDRs while you validate the host and complete the operator handoff.

If `/etc/nixos/flake.nix` already exists, follow the printed manual integration instructions and rebuild `/etc/nixos#nixos` explicitly.

If bootstrap fails with the GRUB assertion about `boot.loader.grub.devices`, do not debug the plain OVH base install first.
That usually means `/etc/nixos/configuration.nix` was generated separately with `nixos-generate-config` and conflicts with this bootstrap flow.
Keep `/etc/nixos/hardware-configuration.nix`, move `configuration.nix` out of the way, then rerun bootstrap with `--force`:

```bash
mv /etc/nixos/configuration.nix /etc/nixos/configuration.nix.before-nixpi
nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- \
  ... \
  --force
```

## 4. Validate, push, and apply from your workstation

From your local `nixpi` checkout, validate and publish the intended host state:

```bash
nix flake check --no-build
nix build .#checks.x86_64-linux.config --no-link
git add -A
git commit -m "Update NixPI repository state"
git push origin main
```

Apply the repo state to the host explicitly:

```bash
sudo nixpi-brokerctl nixos-update apply /var/lib/nixpi/pi-nixpi#nixos
```

## 5. Use the standard rebuild path on the host

The applied host flake remains the runtime convergence target:

```bash
sudo nixpi-rebuild
```

Manual recovery or existing-flake integration also rebuilds through the same host-owned root:

```bash
sudo nixos-rebuild switch --flake /etc/nixos#nixos --impure
```

Roll back if needed:

```bash
sudo nixos-rebuild switch --rollback
```

## 6. Validate the shell runtime

Smoke-check the core services on a running host:

```bash
systemctl status nixpi-app-setup.service
systemctl status sshd.service
systemctl status nixpi-update.timer
command -v pi
su - <user> -c 'pi --help'
sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowtcpforwarding|allowagentforwarding'
sudo nft list ruleset | grep 'dport 22'
```

Expected result:

- the Pi runtime is available from SSH
- the deployed host mode comes from NixOS config rather than user-home markers
- the personal `nixpi` repository remains the source of authored changes
- the host applies the intended repo state without manual drift
- shell behavior already matches the deployed NixOS configuration
- SSH is key-only and port `22` is scoped to the expected admin CIDRs

For repo-side validation during development:

```bash
nix --option substituters https://cache.nixos.org/ build .#checks.x86_64-linux.config --no-link
nix build .#checks.x86_64-linux.nixpi-firstboot --no-link -L
```
