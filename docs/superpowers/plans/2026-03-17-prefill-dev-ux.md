# Prefill Dev UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let developers place `core/scripts/prefill.env` (gitignored) in the repo and have `just vm` automatically stage it into the VM without any manual host setup.

**Architecture:** The justfile's `vm`, `vm-gui`, and `vm-daemon` targets already share `~/.bloom/` into the VM via 9p virtfs. Before launching QEMU, we add a staging block that copies `core/scripts/prefill.env` → `~/.bloom/prefill.env` if the project file exists. The wizard's existing fallback (`/mnt/host-bloom/prefill.env`) then picks it up — no wizard or NixOS changes needed.

**Tech Stack:** bash, just (justfile)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `.gitignore` | Add `core/scripts/prefill.env` |
| Untrack | `core/scripts/prefill.env` | `git rm --cached` (file is currently tracked) |
| Modify | `core/scripts/prefill.env.example` | Update header comment |
| Modify | `justfile` | Add staging block to `vm`, `vm-gui`, `vm-daemon` |

---

### Task 1: Untrack `prefill.env` and gitignore it

**Files:**
- Modify: `.gitignore`
- Untrack: `core/scripts/prefill.env`

- [ ] **Step 1: Add entry to `.gitignore`**

Open `.gitignore` and add this line after the existing entries:

```
core/scripts/prefill.env
```

- [ ] **Step 2: Untrack the file from git**

The file is currently tracked. The `.gitignore` entry alone won't stop it being committed — remove it from the index first:

```bash
git rm --cached core/scripts/prefill.env
```

Expected output:
```
rm 'core/scripts/prefill.env'
```

- [ ] **Step 3: Verify git no longer tracks it**

```bash
git status core/scripts/prefill.env
```

Expected: the file appears as untracked (not staged), confirming it is no longer in the index.

- [ ] **Step 4: Verify gitignore suppresses it**

```bash
git status
```

Expected: `core/scripts/prefill.env` does NOT appear in the output at all (gitignore is working).

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore core/scripts/prefill.env"
```

---

### Task 2: Update `prefill.env.example` header comment

**Files:**
- Modify: `core/scripts/prefill.env.example`

- [ ] **Step 1: Replace the header comment**

Current first line:
```
# Bloom wizard prefill — copy to ~/.bloom/prefill.env on your VM to skip prompts.
# Any variable left unset (or empty) will still prompt interactively.
```

Replace with:
```
# Bloom wizard prefill — copy to core/scripts/prefill.env and fill in values.
# just vm will stage it automatically; any variable left unset will still prompt.
```

- [ ] **Step 2: Commit**

```bash
git add core/scripts/prefill.env.example
git commit -m "docs: update prefill.env.example to describe new dev workflow"
```

---

### Task 3: Add staging block to justfile VM targets

**Files:**
- Modify: `justfile`

The same staging block goes into three targets: `vm`, `vm-gui`, and `vm-daemon`. In all three cases, insert it after the `cp "{{ ovmf_vars }}" "$vars"` line and before the `echo "Starting VM...` line.

The block to insert:

```bash
    # Stage project prefill into host-bloom share if present
    if [[ -f "core/scripts/prefill.env" ]]; then
        mkdir -p "$HOME/.bloom"
        cp "core/scripts/prefill.env" "$HOME/.bloom/prefill.env"
        echo "Staged core/scripts/prefill.env → ~/.bloom/prefill.env"
    fi
```

- [ ] **Step 1: Add staging block to `vm` target**

In the `vm` recipe (around line 59 in the justfile), locate:
```
    cp "{{ ovmf_vars }}" "$vars"
    echo "Starting VM... Press Ctrl+A X to exit"
```

Insert the staging block between those two lines:
```
    cp "{{ ovmf_vars }}" "$vars"
    # Stage project prefill into host-bloom share if present
    if [[ -f "core/scripts/prefill.env" ]]; then
        mkdir -p "$HOME/.bloom"
        cp "core/scripts/prefill.env" "$HOME/.bloom/prefill.env"
        echo "Staged core/scripts/prefill.env → ~/.bloom/prefill.env"
    fi
    echo "Starting VM... Press Ctrl+A X to exit"
```

- [ ] **Step 2: Add staging block to `vm-gui` target**

Locate the same two-line pattern in `vm-gui` (around line 98):
```
    cp "{{ ovmf_vars }}" "$vars"
    echo "Starting VM with GUI... Close window to exit"
```

Insert the staging block between them:
```
    cp "{{ ovmf_vars }}" "$vars"
    # Stage project prefill into host-bloom share if present
    if [[ -f "core/scripts/prefill.env" ]]; then
        mkdir -p "$HOME/.bloom"
        cp "core/scripts/prefill.env" "$HOME/.bloom/prefill.env"
        echo "Staged core/scripts/prefill.env → ~/.bloom/prefill.env"
    fi
    echo "Starting VM with GUI... Close window to exit"
```

- [ ] **Step 3: Add staging block to `vm-daemon` target**

Locate the same pattern in `vm-daemon` (around line 192):
```
    cp "{{ ovmf_vars }}" "$vars"

    # Check if VM is already running
```

Insert the staging block between them:
```
    cp "{{ ovmf_vars }}" "$vars"
    # Stage project prefill into host-bloom share if present
    if [[ -f "core/scripts/prefill.env" ]]; then
        mkdir -p "$HOME/.bloom"
        cp "core/scripts/prefill.env" "$HOME/.bloom/prefill.env"
        echo "Staged core/scripts/prefill.env → ~/.bloom/prefill.env"
    fi

    # Check if VM is already running
```

- [ ] **Step 4: Verify the staging block is present in all three targets**

```bash
grep -c "Stage project prefill" justfile
```

Expected output: `3`

- [ ] **Step 5: Verify staging block is absent from `vm-run` (it should not be there)**

```bash
grep -A5 "^vm-run:" justfile | grep "Stage project prefill"
```

Expected output: nothing (empty).

- [ ] **Step 6: Smoke-test the staging logic without running the VM**

Create a test prefill file, then manually run the staging block to confirm it copies correctly:

```bash
echo 'PREFILL_NAME="Test"' > core/scripts/prefill.env
bash -c '
  if [[ -f "core/scripts/prefill.env" ]]; then
    mkdir -p "$HOME/.bloom"
    cp "core/scripts/prefill.env" "$HOME/.bloom/prefill.env"
    echo "Staged core/scripts/prefill.env → ~/.bloom/prefill.env"
  fi
'
cat ~/.bloom/prefill.env
```

Expected output:
```
Staged core/scripts/prefill.env → ~/.bloom/prefill.env
PREFILL_NAME="Test"
```

- [ ] **Step 7: Commit**

```bash
git add justfile
git commit -m "feat(vm): auto-stage core/scripts/prefill.env into VM on launch"
```

---

### Task 4: End-to-end verification

This step is manual and requires a working QEMU setup. Skip if running in a headless CI environment.

- [ ] **Step 1: Populate `core/scripts/prefill.env` with real values**

```bash
cp core/scripts/prefill.env.example core/scripts/prefill.env
# Edit and fill in at least PREFILL_NAME and PREFILL_EMAIL
```

- [ ] **Step 2: Confirm the file is gitignored**

```bash
git status core/scripts/prefill.env
```

Expected: file does not appear (gitignored).

- [ ] **Step 3: Run `just vm` and watch for the staging message**

```bash
just vm
```

Expected in output (before QEMU starts):
```
Staged core/scripts/prefill.env → ~/.bloom/prefill.env
```

- [ ] **Step 4: Confirm wizard uses prefilled values**

Once the VM boots and the wizard runs, the fields set in `prefill.env` should appear as `[prefilled]` rather than prompting interactively.
