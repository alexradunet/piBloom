#!/usr/bin/env bash
set -euo pipefail

nixos_rebuild_bin="$(command -v nixos-rebuild || true)"
if [[ -z "$nixos_rebuild_bin" && -x /nix/var/nix/profiles/system/sw/bin/nixos-rebuild ]]; then
	nixos_rebuild_bin=/nix/var/nix/profiles/system/sw/bin/nixos-rebuild
fi

if [[ -z "$nixos_rebuild_bin" ]]; then
	echo "nixos-rebuild is not available in PATH or /nix/var/nix/profiles/system/sw/bin." >&2
	exit 1
fi

exec "$nixos_rebuild_bin" switch --flake /etc/nixos#nixos --impure "$@"
