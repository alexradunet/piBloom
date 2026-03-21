#!/usr/bin/env bash
set -euo pipefail

WHIPTAIL_BIN="@whiptailBin@"
HELPER_BIN="@helperBin@"

ROOT_MOUNT="/mnt"
HOSTNAME_VALUE=""
PRIMARY_USER_VALUE=""
TARGET_DISK=""
FORCE_YES=0
SYSTEM_CLOSURE=""

usage() {
  cat <<'EOF'
Usage: nixpi-installer [--disk /dev/sdX] [--hostname NAME] [--primary-user USER] [--yes] [--system PATH]

Performs a destructive UEFI install with:
- EFI system partition: 1 MiB - 512 MiB
- ext4 root partition: 512 MiB - end of disk
EOF
}

ensure_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run nixpi-installer as root." >&2
    exit 1
  fi
}

choose_disk() {
  if [[ -n "$TARGET_DISK" ]]; then
    return
  fi

  mapfile -t disks < <(lsblk -dnpo NAME,SIZE,MODEL,TYPE,RO | awk '$4 == "disk" && $5 == 0 { printf "%s|%s|%s\n", $1, $2, ($3 == "" ? "disk" : $3) }')
  if [[ ${#disks[@]} -eq 0 ]]; then
    echo "No writable disks found." >&2
    exit 1
  fi

  if [[ ! -t 0 || ! -t 1 ]]; then
    echo "Non-interactive mode requires --disk." >&2
    exit 1
  fi

  local options=()
  local entry name size model
  for entry in "${disks[@]}"; do
    IFS="|" read -r name size model <<<"$entry"
    options+=("$name" "$size $model")
  done

  TARGET_DISK="$("$WHIPTAIL_BIN" --title "NixPI Installer" --menu "Choose the target disk" 20 78 10 "${options[@]}" 3>&1 1>&2 2>&3)"
}

prompt_value() {
  local title="$1"
  local prompt="$2"
  local default_value="$3"
  "$WHIPTAIL_BIN" --title "$title" --inputbox "$prompt" 10 78 "$default_value" 3>&1 1>&2 2>&3
}

prompt_inputs() {
  if [[ -z "$HOSTNAME_VALUE" ]]; then
    if [[ ! -t 0 || ! -t 1 ]]; then
      echo "Non-interactive mode requires --hostname." >&2
      exit 1
    fi
    HOSTNAME_VALUE="$(prompt_value "Hostname" "Enter the machine hostname" "nixpi")"
  fi

  if [[ -z "$PRIMARY_USER_VALUE" ]]; then
    if [[ ! -t 0 || ! -t 1 ]]; then
      echo "Non-interactive mode requires --primary-user." >&2
      exit 1
    fi
    PRIMARY_USER_VALUE="$(prompt_value "Primary User" "Enter the primary operator username" "nixpi")"
  fi
}

confirm_install() {
  if [[ "$FORCE_YES" -eq 1 ]]; then
    return
  fi

  local message="This will erase ${TARGET_DISK}.\n\nLayout:\n- EFI partition: 1 MiB - 512 MiB\n- ext4 root: 512 MiB - end of disk\n\nHostname: ${HOSTNAME_VALUE}\nPrimary user: ${PRIMARY_USER_VALUE}"
  "$WHIPTAIL_BIN" --title "Confirm Install" --yesno "$message" 16 78
}

partition_prefix() {
  if [[ "$TARGET_DISK" =~ [0-9]$ ]]; then
    printf "%sp" "$TARGET_DISK"
  else
    printf "%s" "$TARGET_DISK"
  fi
}

run_install() {
  local prefix boot_part root_part
  prefix="$(partition_prefix)"
  boot_part="${prefix}1"
  root_part="${prefix}2"

  mkdir -p "$ROOT_MOUNT"
  umount "$ROOT_MOUNT/boot" 2>/dev/null || true
  umount "$ROOT_MOUNT" 2>/dev/null || true

  parted -s "$TARGET_DISK" mklabel gpt
  parted -s "$TARGET_DISK" mkpart ESP fat32 1MiB 512MiB
  parted -s "$TARGET_DISK" set 1 esp on
  parted -s "$TARGET_DISK" mkpart root ext4 512MiB 100%
  udevadm settle

  mkfs.fat -F 32 -n boot "$boot_part"
  mkfs.ext4 -F -L nixos "$root_part"

  mount "$root_part" "$ROOT_MOUNT"
  mkdir -p "$ROOT_MOUNT/boot"
  mount -o umask=077 "$boot_part" "$ROOT_MOUNT/boot"

  nixos-generate-config --root "$ROOT_MOUNT"
  "$HELPER_BIN" --root "$ROOT_MOUNT" --hostname "$HOSTNAME_VALUE" --primary-user "$PRIMARY_USER_VALUE" | tee /tmp/nixpi-installer-artifacts.json

  if [[ -n "$SYSTEM_CLOSURE" ]]; then
    nixos-install --no-root-passwd --system "$SYSTEM_CLOSURE" --root "$ROOT_MOUNT"
  else
    nixos-install --no-root-passwd --flake "$ROOT_MOUNT/etc/nixos#${HOSTNAME_VALUE}"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --disk)
      TARGET_DISK="$2"
      shift 2
      ;;
    --hostname)
      HOSTNAME_VALUE="$2"
      shift 2
      ;;
    --primary-user)
      PRIMARY_USER_VALUE="$2"
      shift 2
      ;;
    --yes)
      FORCE_YES=1
      shift
      ;;
    --system)
      SYSTEM_CLOSURE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

ensure_root
choose_disk
prompt_inputs
confirm_install
run_install

echo "NixPI install completed. Reboot when ready."
