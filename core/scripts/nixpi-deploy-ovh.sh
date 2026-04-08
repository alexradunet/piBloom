#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF_USAGE'
Usage: nixpi-deploy-ovh --target-host root@IP --disk /dev/sdX [--flake .#ovh-vps] [--hostname HOSTNAME] [--bootstrap-user USER --bootstrap-password-hash HASH] [extra nixos-anywhere args...]

Destructive fresh install for an OVH VPS in rescue mode.

Examples:
  nix run .#nixpi-deploy-ovh -- --target-host root@198.51.100.10 --disk /dev/sda
  nix run .#nixpi-deploy-ovh -- --target-host root@198.51.100.10 --disk /dev/nvme0n1 --hostname bloom-eu-1
  nix run .#nixpi-deploy-ovh -- --target-host root@198.51.100.10 --disk /dev/sda --bootstrap-user human --bootstrap-password-hash '$6$...'
EOF_USAGE
}

log() {
  printf '[nixpi-deploy-ovh] %s\n' "$*" >&2
}

resolve_repo_url() {
  local ref="$1"
  if [[ "$ref" == path:* || "$ref" == github:* || "$ref" == git+* || "$ref" == https://* || "$ref" == ssh://* ]]; then
    printf '%s\n' "$ref"
    return 0
  fi

  if [[ "$ref" == . || "$ref" == /* ]]; then
    printf 'path:%s\n' "$(realpath "$ref")"
    return 0
  fi

  printf '%s\n' "$ref"
}

escape_nix_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\\$}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

build_bootstrap_module() {
  local bootstrap_user="$1"
  local bootstrap_password_hash="$2"
  local nix_bootstrap_user=""
  local nix_bootstrap_password_hash=""

  if [[ -z "$bootstrap_user" ]]; then
    return 0
  fi

  nix_bootstrap_user="$(escape_nix_string "$bootstrap_user")"
  nix_bootstrap_password_hash="$(escape_nix_string "$bootstrap_password_hash")"
  cat <<EOF_BOOTSTRAP
        ({ lib, ... }: {
          nixpi.primaryUser = lib.mkForce "${nix_bootstrap_user}";
          nixpi.security.ssh.passwordAuthentication = lib.mkForce true;
          nixpi.security.ssh.allowUsers = lib.mkForce [ "${nix_bootstrap_user}" ];
          users.users."${nix_bootstrap_user}".initialHashedPassword = lib.mkForce "${nix_bootstrap_password_hash}";
        })
EOF_BOOTSTRAP
}

build_deploy_flake() {
  local repo_url="$1"
  local base_attr="$2"
  local hostname="$3"
  local disk="$4"
  local bootstrap_user="${5:-}"
  local bootstrap_password_hash="${6:-}"
  local nix_hostname=""
  local nix_disk=""
  local bootstrap_module=""

  nix_hostname="$(escape_nix_string "$hostname")"
  nix_disk="$(escape_nix_string "$disk")"
  bootstrap_module="$(build_bootstrap_module "$bootstrap_user" "$bootstrap_password_hash")"

  cat <<EOF_FLAKE
{
  inputs.nixpi.url = "${repo_url}";

  outputs = { nixpi, ... }: {
    nixosConfigurations.deploy = nixpi.nixosConfigurations.${base_attr}.extendModules {
      modules = [
        ({ lib, ... }: {
          networking.hostName = lib.mkForce "${nix_hostname}";
          disko.devices.disk.main.device = lib.mkForce "${nix_disk}";
        })
${bootstrap_module}
      ];
    };
  };
}
EOF_FLAKE
}

main() {
  local target_host=""
  local disk=""
  local hostname="ovh-vps"
  local flake_ref="${NIXPI_REPO_ROOT:-.}#ovh-vps"
  local bootstrap_user=""
  local bootstrap_password_hash=""
  local extra_args=()
  local repo_ref=""
  local base_attr=""
  local repo_url=""
  local tmp_dir=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target-host)
        target_host="${2:?missing target host}"
        shift 2
        ;;
      --disk)
        disk="${2:?missing disk path}"
        shift 2
        ;;
      --flake)
        flake_ref="${2:?missing flake ref}"
        shift 2
        ;;
      --hostname)
        hostname="${2:?missing hostname}"
        shift 2
        ;;
      --bootstrap-user)
        bootstrap_user="${2:?missing bootstrap user}"
        shift 2
        ;;
      --bootstrap-password-hash)
        bootstrap_password_hash="${2:?missing bootstrap password hash}"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        extra_args+=("$1")
        shift
        ;;
    esac
  done

  if [[ -z "$target_host" || -z "$disk" ]]; then
    usage >&2
    exit 1
  fi

  if [[ "$flake_ref" != *#* ]]; then
    log "Flake ref must include a nixosConfigurations attribute, for example .#ovh-vps"
    exit 1
  fi

  if [[ -n "$bootstrap_user" && -z "$bootstrap_password_hash" ]]; then
    log "--bootstrap-user requires --bootstrap-password-hash"
    exit 1
  fi

  if [[ -z "$bootstrap_user" && -n "$bootstrap_password_hash" ]]; then
    log "--bootstrap-password-hash requires --bootstrap-user"
    exit 1
  fi

  repo_ref="${flake_ref%%#*}"
  base_attr="${flake_ref#*#}"
  repo_url="$(resolve_repo_url "$repo_ref")"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  build_deploy_flake "$repo_url" "$base_attr" "$hostname" "$disk" "$bootstrap_user" "$bootstrap_password_hash" > "$tmp_dir/flake.nix"

  log "WARNING: destructive install to ${target_host} using disk ${disk}"
  log "Using base configuration ${flake_ref} with target hostname ${hostname}"
  log "nixos-anywhere will install the final host configuration directly"
  log "Any /srv/nixpi checkout after install is optional operator convenience"
  if [[ -n "$bootstrap_user" ]]; then
    log "Bootstrap login will be ${bootstrap_user} using initialHashedPassword"
  fi
  exec "${NIXPI_NIXOS_ANYWHERE:-nixos-anywhere}" \
    --flake "$tmp_dir#deploy" \
    --target-host "$target_host" \
    "${extra_args[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
