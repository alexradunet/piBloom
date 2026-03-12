# Bloom OS Build Modernization

**Date**: 2026-03-12
**Status**: Approved
**Scope**: Restructure `os/` directory and Containerfile to follow bootc best practices from kde-bootc, zirconium, and ublue-os/image-template.

## Problem

Bloom's OS image build has grown organically. Packages are inline in the Containerfile, config files use arbitrary names in a flat `sysconfig/` directory, services are enabled via `systemctl enable` calls scattered through the Containerfile, and there is no CI/CD for image builds. This makes the build hard to audit, slow to iterate on, and inconsistent with the bootc ecosystem's established patterns.

## Reference Repositories

| Repository | Key Patterns Adopted |
|------------|---------------------|
| [kde-bootc](https://github.com/sigulete/kde-bootc) | Declarative package lists (text files with comments), explicit package removal with reasons, `/var/log` cleanup |
| [zirconium](https://github.com/zirconium-dev/zirconium) | `scratch` context stage, fetch/post script split with `--network=none`, BuildKit cache mounts, `system_files/` mirroring real filesystem, systemd presets, os-release branding, cosign signing, OCI labels, `/opt` + `/usr/local` symlinks |
| [ublue-os/image-template](https://github.com/ublue-os/image-template) | `scratch` context stage, CI/CD pipeline (build + push + sign), disk image workflow, justfile recipes for VM testing, shellcheck linting |

## Decisions

### Adopted
- `FROM scratch AS ctx` build context pattern
- BuildKit cache mounts for dnf (`--mount=type=cache,dst=/var/cache/libdnf5`)
- tmpfs mounts for `/tmp` during build (not `/var` — dnf needs the RPM database)
- Fetch/post script split with `--network=none` on post steps
- `system_files/` directory mirroring real filesystem layout
- Declarative package lists (`packages-install.txt`, `packages-remove.txt`)
- Repository setup extracted to `packages/repos.sh`
- systemd presets file instead of `systemctl enable` calls
- Cosign image signing (keypair generation, CI integration)
- Full OCI labels in Containerfile
- os-release branding (`PRETTY_NAME="Bloom OS"`)
- `/opt → /var/opt` symlink for day-2 package installs
- `rm -rf /var/*` cleanup before `bootc container lint`
- Mask upstream `bootc-fetch-apply-updates.timer`
- GitHub Actions CI/CD for image build + push + sign
- Separate manual workflow for disk image generation
- Shellcheck linting for build scripts
- `disk_config/` directory for BIB configs (iso.toml, disk.toml)

### Rejected (overcomplication for Bloom)
- Multi-arch builds (Bloom targets x86_64 mini-PCs only)
- Image rechunking (not needed at our image size/update frequency)
- ArtifactHub metadata (not a public distro)
- ISO branding with mkksiso (overkill for our install flow)
- Container `policy.json` with signature verification (premature)
- Renovate/Dependabot (can add later if needed)
- Chezmoi dotfile management (we have our own persona system)
- `/usr/local → /var/usrlocal` symlink (we install global npm packages to `/usr/local`, breaking this would require rework)

## Directory Structure

### Before

```
os/
├── Containerfile
├── bib-config.example.toml
├── bootc/
│   └── config.toml
├── scripts/                    (empty)
└── sysconfig/
    ├── bloom-bash_profile
    ├── bloom-bashrc
    ├── bloom-greeting.sh
    ├── bloom-matrix.service
    ├── bloom-matrix.toml
    ├── bloom-sudoers
    ├── bloom-sysctl.conf
    ├── bloom-tmpfiles.conf
    ├── bloom-update-check.service
    ├── bloom-update-check.sh
    ├── bloom-update-check.timer
    ├── getty-autologin.conf
    └── pi-daemon.service
```

### After

```
os/
├── Containerfile
├── build_files/
│   ├── 00-base-pre.sh            # Package removal (offline)
│   ├── 00-base-fetch.sh          # dnf install from package lists (network)
│   ├── 00-base-post.sh           # Copy system_files, presets, branding (offline)
│   ├── 01-bloom-fetch.sh         # npm install global CLI tools (network)
│   └── 01-bloom-post.sh          # Build TypeScript, configure Pi (offline)
├── system_files/
│   ├── etc/
│   │   ├── hostname
│   │   ├── issue
│   │   ├── skel/
│   │   │   ├── .bashrc
│   │   │   └── .bash_profile
│   │   ├── ssh/
│   │   │   └── sshd_config.d/
│   │   │       └── 50-bloom.conf
│   │   ├── sudoers.d/
│   │   │   └── 10-bloom
│   │   └── bloom/
│   │       └── matrix.toml
│   └── usr/
│       ├── lib/
│       │   ├── bootc/
│       │   │   └── install/
│       │   │       └── config.toml
│       │   ├── sysctl.d/
│       │   │   └── 60-bloom-console.conf
│       │   ├── systemd/
│       │   │   ├── system/
│       │   │   │   ├── bloom-matrix.service
│       │   │   │   ├── bloom-update-check.service
│       │   │   │   ├── bloom-update-check.timer
│       │   │   │   ├── getty@tty1.service.d/
│       │   │   │   │   └── autologin.conf
│       │   │   │   └── serial-getty@ttyS0.service.d/
│       │   │   │       └── autologin.conf
│       │   │   ├── system-preset/
│       │   │   │   └── 01-bloom.preset
│       │   │   └── user/
│       │   │       └── pi-daemon.service
│       │   └── tmpfiles.d/
│       │       └── bloom.conf
│       └── local/
│           └── bin/
│               ├── bloom-greeting.sh
│               └── bloom-update-check.sh
├── packages/
│   ├── packages-install.txt       # Categorized package list with comments
│   ├── packages-remove.txt        # Packages to remove with reasons
│   └── repos.sh                   # Third-party repository setup
├── disk_config/
│   ├── disk.toml                  # BIB config for qcow2/raw
│   ├── iso.toml                   # Anaconda ISO config with bootc switch kickstart
│   └── bib-config.example.toml    # Example with user password placeholder
└── output/                        # Build artifacts (gitignored)
```

## Containerfile

```dockerfile
ARG CONTINUWUITY_IMAGE=forgejo.ellis.link/continuwuation/continuwuity:0.5.0-rc.6
ARG PI_CODING_AGENT_VERSION=0.57.1
ARG BIOME_VERSION=2.4.6
ARG TYPESCRIPT_VERSION=5.9.3
ARG CLAUDE_CODE_VERSION=2.1.73

FROM ${CONTINUWUITY_IMAGE} AS continuwuity-src

FROM scratch AS ctx
COPY os/build_files /build
COPY os/system_files /files
COPY os/packages /packages

FROM quay.io/fedora/fedora-bootc:42

# Phase 1: Remove unwanted packages
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    /ctx/build/00-base-pre.sh

# Phase 2: Install system packages (network)
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=cache,dst=/var/cache/libdnf5 \
    --mount=type=tmpfs,dst=/tmp \
    /ctx/build/00-base-fetch.sh

# Phase 3: Copy system files, apply presets, branding (offline)
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    --network=none \
    /ctx/build/00-base-post.sh

# Phase 4: Install Node.js CLI tools + Bloom npm deps (network)
ARG PI_CODING_AGENT_VERSION
ARG BIOME_VERSION
ARG TYPESCRIPT_VERSION
ARG CLAUDE_CODE_VERSION
COPY package.json package-lock.json /usr/local/share/bloom/
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    PI_CODING_AGENT_VERSION=${PI_CODING_AGENT_VERSION} \
    BIOME_VERSION=${BIOME_VERSION} \
    TYPESCRIPT_VERSION=${TYPESCRIPT_VERSION} \
    CLAUDE_CODE_VERSION=${CLAUDE_CODE_VERSION} \
    /ctx/build/01-bloom-fetch.sh

# Phase 5: Build Bloom TypeScript, configure Pi (offline)
COPY . /usr/local/share/bloom/
COPY --from=continuwuity-src /sbin/conduwuit /usr/local/bin/continuwuity
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    --network=none \
    /ctx/build/01-bloom-post.sh

# Optional: pre-configure WiFi for headless first-boot
ARG WIFI_SSID=""
ARG WIFI_PSK=""
RUN if [ -n "$WIFI_SSID" ]; then \
    printf '[connection]\nid=%s\ntype=wifi\nautoconnect=true\n\n[wifi]\nmode=infrastructure\nssid=%s\n\n[wifi-security]\nkey-mgmt=wpa-psk\npsk=%s\n\n[ipv4]\nmethod=auto\n\n[ipv6]\nmethod=auto\n' \
        "$WIFI_SSID" "$WIFI_SSID" "$WIFI_PSK" \
        > /etc/NetworkManager/system-connections/wifi.nmconnection && \
    chmod 600 /etc/NetworkManager/system-connections/wifi.nmconnection; \
fi

# Symlink /opt to /var/opt for day-2 package installs
RUN rm -rf /opt && ln -s /var/opt /opt

# Final cleanup + validation
RUN rm -rf /var/* && mkdir -p /var/tmp /var/opt && bootc container lint

LABEL containers.bootc="1"
LABEL org.opencontainers.image.title="Bloom OS"
LABEL org.opencontainers.image.description="Pi-native AI companion OS on Fedora bootc"
LABEL org.opencontainers.image.source="https://github.com/pibloom/pi-bloom"
LABEL org.opencontainers.image.version="0.1.0"
```

## Build Scripts

### `00-base-pre.sh` — Package removal

```bash
#!/bin/bash
set -xeuo pipefail

# Remove packages that conflict with bootc immutability or are unnecessary
grep -vE '^\s*(#|$)' /ctx/packages/packages-remove.txt | xargs dnf -y remove || true
dnf -y autoremove || true
```

### `00-base-fetch.sh` — Package installation (network)

```bash
#!/bin/bash
set -xeuo pipefail

dnf -y install dnf5-plugins

# Add third-party repositories
source /ctx/packages/repos.sh

# Install all packages from the list
grep -vE '^\s*(#|$)' /ctx/packages/packages-install.txt | xargs dnf -y install --allowerasing
dnf clean all
```

### `00-base-post.sh` — System configuration (offline)

```bash
#!/bin/bash
set -xeuo pipefail

# Copy all system files to their filesystem locations
# (includes systemd units, presets, skel, ssh config, sudoers, etc.)
cp -avf /ctx/files/. /

# Apply only Bloom's preset entries (not all system presets)
systemctl preset \
    sshd.service \
    netbird.service \
    bloom-matrix.service \
    bloom-update-check.timer

# Mask upstream auto-update timer (we have our own)
systemctl mask bootc-fetch-apply-updates.timer

# Mask unused NFS services
systemctl mask rpcbind.service rpcbind.socket rpc-statd.service

# OS branding
sed -i 's|^PRETTY_NAME=.*|PRETTY_NAME="Bloom OS"|' /usr/lib/os-release

# Remove empty NetBird state files (prevents JSON parse crash on boot)
rm -f /var/lib/netbird/active_profile.json /var/lib/netbird/default.json

# Firewall: trust NetBird tunnel interface
firewall-offline-cmd --zone=trusted --add-interface=wt0

# Set boot target
systemctl set-default multi-user.target
```

### `01-bloom-fetch.sh` — Node.js tooling + Bloom deps (network)

```bash
#!/bin/bash
set -xeuo pipefail

# Global CLI tools (pinned versions)
HOME=/tmp npm install -g --cache /tmp/npm-cache \
    "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    "@mariozechner/pi-coding-agent@${PI_CODING_AGENT_VERSION}" \
    "@biomejs/biome@${BIOME_VERSION}" \
    "typescript@${TYPESCRIPT_VERSION}"

# Bloom package dependencies (cached — only re-runs when package.json changes)
cd /usr/local/share/bloom
HOME=/tmp npm install --cache /tmp/npm-cache

rm -rf /tmp/npm-cache /var/roothome/.npm /root/.npm
```

### `01-bloom-post.sh` — Build Bloom + configure Pi (offline)

```bash
#!/bin/bash
set -xeuo pipefail

cd /usr/local/share/bloom

# Build TypeScript and prune dev deps
npm run build
npm prune --omit=dev

# Symlink globally-installed Pi SDK into Bloom's node_modules
ln -sf /usr/local/lib/node_modules/@mariozechner /usr/local/share/bloom/node_modules/@mariozechner

# Configure Pi settings defaults (immutable layer)
mkdir -p /usr/local/share/bloom/.pi/agent
echo '{"packages": ["/usr/local/share/bloom"]}' > /usr/local/share/bloom/.pi/agent/settings.json

# Persona directory
mkdir -p /usr/local/share/bloom/persona

# Continuwuity binary
chmod +x /usr/local/bin/continuwuity

# Appservices directory
mkdir -p /etc/bloom/appservices
```

## Package Lists

### `packages/packages-install.txt`

```
# System essentials
sudo
openssl
curl
wget
unzip
jq

# Development tools
git
git-lfs
ripgrep
fd-find
bat
htop
just
ShellCheck
tmux

# Runtime
nodejs
npm
libatomic

# Container tooling
podman
buildah
skopeo
oras

# VM testing
qemu-system-x86
edk2-ovmf

# Network & remote access
openssh-server
openssh-clients
firewalld

# Desktop (for remote access via code-server/Cinny)
chromium

# VS Code (repo added by repos.sh)
code

# Mesh networking (repo added by repos.sh)
netbird
```

### `packages/packages-remove.txt`

```
# Conflicts with bootc immutability — tries to install packages on immutable OS
PackageKit-command-not-found

# Unnecessary — journalctl provides better logging for servers
rsyslog

# Unnecessary — bootc provides rollback, no rescue initramfs needed
dracut-config-rescue

# Deprecated — firewalld uses nftables directly
iptables-services
iptables-utils
```

### `packages/repos.sh`

```bash
#!/bin/bash
# Third-party repository setup — sourced by 00-base-fetch.sh

# VS Code (Microsoft)
rpm --import https://packages.microsoft.com/keys/microsoft.asc
printf '[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc\n' \
    > /etc/yum.repos.d/vscode.repo

# NetBird mesh networking
printf '[netbird]\nname=netbird\nbaseurl=https://pkgs.netbird.io/yum/\nenabled=1\ngpgcheck=0\nrepo_gpgcheck=1\ngpgkey=https://pkgs.netbird.io/yum/repodata/repomd.xml.key\n' \
    > /etc/yum.repos.d/netbird.repo
```

## System Files

### `system_files/usr/lib/systemd/system-preset/01-bloom.preset`

```
# Bloom OS service presets
enable sshd.service
enable netbird.service
enable bloom-matrix.service
enable bloom-update-check.timer
```

All other system files are the same content as current `os/sysconfig/` files, just moved to their filesystem-mirrored locations. See the Migration Notes table for the complete mapping.

## Disk Config

### `disk_config/iso.toml`

```toml
[customizations.installer.kickstart]
contents = """
%post
bootc switch --mutate-in-place --transport registry ghcr.io/pibloom/bloom-os:latest
%end
"""

[customizations.installer.modules]
enable = [
  "org.fedoraproject.Anaconda.Modules.Storage",
  "org.fedoraproject.Anaconda.Modules.Runtime",
  "org.fedoraproject.Anaconda.Modules.Users"
]
disable = [
  "org.fedoraproject.Anaconda.Modules.Subscription"
]
```

### `disk_config/disk.toml`

```toml
[install.filesystem.root]
type = "btrfs"

[[customizations.filesystem]]
mountpoint = "/"
minsize = "40 GiB"
```

## CI/CD

### `.github/workflows/build-os.yml`

Triggers on push to main (when `os/`, `Containerfile`, `package.json`, or source changes), weekly schedule, and manual dispatch. Steps:

1. Checkout
2. `podman build -f os/Containerfile -t bloom-os:latest .`
3. Login to GHCR
4. Push to `ghcr.io/pibloom/bloom-os:latest`
5. Cosign sign with `SIGNING_SECRET`

### `.github/workflows/build-disk.yml`

Manual dispatch only. Builds ISO or qcow2 via bootc-image-builder, uploads as artifact.

## Justfile Changes

- Update `build` recipe to use new Containerfile location (unchanged — it already points to `os/Containerfile`)
- Update BIB config paths: `bib_config` → `os/disk_config/disk.toml` for qcow2, `os/disk_config/iso.toml` for ISO
- Add `lint-os` recipe: `shellcheck os/build_files/*.sh os/packages/repos.sh`
- Update `iso` and `qcow2` recipes to use `disk_config/` paths

## Cosign Setup

One-time setup (documented in README, not automated):
1. `COSIGN_PASSWORD="" cosign generate-key-pair`
2. Commit `cosign.pub` to repo root
3. Add `cosign.key` content as `SIGNING_SECRET` GitHub secret
4. Add `cosign.key` to `.gitignore`

## Justfile Changes

Replace the single `bib_config` variable with per-type configs:

```just
bib_config_disk := "os/disk_config/disk.toml"
bib_config_iso := "os/disk_config/iso.toml"
```

Update `qcow2` recipe to use `bib_config_disk`, `iso` recipe to use `bib_config_iso`. Remove the generic `_require-bib-config` guard in favor of per-recipe checks. Add:

```just
# Lint OS build scripts
lint-os:
    shellcheck os/build_files/*.sh os/packages/repos.sh
```

## Migration Notes

### File moves
| Source | Destination |
|--------|------------|
| `os/sysconfig/bloom-bashrc` | `os/system_files/etc/skel/.bashrc` |
| `os/sysconfig/bloom-bash_profile` | `os/system_files/etc/skel/.bash_profile` |
| `os/sysconfig/bloom-sudoers` | `os/system_files/etc/sudoers.d/10-bloom` |
| `os/sysconfig/bloom-sysctl.conf` | `os/system_files/usr/lib/sysctl.d/60-bloom-console.conf` |
| `os/sysconfig/bloom-tmpfiles.conf` | `os/system_files/usr/lib/tmpfiles.d/bloom.conf` |
| `os/sysconfig/bloom-matrix.service` | `os/system_files/usr/lib/systemd/system/bloom-matrix.service` |
| `os/sysconfig/bloom-matrix.toml` | `os/system_files/etc/bloom/matrix.toml` |
| `os/sysconfig/bloom-update-check.service` | `os/system_files/usr/lib/systemd/system/bloom-update-check.service` |
| `os/sysconfig/bloom-update-check.timer` | `os/system_files/usr/lib/systemd/system/bloom-update-check.timer` |
| `os/sysconfig/bloom-update-check.sh` | `os/system_files/usr/local/bin/bloom-update-check.sh` |
| `os/sysconfig/bloom-greeting.sh` | `os/system_files/usr/local/bin/bloom-greeting.sh` |
| `os/sysconfig/pi-daemon.service` | `os/system_files/usr/lib/systemd/user/pi-daemon.service` |
| `os/sysconfig/getty-autologin.conf` | `os/system_files/usr/lib/systemd/system/getty@tty1.service.d/autologin.conf` (and serial-getty) |
| `os/bootc/config.toml` | `os/system_files/usr/lib/bootc/install/config.toml` |
| `os/bib-config.example.toml` | `os/disk_config/bib-config.example.toml` |

### New files to create
| File | Content |
|------|---------|
| `os/system_files/etc/hostname` | `bloom` |
| `os/system_files/etc/issue` | `Bloom OS\n\n` |
| `os/system_files/etc/ssh/sshd_config.d/50-bloom.conf` | `PasswordAuthentication yes\nPubkeyAuthentication no` |
| `os/system_files/usr/lib/systemd/system-preset/01-bloom.preset` | Preset entries for Bloom services |

### Removals
- `os/sysconfig/` directory (all files moved)
- `os/scripts/` directory (empty, replaced by `os/build_files/`)
- `os/bootc/` directory (config moved to `system_files/`)
- `build-iso.sh` at repo root (justfile covers this)

### Verification
After migration, verify the built image produces identical filesystem layout:
1. Build both old and new Containerfile
2. `podman run --rm old-image find /etc /usr/lib/systemd /usr/local/bin -type f | sort > old.txt`
3. `podman run --rm new-image find /etc /usr/lib/systemd /usr/local/bin -type f | sort > new.txt`
4. `diff old.txt new.txt` — should show only the new preset file and os-release changes
