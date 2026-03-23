#!/usr/bin/env bash
set -euo pipefail

disk="${NIXPI_INSTALL_VM_DISK_PATH:-$HOME/nixpi-install-vm.qcow2}"
disk_size="${NIXPI_INSTALL_VM_DISK_SIZE:-32G}"
memory_mb="${NIXPI_INSTALL_VM_MEMORY_MB:-8192}"
vm_cpus="${NIXPI_INSTALL_VM_CPUS:-4}"
bridge_name="${NIXPI_INSTALL_VM_BRIDGE:-br0}"
ovmf_code="${NIXPI_INSTALL_VM_OVMF_CODE:-/usr/share/edk2/ovmf/OVMF_CODE.fd}"
ovmf_vars_template="${NIXPI_INSTALL_VM_OVMF_VARS_TEMPLATE:-/usr/share/edk2/ovmf/OVMF_VARS.fd}"
ovmf_vars="${NIXPI_INSTALL_VM_OVMF_VARS_PATH:-$HOME/.cache/nixpi-install-ovmf-vars.fd}"
iso_path=""

if ! ip link show "$bridge_name" >/dev/null 2>&1; then
    echo "Host bridge '$bridge_name' was not found."
    echo "The canonical VM path expects a real bridge so the guest behaves like a mini-PC on your network."
    echo "If your host uses a different bridge, override it:"
    echo "  NIXPI_INSTALL_VM_BRIDGE=<bridge-name> just vm-install-iso"
    exit 1
fi

if [ -f result ] && [[ "$(readlink -f result)" = *.iso ]]; then
    iso_path="$(readlink -f result)"
elif [ -d result/iso ]; then
    iso_path="$(find result/iso -maxdepth 1 -name '*.iso' | head -n1)"
fi

if [ -z "$iso_path" ]; then
    echo "Installer ISO not found under result/iso"
    exit 1
fi

echo "Resetting installer VM state..."
rm -f "$disk"
rm -f "$ovmf_vars"
rm -rf "$HOME/.nixpi"

echo "Creating installer VM disk at $disk ($disk_size)..."
qemu-img create -f qcow2 "$disk" "$disk_size" >/dev/null

mkdir -p "$(dirname "$ovmf_vars")"
cp "$ovmf_vars_template" "$ovmf_vars"

echo "Booting installer ISO: $iso_path"
echo "ISO timestamp: $(stat -c '%y' "$iso_path")"
echo "Disk: $disk"
echo "Console: graphical"
echo "Network mode: bridge ($bridge_name)"
echo "Expectation: the VM behaves like a real LAN peer, so NetBird service URLs must be reachable from other mesh devices."

exec qemu-system-x86_64 \
    -enable-kvm \
    -m "$memory_mb" \
    -smp "$vm_cpus" \
    -drive "if=pflash,format=raw,readonly=on,file=$ovmf_code" \
    -drive "if=pflash,format=raw,file=$ovmf_vars" \
    -drive "file=$disk,format=qcow2,if=virtio" \
    -cdrom "$iso_path" \
    -boot "order=dc,once=d" \
    -netdev "bridge,id=nixpi0,br=$bridge_name" \
    -device "virtio-net-pci,netdev=nixpi0"
