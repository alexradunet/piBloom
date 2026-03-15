# Bloom OS Quick Deploy

> 📖 [Emoji Legend](LEGEND.md)

Audience: operators and maintainers building images or booting test VMs.

## 🌱 Why This Guide Exists

This guide is the operational path for building and booting Bloom from the current `justfile`.

Use it for:

- local image builds
- QEMU test boots
- ISO generation
- manual `bootc` installs

## 🚀 How To Build And Boot Bloom

### Prerequisites

Fedora host dependencies:

```bash
sudo dnf install -y just podman qemu-system-x86 edk2-ovmf
```

Create a local bootc-image-builder config before generating images:

```bash
cp core/os/disk_config/bib-config.example.toml core/os/disk_config/bib-config.toml
```

Edit `core/os/disk_config/bib-config.toml` with your desired password, SSH key, and optional customizations.

### Fast Dev Path: QEMU

```bash
just build
just qcow2
just vm
```

Forwarded ports in `just vm`:

- `2222` -> guest SSH
- `5000` -> `dufs`
- `8080` -> guest port `8080`
- `8081` -> `fluffychat`
- `8888` -> guest port `80`

Access the VM:

```bash
just vm-ssh
```

Stop it:

```bash
just vm-kill
```

Important note:

- `code-server` runs on host networking inside the guest and listens on guest port `8443`
- `just vm` does not currently forward guest `8443` to the host, so `code-server` is not reachable from the host unless you add your own QEMU forwarding or access it from inside the guest / mesh

### ISO Build

**Offline ISO** (embedded container, no network needed during install):
```bash
just iso
```

**Production ISO** (downloads from registry during install, requires ethernet):
```bash
just iso-production
```

Both write outputs under `core/os/output/`.

**After installing from offline ISO:** The setup wizard will ask if you want to switch to the registry image for OTA updates. You can also switch manually later:
```bash
sudo bootc switch --transport registry ghcr.io/alexradunet/bloom-os:latest
```

### Direct bootc Install

For advanced manual installation after a local build:

```bash
sudo bootc install to-disk /dev/sdX --source-imgref containers-storage:localhost/bloom-os:latest
```

Replace `/dev/sdX` with the target disk.

## 📚 Reference

Important outputs:

- image tag default: `localhost/bloom-os:latest`
- qcow2 path: `core/os/output/qcow2/disk.qcow2`
- production registry default in `justfile`: `ghcr.io/alexradunet/bloom-os:latest`

Related `just` commands:

```bash
just deps
just clean
just lint-os
```

After first login:

1. complete `bloom-wizard.sh`
2. let Pi resume the persona step
3. use `setup_status` if you need to inspect or resume Pi-side setup state

## 🔗 Related

- [pibloom-setup.md](pibloom-setup.md)
- [live-testing-checklist.md](live-testing-checklist.md)
