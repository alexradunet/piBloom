#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PRIMARY_USER="${NIXPI_TEST_PRIMARY_USER:-alex}"
PRIMARY_PASSWORD="${NIXPI_TEST_PRIMARY_PASSWORD:-cico}"
MATRIX_PASSWORD="${NIXPI_TEST_MATRIX_PASSWORD:-testpassword123}"
PI_USERNAME="${NIXPI_TEST_USERNAME:-e2etest}"
NETBIRD_SETUP_KEY="${NIXPI_TEST_NETBIRD_SETUP_KEY:-}"
OUTPUT_PATH="${NIXPI_TEST_VM_OUTPUT:-result-installer}"
HOST_STATE_PATH="${NIXPI_TEST_VM_STATE_PATH:-/tmp/nixpi-live-e2e-state}"
DISK_PATH="${NIXPI_TEST_VM_DISK_PATH:-/tmp/nixpi-installer-vm-disk.qcow2}"
LOG_PATH="${NIXPI_TEST_VM_LOG_PATH:-/tmp/nixpi-installer-vm.log}"
PREFILL_PATH="${NIXPI_TEST_PREFILL_PATH:-/tmp/nixpi-live-e2e-prefill.env}"
SSH_OPTS=(-o ConnectTimeout=5 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222)

if [[ -z "$NETBIRD_SETUP_KEY" ]]; then
    echo "Set NIXPI_TEST_NETBIRD_SETUP_KEY before running this live E2E flow." >&2
    exit 1
fi

mkdir -p "$HOST_STATE_PATH"
cat > "$PREFILL_PATH" <<EOF
PREFILL_NETBIRD_KEY=${NETBIRD_SETUP_KEY}
PREFILL_USERNAME=${PI_USERNAME}
PREFILL_MATRIX_PASSWORD=${MATRIX_PASSWORD}
PREFILL_PRIMARY_PASSWORD=${PRIMARY_PASSWORD}
EOF
chmod 600 "$PREFILL_PATH"

cleanup() {
    rm -f "$PREFILL_PATH"
}
trap cleanup EXIT

cd "$ROOT_DIR"
nix build .#nixosConfigurations.installer-vm.config.system.build.vm -o "$OUTPUT_PATH"

NIXPI_VM_OUTPUT="$OUTPUT_PATH" \
NIXPI_VM_DISK_PATH="$DISK_PATH" \
NIXPI_VM_LOG_PATH="$LOG_PATH" \
NIXPI_VM_HOST_STATE_PATH="$HOST_STATE_PATH" \
NIXPI_VM_PREFILL_SOURCE="$PREFILL_PATH" \
core/scripts/run-qemu.sh --mode daemon

wait_for_ssh() {
    local attempts=0
    until sshpass -p "$PRIMARY_PASSWORD" ssh "${SSH_OPTS[@]}" "${PRIMARY_USER}@localhost" "echo up" >/dev/null 2>&1; do
        attempts=$((attempts + 1))
        if [[ "$attempts" -ge 60 ]]; then
            echo "Installer VM never became reachable over SSH." >&2
            exit 1
        fi
        sleep 2
    done
}

wait_for_ssh

sshpass -p "$PRIMARY_PASSWORD" ssh "${SSH_OPTS[@]}" "${PRIMARY_USER}@localhost" \
    "sudo NIXPI_PRIMARY_USER=${PRIMARY_USER} nixos-rebuild switch --impure --flake /mnt/host-repo#desktop"

wait_for_ssh

sshpass -p "$PRIMARY_PASSWORD" ssh "${SSH_OPTS[@]}" "${PRIMARY_USER}@localhost" <<'EOF'
set -euo pipefail

for unit in nixpi-broker.service pi-daemon.service matrix-synapse.service netbird.service nixpi-firstboot.service; do
    timeout 180 bash -lc "until systemctl is-active --quiet ${unit}; do sleep 2; done"
done

timeout 180 bash -lc 'until test -f "$HOME/.nixpi/.setup-complete"; do sleep 2; done'
timeout 180 bash -lc 'until ip link show wt0 >/dev/null 2>&1; do sleep 2; done'

echo "== Users =="
id
id agent

echo "== Service State =="
systemctl is-active nixpi-broker.service
systemctl is-active pi-daemon.service
systemctl is-active matrix-synapse.service
systemctl is-active netbird.service

echo "== NetBird =="
netbird status

echo "== Setup Marker =="
test -f "$HOME/.nixpi/.setup-complete"
echo "setup-complete present"
EOF

echo "Live installer VM E2E completed successfully."
