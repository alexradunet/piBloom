# Cloud VPS Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Bloom OS deployable on OVH Cloud VPS (and any cloud-init-capable provider) by adding cloud provisioning, SSH server, and registry push workflow.

**Architecture:** Add cloud-init + openssh-server to the existing unified Containerfile (no separate "cloud" image). cloud-init handles user provisioning on OpenStack platforms (OVH Public Cloud, Hetzner, etc.). For non-OpenStack VPS (OVH legacy), use rescue mode with `bootc install to-disk` + NoCloud seed. After deployment, OTA updates via `bootc upgrade` pulling from GHCR.

**Tech Stack:** cloud-init, openssh-server, podman/GHCR, bootc install, just

---

## Task 1: Add openssh-server and cloud-init to Containerfile

**Files:**
- Modify: `os/Containerfile:7-44` (dnf install block)
- Modify: `os/Containerfile:58` (after NetBird systemctl enable)

**Step 1: Add packages to dnf install block**

In `os/Containerfile`, add `openssh-server` and `cloud-init` to the main `dnf install` block (after `openssh-clients` on line 19):

```dockerfile
    openssh-server \
    cloud-init \
```

**Step 2: Enable sshd**

After line 58 (`RUN systemctl enable netbird`), add:

```dockerfile
RUN systemctl enable sshd.service
```

Note: cloud-init services are auto-enabled by Fedora's RPM presets — no explicit enable needed.

**Step 3: Build the image**

Run: `just build`
Expected: Build succeeds, `bootc container lint` passes at end.

**Step 4: Commit**

```bash
git add os/Containerfile
git commit -m "feat(os): add openssh-server and cloud-init for VPS deployment"
```

---

## Task 2: Create cloud-init bloom configuration

**Files:**
- Create: `os/sysconfig/cloud-init-bloom.cfg`
- Modify: `os/Containerfile` (add COPY line)

**Step 1: Create the cloud-init override config**

Create `os/sysconfig/cloud-init-bloom.cfg`:

```yaml
# Bloom OS cloud-init defaults
# Override Fedora's default user ('fedora') with 'bloom'
system_info:
  default_user:
    name: bloom
    lock_passwd: true
    groups: [wheel]
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    shell: /bin/bash
```

This is intentionally minimal — Fedora's default cloud-init modules handle SSH key injection, hostname, disk resize, etc.

**Step 2: Add COPY to Containerfile**

After the sysctl COPY line (`os/Containerfile:106`), add:

```dockerfile
# Cloud-init: override default user for cloud VPS deployment
COPY os/sysconfig/cloud-init-bloom.cfg /etc/cloud/cloud.cfg.d/99-bloom.cfg
```

**Step 3: Build the image**

Run: `just build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add os/sysconfig/cloud-init-bloom.cfg os/Containerfile
git commit -m "feat(os): add cloud-init bloom user config"
```

---

## Task 3: Add registry push targets to justfile

**Files:**
- Modify: `justfile` (after `iso-production` target, ~line 98)

**Step 1: Add login and push targets**

After the `iso-production` target in `justfile`, add:

```just
# Login to container registry (GHCR)
login:
	{{ podman }} login ghcr.io

# Push image to container registry for cloud deployment + OTA updates
push: build
	{{ podman }} tag {{ image }} {{ remote_image }}
	{{ podman }} push {{ remote_image }}
```

**Step 2: Verify justfile syntax**

Run: `just --list`
Expected: Output includes `login` and `push` targets.

**Step 3: Commit**

```bash
git add justfile
git commit -m "feat: add login and push targets to justfile"
```

---

## Task 4: Add cloud QEMU test target and fixtures

**Files:**
- Create: `os/test/cloud-init/meta-data`
- Create: `os/test/cloud-init/user-data`
- Modify: `justfile` (add `vm-cloud` target)

**Step 1: Create cloud-init NoCloud test fixtures**

Create `os/test/cloud-init/meta-data`:

```yaml
instance-id: bloom-test
local-hostname: bloom-test
```

Create `os/test/cloud-init/user-data`:

```yaml
#cloud-config
users:
  - default
ssh_authorized_keys:
  - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBynaoLubnHPtUl+LsSUlYzZ6uidMnxuVBBQnllga8NZ test@bloom
```

The `- default` entry tells cloud-init to create the default user (`bloom`, per our 99-bloom.cfg). The `ssh_authorized_keys` field injects the test SSH key.

**Step 2: Add vm-cloud target to justfile**

After the `vm-serial` target, add:

```just
# Boot qcow2 simulating cloud environment (cloud-init NoCloud datasource)
vm-cloud:
	genisoimage -output {{ output }}/cloud-init.iso -volid cidata -joliet -rock \
		os/test/cloud-init/user-data os/test/cloud-init/meta-data
	qemu-system-x86_64 \
		-machine q35 \
		-cpu host \
		-enable-kvm \
		-m 4G \
		-smp 2 \
		-drive if=pflash,format=raw,readonly=on,file={{ ovmf }} \
		-drive if=pflash,format=raw,snapshot=on,file={{ ovmf_vars }} \
		-drive file={{ output }}/qcow2/disk.qcow2,format=qcow2,if=virtio \
		-drive file={{ output }}/cloud-init.iso,format=raw,if=virtio \
		-netdev user,id=net0,hostfwd=tcp::2222-:22 \
		-device virtio-net-pci,netdev=net0 \
		-nographic \
		-serial mon:stdio
```

**Step 3: Add genisoimage to deps target**

Update the `deps` target:

```just
deps:
	sudo dnf install -y just podman qemu-system-x86 edk2-ovmf genisoimage
```

**Step 4: Verify justfile syntax**

Run: `just --list`
Expected: Output includes `vm-cloud` target.

**Step 5: Commit**

```bash
git add os/test/cloud-init/ justfile
git commit -m "feat: add vm-cloud target for testing cloud-init provisioning"
```

---

## Task 5: Build and integration test

**Step 1: Build qcow2 image**

Run: `just qcow2`
Expected: Image builds and qcow2 is generated at `os/output/qcow2/disk.qcow2`.

**Step 2: Boot with cloud-init**

Run: `just vm-cloud`
Expected: VM boots, cloud-init runs during first boot. Wait for login prompt.

**Step 3: Verify from another terminal**

```bash
# Verify bloom user was created by cloud-init and SSH works
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 bloom@localhost whoami
# Expected: bloom

# Verify sshd is active
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 bloom@localhost systemctl is-active sshd
# Expected: active

# Verify cloud-init completed
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 bloom@localhost cloud-init status
# Expected: status: done

# Verify bloom-display is running
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 bloom@localhost systemctl is-active bloom-display
# Expected: active

# Verify NetBird is installed
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 bloom@localhost netbird version
# Expected: version string
```

**Step 4: Kill test VM**

Run: `just vm-kill`

---

## OVH Deployment Reference

Not a build task — reference for actual deployment.

### Option A: OVH Public Cloud (OpenStack)

```bash
# 1. Build and generate qcow2
just qcow2

# 2. Upload image via OpenStack CLI
openstack image create "bloom-os" \
  --disk-format qcow2 \
  --container-format bare \
  --file os/output/qcow2/disk.qcow2

# 3. Create instance (cloud-init injects your OVH SSH key automatically)
openstack server create --image bloom-os --flavor s1-2 --key-name my-key bloom

# 4. SSH in
ssh bloom@<instance-ip>
```

### Option B: OVH VPS (rescue mode)

```bash
# 1. Build and push to GHCR
just login
just push

# 2. Boot VPS into rescue mode (OVH control panel → Reboot → Rescue)
# 3. SSH into rescue shell with credentials OVH emails you

# 4. Install podman in rescue environment
apt-get update && apt-get install -y podman

# 5. Pull and install Bloom OS to disk
podman run --rm --privileged --pid=host \
  -v /dev:/dev \
  -v /var/lib/containers:/var/lib/containers \
  --security-opt label=disable \
  ghcr.io/pibloom/bloom-os:latest \
  bootc install to-disk /dev/sda

# 6. Seed cloud-init NoCloud data for first boot user provisioning
mount /dev/sda3 /mnt   # root partition — verify with: lsblk /dev/sda
mkdir -p /mnt/var/lib/cloud/seed/nocloud

cat > /mnt/var/lib/cloud/seed/nocloud/user-data << 'EOF'
#cloud-config
users:
  - default
ssh_authorized_keys:
  - ssh-ed25519 YOUR_PUBLIC_KEY_HERE
EOF

cat > /mnt/var/lib/cloud/seed/nocloud/meta-data << 'EOF'
instance-id: bloom-ovh
local-hostname: bloom
EOF

umount /mnt

# 7. Reboot from OVH control panel (exit rescue mode)
# 8. SSH in
ssh bloom@<vps-ip>
```

### OTA Updates

After initial deployment, the VPS receives updates via bootc:

```bash
# On the VPS — check and stage update
sudo bootc upgrade --check
sudo bootc upgrade

# Reboot to apply (bootc switches to new image atomically)
sudo systemctl reboot
```

For automatic OTA, the `bloom-update-check.timer` already polls for updates periodically.
