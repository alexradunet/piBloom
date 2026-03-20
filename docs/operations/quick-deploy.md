# Quick Deploy

> Build, install, and validate NixPI

## 🌱 Audience

Operators and maintainers installing NixPI from the official installer image or validating local builds.

## 🛡️ Security Note: NetBird is Mandatory

NetBird is the network security boundary for all NixPI services. The firewall trusts only the NetBird interface (`wt0`). Without NetBird running, all services (Matrix, Home, Element Web) are exposed to the local network.

**Complete NetBird setup and verify `wt0` is active before exposing this machine to any network.** See [Security Model](../reference/security-model) for the full threat model.

## 🚀 Installation Workflow

NixPI ships as a standard graphical NixOS installer image. It is based on the upstream GNOME + Calamares installer and writes a normal `/etc/nixos/flake.nix` on the installed machine.

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
2. Launch the graphical installer
3. Choose disk layout, timezone, hostname, and your primary user
4. Reboot into the installed system

The installed machine lands with a standard local system flake in `/etc/nixos`.

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

**Default operator user**: the user chosen during graphical install. The `agent` system user owns the always-on runtime.

## 🔄 OTA Updates

The installed system uses the local `/etc/nixos` flake. To apply updates manually:

```bash
sudo nix flake update /etc/nixos
sudo nixos-rebuild switch --flake /etc/nixos
```

To roll back:

```bash
sudo nixos-rebuild switch --rollback
```

## 🔗 Related

- [First Boot Setup](./first-boot-setup)
- [Live Testing](./live-testing)
- [Security Model](../reference/security-model)
