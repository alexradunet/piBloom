# Quick Deploy

> Build, install, and validate NixPI

## 🌱 Audience

Operators and maintainers installing NixPI from the official installer image or validating local builds.

## 🛡️ Security Note: NetBird is Mandatory

NetBird is the network security boundary for all NixPI services. The firewall trusts only the NetBird interface (`wt0`). Without NetBird running, all services (Matrix, Home, Element Web) are exposed to the local network.

**Complete NetBird setup and verify `wt0` is active before exposing this machine to any network.** See [Security Model](../reference/security-model) for the full threat model.

## 🚀 Installation Workflow

NixPI ships as a minimal NixOS installer image. It boots to a console and exposes a destructive terminal installer wizard as `nixpi-installer`.

### 1. Build or Download the Installer ISO

Build locally:

```bash
nix build .#installerIso
```

The resulting image is in `./result/iso/`.

### 2. Write the Image to USB

Use your preferred image writer, or from a Linux host:

```bash
sudo dd if=./result/iso/*.iso of=/dev/<usb-device> bs=4M status=progress oflag=sync
```

### 3. Install NixPI

1. Boot the USB stick
2. Open a root shell with `sudo -i`
3. Run `nixpi-installer`
4. Choose the target disk, hostname, and primary user
5. Confirm the destructive install
6. Reboot into the installed system

The installed machine lands with a standard local system flake in `/etc/nixos` and a local NixPI working tree should be maintained in `~/nixpi`.

### 4. Complete Setup

Run the setup wizard after reboot if it does not auto-start:

```bash
setup-wizard.sh
```

The wizard auto-runs on TTY login before setup completes. If it doesn't start, run `setup-wizard.sh` manually.

## 💻 Development: Local Builds and VM Testing

For development and testing, use the QEMU VM workflow.

### Prerequisites

Install [Nix](https://determinate.systems/posts/determinate-nix-installer/) and `just`:

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
sudo dnf install -y just qemu-system-x86 edk2-ovmf   # Fedora build host
```

Or install all deps at once:

```bash
just deps
```

### Common Commands

```bash
just iso             # Build the installer ISO
just vm              # Build and run VM (headless, serial console)
just vm-gui          # Run VM with GUI display
just vm-ssh          # SSH into running VM
just vm-stop         # Stop the VM
just check-config    # Fast: validate NixOS config
just check-boot      # Thorough: boot test in VM
```

**Default operator user**: the user chosen during `nixpi-installer`. The `agent` system user owns the always-on runtime.

## 🔄 OTA Updates

Use `~/nixpi` as the canonical editable source of truth for an installed system. Treat `/etc/nixos` as deployed compatibility state, not the repo you edit or sync.

The recommended fork-first workflow is:

```bash
git clone <your-fork-url> ~/nixpi
cd ~/nixpi
git remote add upstream https://github.com/alexradunet/nixpi.git
```

To apply local changes manually:

```bash
cd ~/nixpi
sudo nixos-rebuild switch --flake .
```

To sync with upstream and rebuild:

```bash
cd ~/nixpi
git fetch upstream
git rebase upstream/main
git push origin main
sudo nixos-rebuild switch --flake .
```

Automatic updates remain local-only and do not `git pull` for the user. Syncing a fork with upstream stays a manual step so local customizations remain under the operator's control.

To roll back:

```bash
sudo nixos-rebuild switch --rollback
```

## 🔗 Related

- [First Boot Setup](./first-boot-setup)
- [Live Testing](./live-testing)
- [Security Model](../reference/security-model)
