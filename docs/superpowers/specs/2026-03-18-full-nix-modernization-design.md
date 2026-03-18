# Full Nix Modernization — Design Spec

**Date:** 2026-03-18
**Status:** Approved

## Goal

Eliminate custom-where-standards-exist patterns, remove a plaintext-secret footgun, and make the codebase feel like idiomatic NixOS — cohesive and easy to set up for the developer, end users, and contributors.

## Scope

Four focused changes, each independently deliverable.

---

## 1. Remove WiFi NixOS Option

### Problem

`bloom-network.nix` exposes `bloom.wifi.ssid` and `bloom.wifi.psk` as NixOS options. If set, the PSK lands in the Nix store in plaintext. A TODO comment acknowledges this but leaves it unresolved.

### Solution

Delete the `bloom.wifi.ssid` / `bloom.wifi.psk` options and the `environment.etc."NetworkManager/system-connections/wifi.nmconnection"` block from `bloom-network.nix` entirely.

WiFi is already configured correctly by two other paths:
- The Calamares installer sets it during graphical install
- The first-boot wizard (`bloom-wizard.sh`) configures it interactively via NetworkManager

Neither path touches the Nix store. No secrets infrastructure (sops-nix, agenix) is needed — removing the option is sufficient.

### Files Changed

- `core/os/modules/bloom-network.nix` — remove `options.bloom.wifi` block and `environment.etc` nmconnection block
- `core/os/modules/bloom-options.nix` — remove wifi options if declared there

---

## 2. Sway Config + Shell Cleanup

### Problem

`bloom-shell.nix` embeds a 90-line Sway config inside a bash heredoc that runs conditionally on first login:

```bash
if [ ! -f "$HOME/.config/sway/config" ]; then
  mkdir -p "$HOME/.config/sway"
  cat > "$HOME/.config/sway/config" <<'SWAYCFG'
  ...90 lines...
  SWAYCFG
fi
```

This has two problems:
1. **Not rebuild-safe** — the config is written once and never updated by `nixos-rebuild switch`
2. **Hidden in bash** — config is buried inside a string inside a Nix string, hard to find and edit

Additionally, `.bashrc` manually sets `XDG_RUNTIME_DIR="/run/user/$(id -u)"`. NixOS manages this automatically via `pam_systemd` — manual override is redundant and can cause issues.

### Solution

**Sway config:** Extract the config to `environment.etc."sway/config"`. Sway reads `/etc/sway/config` as its system-wide config by default. NixOS manages the file — it updates on every `nixos-rebuild switch`.

Remove the `if [ ! -f ~/.config/sway/config ]` bash block and the heredoc from `.bash_profile`.

**XDG_RUNTIME_DIR:** Remove the `export XDG_RUNTIME_DIR=...` line from the `.bashrc` template in `bloom-shell.nix`. No replacement needed.

### Files Changed

- `core/os/modules/bloom-shell.nix`:
  - Add `environment.etc."sway/config".text = ''...sway config content...''`
  - Remove Sway config heredoc from `bashProfile`
  - Remove `XDG_RUNTIME_DIR` export from `bashrc`

---

## 3. Cachix Binary Cache

### Problem

`bloom-update.nix` has a commented-out TODO for Cachix:

```nix
# TODO: replace <cachix-url> and <cachix-pubkey> with real Cachix cache values
# nix.settings.substituters = [ ... ];
# nix.settings.trusted-public-keys = [ ... ];
```

Every `nixos-rebuild` on-device compiles the full closure from source. Updates take 20–60+ minutes depending on hardware.

### Solution

**Step 1 — Create Cachix cache:** Create a Cachix cache (e.g. `bloom-os`) at cachix.org. Free for public repositories.

**Step 2 — Wire into `bloom-update.nix`:** Uncomment and fill in the substituter and public key:

```nix
nix.settings.substituters = [
  "https://cache.nixos.org"
  "https://bloom-os.cachix.org"
];
nix.settings.trusted-public-keys = [
  "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
  "bloom-os.cachix.org-1:<pubkey>"
];
```

**Step 3 — GitHub Actions workflow:** Add `.github/workflows/cache.yml`. On every push to `main`, the workflow:
1. Installs Nix with the Determinate Systems action
2. Authenticates to Cachix using `CACHIX_AUTH_TOKEN` (stored in GitHub Actions secrets)
3. Builds `nix build .#checks.x86_64-linux.bloom-config`
4. Pushes the resulting closure to the Cachix cache

The signing key lives only in GitHub Actions secrets — never in the repo.

### Benefit

- End users: `nixos-rebuild` fetches pre-built binaries — updates take minutes
- Contributors: `nix build` pulls from cache — no local compilation
- Automatic: cache stays warm on every merge to main

### Files Changed

- `core/os/modules/bloom-update.nix` — uncomment and fill in substituters
- `.github/workflows/cache.yml` — new file

---

## 4. Dev Shell

### Problem

`flake.nix` has no `devShells` output. Contributors must either install Bloom OS or manually figure out what tools are needed (Node, TypeScript, vitest, biome, shellcheck, jq, etc.). These tools are listed as system packages in `bloom-network.nix` but require a full OS install to get.

### Solution

Add `devShells.${system}.default` to `flake.nix`. Running `nix develop` from the repo root drops into a shell with everything needed to work on the codebase — no Bloom OS install required, works on any NixOS or nix-enabled machine including macOS.

**Included tools:**

| Tool | Purpose |
|------|---------|
| `nodejs` | Runtime for daemon and extensions |
| `typescript` | Type checking |
| `vitest` (via npm) | Test runner |
| `biome` | Linting and formatting |
| `shellcheck` | Shell script linting |
| `jq` | JSON manipulation |
| `curl`, `git` | General tooling |
| `just` | Task runner (`just test`, `just lint`) |

The `devShell` does **not** include Nix-specific system services (localai, continuwuity) — those run on the OS. The shell is for code authoring and testing only.

### Files Changed

- `flake.nix` — add `devShells.${system}.default`

---

## Out of Scope

- **home-manager** — the current `/etc/skel` + tmpfiles approach works and is simpler for this use case. home-manager would add input pinning complexity and contributor overhead without meaningful benefit.
- **sops-nix / agenix** — not needed once the WiFi option is removed. The Matrix token is correctly generated at runtime.
- **TypeScript/extension refactoring** — out of scope; patterns are consistent and appropriate.
- **Shell script checkpoint system** — works well, not reinventing anything.

---

## Delivery Order

1. Remove WiFi option (smallest change, immediate security improvement)
2. Sway config + shell cleanup (self-contained NixOS module change)
3. Dev shell (flake.nix addition, unblocks contributors)
4. Cachix (requires external account setup, then small code change + CI file)
