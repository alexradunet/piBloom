# Zellij Default SSH Terminal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tmux with Zellij as the default terminal multiplexer, auto-launching on SSH with a tab-based layout (Pi, Shell, Logs).

**Architecture:** Shell profile guard in `.bash_profile` detects SSH sessions and `exec`s into Zellij with a named session. A KDL layout file defines the three-tab workstation. No custom Zellij config beyond the layout.

**Tech Stack:** Zellij (Fedora 42 repo), bash, KDL layout format

**Spec:** `docs/superpowers/specs/2026-03-12-zellij-default-ssh-terminal.md`

---

## Chunk 1: Core Implementation

### Task 1: Replace tmux with zellij in package list

**Files:**
- Modify: `os/packages/packages-install.txt:18`

- [ ] **Step 1: Replace tmux with zellij**

In `os/packages/packages-install.txt`, replace line 18:

```diff
-tmux
+zellij
```

- [ ] **Step 2: Commit**

```bash
git add os/packages/packages-install.txt
git commit -m "feat(os): replace tmux with zellij in package list"
```

---

### Task 2: Create Zellij bloom layout

**Files:**
- Create: `os/system_files/etc/skel/.config/zellij/layouts/bloom.kdl`

- [ ] **Step 1: Create the layout file**

Create `os/system_files/etc/skel/.config/zellij/layouts/bloom.kdl`:

```kdl
layout {
    tab name="Pi" focus=true {
        pane command="bash" {
            args "-l"
        }
    }
    tab name="Shell" {
        pane command="bash"
    }
    tab name="Logs" {
        pane command="journalctl" {
            args "--user" "-f"
        }
    }
}
```

Tab 1 runs a login shell (`bash -l`) which triggers `.bash_profile` → Pi auto-launch. Tab 2 runs bash as non-login shell (no `-l`), so `.bash_profile` is NOT sourced — plain shell. Tab 3 follows user-scoped systemd journal.

- [ ] **Step 2: Commit**

```bash
git add os/system_files/etc/skel/.config/zellij/layouts/bloom.kdl
git commit -m "feat(os): add Zellij bloom layout with Pi, Shell, Logs tabs"
```

---

### Task 3: Add Zellij auto-launch guard to .bash_profile

**Files:**
- Modify: `os/system_files/etc/skel/.bash_profile`

- [ ] **Step 1: Add the Zellij guard block**

Replace the full contents of `os/system_files/etc/skel/.bash_profile` with:

```bash
# Source .bashrc for env vars (BLOOM_DIR, PATH, etc.)
[ -f ~/.bashrc ] && . ~/.bashrc

# Auto-launch Zellij on interactive SSH login (skip if escape hatch or already inside Zellij)
# Guards: interactive TTY, SSH session, not already in Zellij, no escape hatch env var
if [ -t 0 ] && [ -n "$SSH_CONNECTION" ] && [ -z "$ZELLIJ" ] && [ -z "$BLOOM_NO_ZELLIJ" ]; then
  exec zellij attach bloom --create --layout bloom
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

The Zellij guard must come BEFORE the Pi launch block. On SSH login, bash hits the Zellij guard first and `exec`s into Zellij. Inside Zellij, Tab 1's login shell re-runs `.bash_profile` — `$ZELLIJ` is now set, so the guard is skipped, and execution falls through to the Pi launch block.

- [ ] **Step 2: Commit**

```bash
git add os/system_files/etc/skel/.bash_profile
git commit -m "feat(os): auto-launch Zellij on SSH with escape hatch"
```

---

## Chunk 2: Documentation Updates

### Task 4: Update docs referencing tmux

**Files:**
- Modify: `README.md:183`
- Modify: `docs/quick_deploy.md:107-116`

- [ ] **Step 1: Update README.md**

In `README.md` line 183, replace `tmux` with `zellij`:

```diff
-- **Tools**: tmux, git, gh, ripgrep, fd, bat, VS Code
+- **Tools**: zellij, git, gh, ripgrep, fd, bat, VS Code
```

- [ ] **Step 2: Update docs/quick_deploy.md**

Replace the SSH + tmux section (lines 107-117) with Zellij instructions. The final result should be:

````markdown
## Remote access (SSH + Zellij)

Bloom OS is accessed via SSH. Zellij auto-launches on SSH login with a tab-based layout (Pi, Shell, Logs).

```bash
# SSH into your Bloom (replace with your NetBird IP or hostname)
ssh pi@<netbird-ip>
```

Zellij launches automatically — no manual setup needed. To skip Zellij:

```bash
BLOOM_NO_ZELLIJ=1 ssh pi@<netbird-ip>
```
````

- [ ] **Step 3: Commit**

```bash
git add README.md docs/quick_deploy.md
git commit -m "docs: update SSH access docs — tmux → Zellij"
```

Note: `docs/plans/2026-03-08-drop-xpra-headless-display.md` and `docs/superpowers/specs/2026-03-12-os-build-modernization-design.md` also reference tmux but are historical plan/spec documents — leave them as-is since they describe past decisions.

---

### Task 5: Verify with OS image build (manual)

- [ ] **Step 1: Build the OS image**

```bash
just build
```

Expected: Build succeeds with `zellij` installed instead of `tmux`. No package resolution errors.

- [ ] **Step 2: Boot VM and test SSH**

```bash
just qcow2 && just vm
# In another terminal:
just vm-ssh
```

Expected: SSH login auto-launches Zellij with three tabs (Pi, Shell, Logs). Pi greeting and TUI appear in Tab 1.

- [ ] **Step 3: Test escape hatch**

```bash
BLOOM_NO_ZELLIJ=1 ssh -p 2222 pi@localhost
```

Expected: Drops to plain bash + Pi TUI, no Zellij.

- [ ] **Step 4: Test SCP safety**

```bash
echo "test" > /tmp/scp-test.txt
scp -P 2222 /tmp/scp-test.txt pi@localhost:/tmp/
```

Expected: File transfers successfully without Zellij intercepting. The `[ -t 0 ]` guard prevents Zellij from launching on non-interactive sessions.

- [ ] **Step 5: Test reconnect**

Disconnect SSH (close terminal), then reconnect:

```bash
just vm-ssh
```

Expected: Zellij attaches to existing "bloom" session, restoring prior state.
