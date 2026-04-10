#!/usr/bin/env bash
# bootstrap-utils.sh — shared logging and string utilities
set -euo pipefail

log() {
	printf '%s\n' "$*" >&2
}

openssl_bin() {
	printf '%s' "${NIXPI_OPENSSL_BIN:-openssl}"
}

generate_recovery_password() {
	"$(openssl_bin)" rand -hex 16
}

hash_recovery_password() {
	local password="$1"
	local salt=""
	salt="$("$(openssl_bin)" rand -hex 8)"
	"$(openssl_bin)" passwd -6 -salt "$salt" "$password"
}

write_recovery_credentials_file() {
	local output_path="$1"
	local primary_user="$2"
	local primary_user_password="$3"
	local root_password="$4"

	install -d -m 0700 "$(dirname "$output_path")"
	umask 077
	cat >"$output_path" <<EOF_CREDENTIALS
NixPI bootstrap recovery credentials
===================================
primary_user=${primary_user}
primary_user_password=${primary_user_password}
root_password=${root_password}
EOF_CREDENTIALS
}

print_recovery_credentials() {
	local primary_user="$1"
	local primary_user_password="$2"
	local root_password="$3"
	local output_path="$4"

	log ""
	log "Bootstrap recovery credentials for OVH KVM/rescue access:"
	log "  ${primary_user}: ${primary_user_password}"
	log "  root: ${root_password}"
	log "Save these now. SSH stays key-only; these passwords are your console fallback."
	if [[ -n "$output_path" ]]; then
		log "Saved to ${output_path} (root-readable only)."
	fi
	log ""
}

print_post_bootstrap_verification_summary() {
	local primary_user="$1"
	shift
	local ssh_allowed_cidrs=("$@")

	log "Bootstrap applied. Verify before logging out:"
	log "  1. Open a second terminal and test SSH as ${primary_user} with the intended key."
	log "  2. Check SSH policy: sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowtcpforwarding|allowagentforwarding'"
	log "  3. Check the SSH firewall rule: sudo nft list ruleset | grep 'dport 22'"
	if [[ "${#ssh_allowed_cidrs[@]}" -gt 0 ]]; then
		log "  4. Confirm the allowed admin CIDRs still match your current public IP:"
		for cidr in "${ssh_allowed_cidrs[@]}"; do
			log "     ${cidr}"
		done
	fi
	log "  5. Keep the saved recovery passwords for OVH KVM/rescue fallback."
	log ""
}

run_rebuild() {
	local nixos_rebuild_bin="$1"
	shift

	local output=""
	if output="$("$nixos_rebuild_bin" "$@" 2>&1)"; then
		printf '%s' "$output"
		return 0
	fi

	printf '%s' "$output"
	return 1
}

handle_rebuild_failure() {
	local rebuild_output="$1"
	local etc_nixos_dir="$2"

	if [[ "$rebuild_output" == *"boot.loader.grub.devices"* ]]; then
		log ""
		log "Bootstrap detected a non-bootable existing ${etc_nixos_dir}/configuration.nix."
		log "This usually happens after running nixos-generate-config on a fresh OVH base host:"
		log "it writes a generic configuration.nix, but NixPI only needs hardware-configuration.nix and can generate the base OVH bootloader config itself."
		log "Keep ${etc_nixos_dir}/hardware-configuration.nix."
		log "Move or remove ${etc_nixos_dir}/configuration.nix, for example:"
		log "  mv ${etc_nixos_dir}/configuration.nix ${etc_nixos_dir}/configuration.nix.before-nixpi"
		log "Then rerun nixpi-bootstrap-host with --force so it can rewrite the generated helper files."
		log "After the retry succeeds, test a second SSH session before logging out."
	fi
}

escape_nix_string() {
	local value="${1-}"

	value="${value//\\/\\\\}"
	value="${value//\"/\\\"}"
	value="${value//$'\n'/\\n}"
	value="${value//$'\r'/\\r}"
	value="${value//\$\{/\\\$\{}"

	printf '%s' "$value"
}

usage() {
	cat <<'EOF_USAGE'
Usage: nixpi-bootstrap-host --primary-user USER --ssh-allowed-cidr CIDR [--ssh-allowed-cidr CIDR ...]
  [--hostname HOSTNAME] [--timezone TZ] [--keyboard LAYOUT] [--nixpi-input FLAKE_REF]
  [--authorized-key KEY | --authorized-key-file PATH]
  [--primary-user-password PASSWORD] [--root-password PASSWORD] [--force]

Bootstrap NixPI onto an already-installed NixOS host by writing narrow /etc/nixos helper files.
If /etc/nixos/flake.nix does not exist, a minimal host flake is generated automatically.
If /etc/nixos/flake.nix already exists, helper files are written and exact manual integration instructions are printed.
Recovery passwords for the primary user and root are generated automatically unless you pass them explicitly.
They are intended for OVH KVM/rescue fallback access while SSH remains key-only.
EOF_USAGE
}
