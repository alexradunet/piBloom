#!/usr/bin/env bash
# start-sway.sh — Detect display mode, then launch Sway.
# Wrapper needed because systemd reads EnvironmentFile before ExecStartPre runs.

set -euo pipefail

# Run detection (writes /run/bloom/display-env)
/usr/local/share/bloom/os/scripts/detect-display.sh

# Source the detected environment
# shellcheck source=/dev/null
source /run/bloom/display-env

exec /usr/bin/sway --config /etc/bloom/sway-config
