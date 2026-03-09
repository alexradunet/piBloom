# Shell Conventions

Rules for all `.sh` files and inline shell in Containerfiles, systemd units, and GitHub Actions.

## Rules

1. **Shebang**: `#!/usr/bin/env bash` for standalone scripts. No `#!/bin/sh` unless POSIX-only is required.
2. **Strict mode**: `set -euo pipefail` immediately after the shebang. Every script, no exceptions.
3. **Quoting**: Double-quote all variable expansions (`"$VAR"`, `"${VAR}"`). Only skip quotes for intentional word splitting (rare, add comment explaining why).
4. **Variable naming**:
   - Local variables: `lower_snake_case`
   - Environment variables / constants: `UPPER_SNAKE_CASE`
   - Function names: `lower_snake_case`
5. **No backtick substitution.** Use `$()` for command substitution. `$(...)` nests cleanly; backticks don't.
6. **Error messages to stderr.** `echo "Error: ..." >&2`. Never print errors to stdout.
7. **Use `[[ ]]` for conditionals**, not `[ ]`. Double brackets support regex, glob, and safer string comparison.
8. **Heredocs for multi-line output.** Use `cat <<EOF` or `cat <<'EOF'` (quoted to prevent expansion). Don't chain echo statements.
9. **No `eval`.** Blocked by guardrails. If you think you need eval, redesign.
10. **No pipe-to-shell.** `curl | bash` and `wget | sh` are blocked by guardrails.
11. **Idempotent operations.** Scripts may run multiple times. Use `mkdir -p`, check before creating, use `|| true` for non-fatal cleanup.
12. **One-line description comment** at the top of the script (after shebang and set).

## Patterns

```bash
#!/usr/bin/env bash
set -euo pipefail

# Bloom login script — ensures Pi settings include Bloom package.

BLOOM_PKG="/usr/local/share/bloom"
PI_SETTINGS="$HOME/.pi/agent/settings.json"

if [[ -d "$BLOOM_PKG" ]]; then
    mkdir -p "$(dirname "$PI_SETTINGS")"
    if [[ -f "$PI_SETTINGS" ]]; then
        # ... modify existing settings
    else
        cp "$BLOOM_PKG/.pi/agent/settings.json" "$PI_SETTINGS"
    fi
fi
```

## Anti-patterns

```bash
# Bad: no strict mode
#!/bin/bash
rm -rf $TEMPDIR

# Bad: unquoted variable (word splitting + globbing risk)
if [ -f $PI_SETTINGS ]; then

# Bad: backtick substitution
VERSION=`cat version.txt`

# Bad: error to stdout
echo "Error: file not found"

# Bad: eval
eval "$USER_INPUT"
```
