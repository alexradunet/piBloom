# Zellij as Default SSH Terminal Experience

**Date**: 2026-03-12
**Status**: Draft

## Problem

Bloom currently ships tmux as the terminal multiplexer for SSH sessions. While functional, tmux has a steep learning curve — its prefix-key model, arcane keybindings, and lack of built-in discoverability make it unfriendly for new users. Bloom needs a terminal experience that is persistent, discoverable, and provides a curated "workstation" feel on SSH.

## Solution

Replace tmux with Zellij as the sole terminal multiplexer. Auto-launch Zellij on interactive SSH sessions with a predefined tab-based layout. Provide an escape hatch for scripting and non-interactive use.

## Design

### Package Changes

- **Remove**: `tmux` from `os/packages/packages-install.txt`
- **Add**: `zellij` (available in Fedora 42 repos, no custom repo needed)

### Shell Profile Integration

Zellij launches from `.bash_profile` using a guard-based approach. The modified file:

```bash
# Source .bashrc for env vars (BLOOM_DIR, PATH, etc.)
[ -f ~/.bashrc ] && . ~/.bashrc

# Auto-launch Zellij on interactive login (skip if escape hatch or already inside Zellij)
if [ -t 0 ] && [ -z "$ZELLIJ" ] && [ -z "$BLOOM_NO_ZELLIJ" ]; then
  exec zellij --layout bloom
fi

# Start Pi on interactive login (only one instance — atomic mkdir lock)
# The pi-daemon runs independently via systemd — no stop/start needed.
if [ -t 0 ] && [ -z "$PI_SESSION" ] && mkdir /tmp/.bloom-pi-session 2>/dev/null; then
  trap 'rmdir /tmp/.bloom-pi-session 2>/dev/null' EXIT
  export PI_SESSION=1
  /usr/local/bin/bloom-greeting.sh
  exec pi
fi
```

**Flow**:
1. Source env vars from `.bashrc`
2. If interactive + not inside Zellij + no escape hatch → `exec zellij --layout bloom`
3. Zellij spawns Tab 1 with `bash -l` → `.bash_profile` re-runs → `$ZELLIJ` is set, step 2 skipped
4. Falls through to Pi launch block (only one instance via atomic mkdir lock)

**Escape hatches**:
- `BLOOM_NO_ZELLIJ=1 ssh pi@host` — skips Zellij, drops to plain bash
- `ssh pi@host -- bash` — non-login shell, `.bash_profile` not sourced
- `ssh pi@host -- <command>` — runs command directly, no Zellij

### Zellij Layout

A KDL layout file shipped at `etc/skel/.config/zellij/layouts/bloom.kdl`:

```kdl
layout {
    tab name="Pi" focus=true {
        pane command="bash" {
            args "-l"
        }
    }
    tab name="Shell" {
        pane
    }
    tab name="Logs" {
        pane command="journalctl" {
            args "--user" "-f"
        }
    }
}
```

- **Tab 1 "Pi"** (focused): Login bash triggering greeting → `exec pi`
- **Tab 2 "Shell"**: Plain shell for ad-hoc commands
- **Tab 3 "Logs"**: Follows user-scoped systemd journal (Pi daemon, services)

### Reconnect Behavior

Zellij's built-in session management handles reconnection:
- **First connect**: Creates a new session automatically
- **Reconnect (existing session found)**: Zellij shows its built-in session picker — user chooses to attach or create new
- **Reconnect (no existing session)**: Creates new session automatically

No custom scripting needed. The `--layout bloom` flag only applies on new session creation; attaching to an existing session restores its prior state.

### Zellij Configuration

No custom Zellij configuration beyond the layout file. Stock Zellij defaults provide:
- Built-in status bar with keybinding hints
- Discoverable mode-based UI
- Session persistence across disconnects
- Sensible default keybindings

## Files Changed

| File | Action |
|------|--------|
| `os/packages/packages-install.txt` | Replace `tmux` with `zellij` |
| `os/system_files/etc/skel/.bash_profile` | Add Zellij auto-launch guard |
| `os/system_files/etc/skel/.config/zellij/layouts/bloom.kdl` | New — tab layout |

## Not In Scope

- Custom Zellij themes or branding
- Zellij plugins
- Multiple layout options
- tmux compatibility layer or fallback
