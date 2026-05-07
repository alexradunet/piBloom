---
name: ownloom-audit
description: "Compare the ownloom host's current state (wiki, config, services) against a baseline and report drift. Use for periodic reviews, gap analysis, or before significant changes. Keywords: audit, baseline, drift, gap, review, compliance."
allowed-tools: shell
---

# ownloom Audit

This skill replaces the removed `ownloom-audit` CLI. Run a baseline comparison between wiki declarations and implemented state.

## Scope

The audit checks for drift between:

1. **Wiki baseline** — typed objects, daily notes, area pages
2. **ownloom config** — active `hosts/<host>/default.nix`, flake.nix, service modules
3. **Runtime state** — systemd units, podman containers, disk usage

## Procedure

### Step 1: Gather wiki state
```bash
ownloom-wiki call wiki_search '{"query":"status:reviewing","type":"decision"}' --json | jq length
ownloom-wiki call wiki_lint '{"mode":"strict"}' 2>&1 | tail -30
ownloom-wiki mutate wiki_decay_pass '{"dry_run":true}' 2>&1 | tail -20
```

### Step 2: Gather config state
```bash
FLAKE_DIR="${OWNLOOM_FLAKE_DIR:-${OWNLOOM_ROOT:-${HOME}/ownloom}}"
cd "$FLAKE_DIR"
git log --oneline -5
git status --short
nix flake check --no-build --accept-flake-config 2>&1 | tail -10
```

### Step 3: Gather runtime state
```bash
ownloom-context --health 2>&1 | head -40
```

### Step 4: Compare and report
Compare the wiki objects against running services. Look for:

- **Missing implementations** — wiki says a service should exist but `systemctl` doesn't see it
- **Orphan services** — running units with no wiki documentation
- **Stale decisions** — decisions whose `last_confirmed` or `confidence` is old
- **Config drift** — local uncommitted changes vs wiki-recorded plan

## Reporting

Write findings as a summary to the daily note:
```bash
ownloom-wiki mutate wiki_daily '{"action":"append","bullets":["Audit: <summary>"]}'
```

Optional: create an audit object:
```bash
ownloom-wiki mutate wiki_ensure_object '{"type":"snapshot","title":"Audit <date>","summary":"Baseline comparison result","domain":"technical","areas":["infrastructure"]}'
```

## Safety

- `--write-report` and `--capture-source` flags from the old CLI are gone. Write findings to wiki directly.
- Do not auto-remediate. Present findings to the user and ask before acting.
