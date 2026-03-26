#!/usr/bin/env bash
# setup-lib.sh — Shared function library for setup-wizard.sh.
# Source this file; do not execute directly.
#
# Provides: checkpoint management, NetBird utilities.
#
# Required env vars (callers must set before sourcing):
#   WIZARD_STATE        — path to checkpoint directory (e.g. ~/.nixpi/wizard-state)
#   PI_DIR              — path to Pi config dir (typically ~/.pi)
#   NIXPI_CONFIG        — path to NixPI service config dir
#   NIXPI_DIR           — path to the user-editable NixPI workspace (typically ~/nixpi)

# --- Checkpoint helpers ---

mark_done() {
	mkdir -p "$WIZARD_STATE"
	echo "$(date -Iseconds)" > "$WIZARD_STATE/$1"
}

# Store data alongside a checkpoint (e.g., mesh IP)
mark_done_with() {
	mkdir -p "$WIZARD_STATE"
	printf '%s\n%s\n' "$(date -Iseconds)" "$2" > "$WIZARD_STATE/$1"
}

# Read stored data from a checkpoint (line 2+)
read_checkpoint_data() {
	[[ -f "$WIZARD_STATE/$1" ]] && sed -n '2p' "$WIZARD_STATE/$1" || echo ""
}

netbird_status_json() {
	netbird status --json 2>/dev/null || true
}

netbird_fqdn() {
	local status
	status=$(netbird_status_json)
	[[ -n "$status" ]] || return 0
	jq -r '.fqdn // empty' <<< "$status"
}

netbird_ip() {
	local status
	status=$(netbird_status_json)
	[[ -n "$status" ]] || return 0
	jq -r '.netbirdIp // empty | split("/")[0]' <<< "$status"
}

canonical_state_dir() {
	printf '%s/access-state' "$NIXPI_CONFIG"
}

stored_canonical_host() {
	local path
	path="$(canonical_state_dir)/canonical-host"
	[[ -f "$path" ]] && cat "$path" || true
}

current_canonical_host() {
	netbird_fqdn
}

record_canonical_host() {
	local host="$1"
	[[ -n "$host" ]] || return 0
	mkdir -p "$(canonical_state_dir)"
	printf '%s' "$host" > "$(canonical_state_dir)/canonical-host"
}

canonical_access_mode() {
	local current stored
	current=$(current_canonical_host)
	stored=$(stored_canonical_host)
	if [[ -n "$current" ]]; then
		echo "healthy"
	elif [[ -n "$stored" ]]; then
		echo "degraded"
	else
		echo "not-ready"
	fi
}

canonical_service_host() {
	local current stored
	current=$(current_canonical_host)
	if [[ -n "$current" ]]; then
		record_canonical_host "$current"
		printf '%s' "$current"
		return 0
	fi
	stored=$(stored_canonical_host)
	if [[ -n "$stored" ]]; then
		printf '%s' "$stored"
	fi
	return 0
}

root_command() {
	if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
		"$@"
		return
	fi

	local sudo_bin=""
	if command -v sudo >/dev/null 2>&1; then
		sudo_bin="$(command -v sudo)"
	elif [[ -x /run/wrappers/bin/sudo ]]; then
		sudo_bin="/run/wrappers/bin/sudo"
	fi

	if [[ -n "$sudo_bin" ]]; then
		"$sudo_bin" "$@"
	else
		"$@"
	fi
}

read_bootstrap_primary_password() {
	if command -v nixpi-bootstrap-read-primary-password >/dev/null 2>&1; then
		root_command nixpi-bootstrap-read-primary-password 2>/dev/null || true
	fi
}









