# nixPI — build, test, and develop

system    := "x86_64-linux"
flake     := "."
host      := "desktop"
installer_sim_host := "installer-sim-vm"
output    := "result"
installer_sim_output := "result-installer-sim"
ovmf      := "/usr/share/edk2/ovmf/OVMF_CODE.fd"
ovmf_vars := "/usr/share/edk2/ovmf/OVMF_VARS.fd"

# Build nixPI TypeScript app derivation only
build:
    nix build {{ flake }}#app

# Apply current flake config to the running system (local dev iteration)
switch:
    sudo nixos-rebuild switch --flake {{ flake }}#{{ host }}

# Apply config from the remote GitHub flake
update:
    sudo nixos-rebuild switch --flake github:alexradunet/nixPI#{{ host }}

# Roll back to the previous NixOS generation
rollback:
    sudo nixos-rebuild switch --rollback

# Build qcow2 VM image for testing (uses qemu module, not disk-image.nix)
qcow2:
    nix build {{ flake }}#nixosConfigurations.{{ host }}.config.system.build.vm

# Run VM (fresh build from current codebase)
vm: qcow2
    tools/run-qemu.sh --mode headless

# Run VM with GUI display
vm-gui: qcow2
    tools/run-qemu.sh --mode gui

# Run VM with existing qcow2 (no rebuild)
vm-run:
    tools/run-qemu.sh --mode headless --skip-setup

# Run VM in background daemon mode (detached, no terminal attached)
# Use this when you want to run the VM and still use your shell
# Then connect with: just vm-ssh
vm-daemon: qcow2
    tools/run-qemu.sh --mode daemon

# SSH into the running VM
vm-ssh:
    #!/usr/bin/env bash
    if ! pgrep -f "[q]emu-system-x86_64.*nixpi-vm-disk" > /dev/null; then
        echo "No VM running. Start with: just vm-daemon"
        exit 1
    fi
    echo "Connecting to VM..."
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 pi@localhost

# Build a plain NixOS VM to simulate installing nixPI onto an existing machine.
installer-sim-qcow2:
    nix build {{ flake }}#nixosConfigurations.{{ installer_sim_host }}.config.system.build.vm -o {{ installer_sim_output }}

# Run the installer simulation VM (fresh build from current codebase)
vm-sim-install: installer-sim-qcow2
    NIXPI_VM_OUTPUT={{ installer_sim_output }} NIXPI_VM_DISK_PATH=/tmp/nixpi-installer-sim-vm-disk.qcow2 NIXPI_VM_LOG_PATH=/tmp/nixpi-installer-sim-vm.log tools/run-qemu.sh --mode headless

# Run the installer simulation VM with GUI display
vm-sim-install-gui: installer-sim-qcow2
    NIXPI_VM_OUTPUT={{ installer_sim_output }} NIXPI_VM_DISK_PATH=/tmp/nixpi-installer-sim-vm-disk.qcow2 NIXPI_VM_LOG_PATH=/tmp/nixpi-installer-sim-vm.log tools/run-qemu.sh --mode gui

# Run the installer simulation VM in background daemon mode
vm-sim-install-daemon: installer-sim-qcow2
    NIXPI_VM_OUTPUT={{ installer_sim_output }} NIXPI_VM_DISK_PATH=/tmp/nixpi-installer-sim-vm-disk.qcow2 NIXPI_VM_LOG_PATH=/tmp/nixpi-installer-sim-vm.log tools/run-qemu.sh --mode daemon

# SSH into the installer simulation VM
vm-sim-install-ssh:
    #!/usr/bin/env bash
    if ! pgrep -f "[q]emu-system-x86_64.*nixpi-installer-sim-vm-disk" > /dev/null; then
        echo "No installer simulation VM running. Start with: just vm-sim-install-daemon"
        exit 1
    fi
    echo "Connecting to installer simulation VM..."
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 alex@localhost

# Show installer VM log
vm-sim-install-logs:
    tail -f /tmp/nixpi-installer-sim-vm.log

# Stop the installer simulation VM
vm-sim-install-stop:
    #!/usr/bin/env bash
    pid=$(pgrep -f "[q]emu-system-x86_64.*nixpi-installer-sim-vm-disk" || true)
    if [ -z "$pid" ]; then
        echo "No installer simulation VM running"
        exit 0
    fi
    echo "Stopping installer simulation VM (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
        echo "Force killing installer simulation VM..."
        kill -9 "$pid" 2>/dev/null || true
    fi
    echo "Installer simulation VM stopped"

# One-shot live installer test with a real NetBird setup key supplied at runtime.
live-install-e2e:
    tools/run-install-vm-e2e.sh

# Show VM log (for vm-daemon)
vm-logs:
    tail -f /tmp/nixpi-vm.log

# Stop the running VM (graceful if possible, otherwise kill)
vm-stop:
    #!/usr/bin/env bash
    pid=$(pgrep -f "[q]emu-system-x86_64.*nixpi-vm-disk" || true)
    if [ -z "$pid" ]; then
        echo "No VM running"
        exit 0
    fi
    echo "Stopping VM (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
        echo "Force killing VM..."
        kill -9 "$pid" 2>/dev/null || true
    fi
    echo "VM stopped"

# Kill the running QEMU VM (legacy alias)
vm-kill: vm-stop

# Remove build results and VM disk
clean:
    rm -f result result-*
    rm -f /tmp/nixpi-vm-disk.qcow2 /tmp/nixpi-ovmf-vars.fd

# Install host dependencies (Fedora build host; NixOS devs use nix develop)
deps:
    sudo dnf install -y just qemu-system-x86 edk2-ovmf

# Fast config check: build the NixOS closure locally.
# Catches locale errors, bad module references, and evaluation failures
check-config:
    nix build {{ flake }}#checks.{{ system }}.config --no-link

# Full VM boot test: boots the installed system in a NixOS test VM.
# Slower than check-config but verifies runtime behaviour (services, users).
# Requires KVM. Takes 20-40 min on first run.
check-boot:
    nix build {{ flake }}#checks.{{ system }}.boot --no-link

# PR-oriented NixOS VM smoke lane.
check-nixos-smoke:
    nix build {{ flake }}#checks.{{ system }}.nixos-smoke --no-link -L

# Comprehensive NixOS VM lane.
check-nixos-full:
    nix build {{ flake }}#checks.{{ system }}.nixos-full --no-link -L

# Long-running install/lockdown/broker lane.
check-nixos-destructive:
    nix build {{ flake }}#checks.{{ system }}.nixos-destructive --no-link -L

# Lint Nix files
lint:
    nix flake check
    statix check .

# Format Nix files
# Note: ** glob requires globstar in bash (shopt -s globstar). nixfmt receives
# the expanded paths from the shell; if your shell doesn't expand **, list paths
# explicitly or use: find core/os -name '*.nix' | xargs nixfmt; nixfmt flake.nix
fmt:
    nixfmt core/os/**/*.nix flake.nix
