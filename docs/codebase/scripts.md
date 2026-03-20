# Scripts & Tools

> Setup orchestration and VM/testing helpers

## 🌱 Why Scripts & Tools Exist

Scripts and tools bridge the gap between the repository and runtime operations:

- **Setup scripts**: First-boot wizard and configuration
- **VM tools**: Development and testing in virtual machines
- **Test helpers**: E2E and integration test support

## 🚀 What They Own

| Component | Purpose | Location |
|-----------|---------|----------|
| Setup scripts | First-boot wizard | `core/scripts/` |
| VM runner | QEMU VM execution | `tools/run-qemu.sh` |

## 📋 Script Inventory

### Setup Scripts (`core/scripts/`)

> Setup is owned by `setup-wizard.sh`; there is no separate first-boot service path.

Setup orchestration is primarily handled by:
- `setup-wizard.sh` (installed as a system command)

### VM Tools (`tools/`)

| File | Why | What | How / Notes |
|------|-----|------|-------------|
| `run-qemu.sh` | VM execution | Run QEMU VMs for testing | Used by `just vm*` commands |

---

## 🔍 Important File Details

### `tools/run-qemu.sh`

**Responsibility**: Execute QEMU VMs for development and testing.

**Modes**:
| Mode | Purpose |
|------|---------|
| `headless` | Serial console only |
| `gui` | Full graphical display |
| `daemon` | Background, detached |

**Environment Variables**:
| Variable | Purpose | Default |
|----------|---------|---------|
| `NIXPI_VM_OUTPUT` | Nix build output path | `result` |
| `NIXPI_VM_DISK_PATH` | VM disk location | `/tmp/nixpi-vm-disk.qcow2` |
| `NIXPI_VM_LOG_PATH` | Log file | `/tmp/nixpi-vm.log` |
| `NIXPI_VM_MEMORY_MB` | RAM in MB | `16384` |
| `NIXPI_VM_CPUS` | CPU count | `4` |

**Forwarded Ports**:
- `2222` → Guest SSH (port 22)

**Usage**:
```bash
# Run VM (called by justfile)
./tools/run-qemu.sh --mode headless

# Skip rebuild, use existing qcow2
./tools/run-qemu.sh --mode headless --skip-setup
```

**Inbound Dependencies**:
- `just vm`, `just vm-gui`, `just vm-daemon`

**Outbound Dependencies**:
- QEMU system
- `ovmf` (UEFI firmware)

---

## 🔄 First-Boot Flow

First boot is now a single flow:

1. Login shell launches `setup-wizard.sh` until `~/.nixpi/.setup-complete` exists
2. Wizard handles password, network, Matrix, AI setup, and service refresh
3. Persona completion is tracked only by `~/.nixpi/wizard-state/persona-done`

---

## 📋 When to Run Scripts

| Script | Safe to Run | When |
|--------|-------------|------|
| `setup-wizard.sh` | Production | First boot only |
| `run-qemu.sh` | Development | Anytime for testing |

---

## 🔗 Related

- [Operations: Quick Deploy](../operations/quick-deploy) - Deployment procedures
- [Operations: First Boot](../operations/first-boot-setup) - Setup procedures
- [Tests](./tests) - Testing documentation
