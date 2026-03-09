# Configuration File Conventions

Rules for YAML, TOML, JSON, justfile, and GitHub Actions workflows.

## Rules

### YAML (.yaml, .yml)
1. **2-space indentation.** No tabs in YAML.
2. **Quote strings that could be misinterpreted**: booleans (`"true"`), numbers-as-strings (`"3.0"`), empty strings (`""`). Unambiguous strings don't need quotes.
3. **Comments before blocks**, not inline. One-line comment explaining each top-level key or section.
4. **Consistent key ordering**: metadata keys first (version, name), then content keys alphabetically or by logical grouping.
5. **`.yaml` for project config, `.yml` for GitHub Actions** (GitHub convention).

### TOML (.toml)
6. **Section headers** (`[section]`) with a blank line before each.
7. **Comments for non-obvious values.** Especially build configuration and version pins.
8. **Inline tables** only for simple key-value pairs. Use full tables for anything with 3+ keys.

### JSON (.json)
9. **Machine-managed JSON** (package.json, tsconfig.json, biome.json): don't add comments or reformat beyond what the tool produces.
10. **Tab indentation** for Biome-managed JSON. Follow the formatter.
11. **No trailing commas** (JSON spec doesn't allow them).

### GitHub Actions (.yml in .github/workflows/)
12. **Explicit permissions block.** Always declare `permissions:` with minimum required.
13. **Pin action versions** with full tag: `actions/checkout@v4`, not `@main`.
14. **Cache dependencies** when available (`cache: "npm"` in setup-node).
15. **Steps mirror local workflow**: install, build, check, test. Same commands as `npm run build`, `npm run check`, `npm run test:coverage`.

### justfile
16. **One-line comment** above each recipe describing what it does.
17. **Variables at top** with `env()` defaults for overridable values.
18. **Guard recipes** (prefixed with `_`) for precondition checks.

## Patterns

```yaml
# Good: service catalog entry
services:
  lemonade:
    version: "0.1.0"
    category: ai
    image: ghcr.io/lemonade-sdk/lemonade-server:v9.4.1
    optional: false
    preflight:
      commands: [podman, systemctl]
```

```toml
# Good: clear section with comment
[customizations]
hostname = "bloom"

[[customizations.user]]
name = "pi"
groups = ["wheel"]
```

```yaml
# Good: GitHub Actions with permissions and caching
permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
```

## Anti-patterns

```yaml
# Bad: no permissions block in workflow
on: push
jobs:
  build:
    runs-on: ubuntu-latest

# Bad: unpinned action
- uses: actions/checkout@main

# Bad: inconsistent quoting
version: 0.1.0    # YAML reads as float
version: "0.1.0"  # correct: string
```
