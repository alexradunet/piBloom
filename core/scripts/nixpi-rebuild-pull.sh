#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/srv/nixpi"
TARGET_REF="${1:-main}"

git config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true
git -C "$REPO_DIR" fetch origin
git -C "$REPO_DIR" reset --hard "origin/$TARGET_REF"

exec nixos-rebuild switch --flake /etc/nixos#nixos --impure
