# NixOS Test Suite Enhancement — Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Migrate all existing NixOS VM tests to the upstream `runTest` module pattern; add `nixpi-update` (deep integration) and `nixpi-options-validation` tests; expand check lanes.

---

## Background

The current test suite uses a custom `mkTest` wrapper that passes test helpers as explicit function arguments to each test file. Test files call `pkgs.testers.runNixOSTest` directly. The upstream NixOS test framework has moved to a module-based `runTest` pattern where test files are NixOS modules — they define test options (`name`, `nodes`, `testScript`) rather than calling the runner themselves. This spec covers migrating to that pattern and filling two coverage gaps.

---

## Architecture

Three layers:

1. **Test loader** (`tests/nixos/default.nix`) — orchestrates tests, injects shared args, calls `pkgs.testers.runNixOSTest`
2. **Test library** (`tests/nixos/lib.nix`) — shared helpers (node factories, Matrix client, register script)
3. **Individual test modules** (`tests/nixos/nixpi-*.nix`) — test definitions as NixOS modules

---

## Section 1: `default.nix` Migration

Remove the `mkTest` and `mkInstallerTest` wrapper functions. Replace with `runTest` and `runInstallerTest` that inject all shared helpers via `_module.args`:

```nix
let
  testLib = import ./lib.nix { inherit pkgs lib self; };

  # self is forwarded independently (not via testLib) so node modules can
  # reference self.nixosModules.* directly via _module.args.
  sharedArgs = {
    inherit piAgent appPackage setupPackage self;
    inherit (testLib)
      nixPiModules
      nixPiModulesNoShell
      mkTestFilesystems
      mkMatrixAdminSeedConfig
      matrixTestClient
      matrixRegisterScript
      mkManagedUserConfig
      mkPrefillActivation;
  };

  runTest = testFile: pkgs.testers.runNixOSTest {
    imports = [ testFile ];
    _module.args = sharedArgs;
  };

  runInstallerTest = testFile: pkgs.testers.runNixOSTest {
    imports = [ testFile ];
    _module.args = sharedArgs // { inherit installerHelper; };
  };
in
```

`lib.nix` is unchanged structurally — it still returns a named attrset of helpers. Its output fields are spread into `sharedArgs` via `inherit (testLib) ...`. `self` is listed separately in the `inherit` clause because it comes from the outer function argument, not from `testLib`.

---

## Section 2: Individual Test File Migration

Each of the 15 existing test files receives a mechanical transformation.

**Before pattern:**
```nix
{ pkgs, lib, nixPiModules, piAgent, appPackage, setupPackage, mkTestFilesystems, ... }:
pkgs.testers.runNixOSTest {
  name = "nixpi-foo";
  nodes.server = { ... }: {
    imports = nixPiModules ++ [ mkTestFilesystems ];
    _module.args = { inherit piAgent appPackage setupPackage; };
    ...
  };
  testScript = ''...'';
}
```

**After pattern:**
```nix
{ lib, nixPiModules, piAgent, appPackage, setupPackage, mkTestFilesystems, ... }:
{
  name = "nixpi-foo";
  nodes.server = { ... }: {
    imports = nixPiModules ++ [ mkTestFilesystems ];
    _module.args = { inherit piAgent appPackage setupPackage; };
    ...
  };
  testScript = ''...'';
}
```

Key changes per file:
- Remove `pkgs` from the **outer** function signature — it is no longer needed at the top level of the test file because `pkgs.testers.runNixOSTest` is now called in `default.nix`. Note: `pkgs` remains available inside `nodes.*` closures via the NixOS module system's standard special args — no change is needed there.
- Remove the `pkgs.testers.runNixOSTest { ... }` call wrapper
- The file body becomes the attrset that was previously passed to `runNixOSTest`
- `node.pkgsReadOnly = false` in `nixpi-installer-smoke.nix` is retained as-is (it is a test option, not a call argument). References to `${pkgs.path}/...` and `${pkgs.qemu}/...` inside `nixpi-installer-smoke.nix`'s `nodes` block continue to work because `pkgs` is injected as a standard NixOS test module argument by the framework.
- `_module.args` inside `nodes.*` definitions is retained where tests need to pass `piAgent`/`appPackage` into node modules

Files to migrate (all 15):
- `nixpi-matrix.nix`
- `nixpi-firstboot.nix`
- `nixpi-network.nix`
- `nixpi-daemon.nix`
- `nixpi-e2e.nix`
- `nixpi-home.nix`
- `nixpi-desktop.nix`
- `nixpi-security.nix`
- `nixpi-modular-services.nix`
- `nixpi-matrix-bridge.nix`
- `nixpi-matrix-reply.nix`
- `nixpi-bootstrap-mode.nix`
- `nixpi-post-setup-lockdown.nix`
- `nixpi-broker.nix`
- `nixpi-installer-smoke.nix`

---

## Section 3: New Test — `nixpi-update.nix` (Deep Integration)

### Purpose

Verify the full OTA update flow: the `nixpi-update.service` detects a new system closure, calls `nixos-rebuild switch`, and writes correct status to `~/.nixpi/update-status.json`.

### How the update script works

`core/scripts/system-update.sh` (runs as root via `nixpi-update.service`):
1. Exits early if `$NIXPI_SYSTEM_FLAKE_DIR/flake.nix` is missing (`ConditionPathExists` in the unit also guards this)
2. Runs `nix build <flake>#nixosConfigurations.<hostname>.config.system.build.toplevel --print-out-paths`
3. Compares result with `/run/current-system`
4. Writes `~/.nixpi/update-status.json` with `available: true/false`
5. If available, runs `nixos-rebuild switch --flake <flakeDir>` and rewrites status

`nixpi-update.service` sets `NIXPI_SYSTEM_FLAKE_DIR` from `config.nixpi-update.flakeDir`, which the `update.nix` module sets to `/etc/nixos`. The `ConditionPathExists` guard also uses this path. **The test writes its flake to `/etc/nixos` to match.**

### Test strategy

**Chosen approach: override the update command script to use `nix path-info` instead of `nix build`.**

The default `system-update.sh` runs `nix build <flake>#nixosConfigurations.<hostname>.config.system.build.toplevel`. Constructing a valid `nixosConfigurations` entry in a flake that points at a pre-built store path without network access requires `lib.nixosSystem` and `--impure` mode, which is fragile in a sandbox. Instead, the test supplies a custom update command that replaces the `nix build` step with `nix path-info` against the raw store paths directly. `nix path-info /nix/store/HASH-...` succeeds as long as the path is in the store (guaranteed by `virtualisation.additionalPaths`) without needing a flake, a network, or impure evaluation.

**How it works:**

Two pre-built system closures are constructed at Nix evaluation time and injected into the VM via `virtualisation.additionalPaths`:

- **`systemSame`** (`pkgs.runCommandLocal "nixpi-update-test-same" {} "ln -s ${nodeSystem} $out"`): a symlink to the same toplevel as the booted VM system
- **`systemNew`**: a real NixOS system closure (adds `pkgs.hello` to `environment.systemPackages`) built with the same base modules as the test node

`nodeSystem` is the test node's own `config.system.build.toplevel`, captured in the test's Nix expression via `(nixpkgs.lib.nixosSystem { ... }).config.system.build.toplevel`.

The test node overrides the update command to a custom shell script that:
1. Reads `NEW_SYSTEM` from a file at `/run/nixpi-update-test/next-system` (written by the test script)
2. Compares it with `/run/current-system`
3. If different, calls `nixos-rebuild switch --flake` (which succeeds because it switches to a pre-registered store path)
4. Writes `update-status.json` in the same format as the real script

The test Python script writes the store path of `systemSame` or `systemNew` into `/run/nixpi-update-test/next-system` between phases to control which generation is "available".

### Test phases

**Phase 1 — No-op update:**
- Write `/etc/nixos/flake.nix` (a minimal stub; content only needs to satisfy `ConditionPathExists` since the custom command script ignores it)
- Write the `systemSame` store path into `/run/nixpi-update-test/next-system`
- Wait for `multi-user.target`; verify `ConditionPathExists` is satisfied: `machine.succeed("test -f /etc/nixos/flake.nix")`
- Capture baseline generation count: `gen_before = int(machine.succeed("nix-env --list-generations -p /nix/var/nix/profiles/system | wc -l").strip())`
- Manually start `nixpi-update.service` and wait for completion: `machine.succeed("systemctl start nixpi-update.service")`
- Assert `~/.nixpi/update-status.json` contains `"available": false`
- Assert generation count unchanged: `gen_after == gen_before`

**Phase 2 — Real update:**
- Write the `systemNew` store path into `/run/nixpi-update-test/next-system`
- Capture baseline generation count: `gen_before = int(...)`
- Manually start `nixpi-update.service` and wait for completion
- Assert `~/.nixpi/update-status.json` contains `"available": false` (post-apply, update consumed)
- Assert generation count is `gen_before + 1`

### Node config

```nix
name = "nixpi-update";

nodes.machine = { ... }: {
  imports = nixPiModulesNoShell ++ [ mkTestFilesystems ];
  _module.args = { inherit piAgent appPackage setupPackage; };
  nixpi.primaryUser = "tester";
  networking.hostName = "nixpi-update-test";

  # update.nix is included via nixpi-base-no-shell → nixPiModulesNoShell; no
  # explicit enable needed. Disable the auto-timer so test drives manually.
  systemd.timers.nixpi-update.timerConfig.OnBootSec = lib.mkForce "999d";

  virtualisation.diskSize = 20480;
  virtualisation.memorySize = 4096;
  # Pre-seed both closures so nix build resolves without network
  virtualisation.additionalPaths = [ systemSame systemNew ];

  users.users.tester = { isNormalUser = true; group = "tester"; };
  users.groups.tester = {};
};
```

---

## Section 4: New Test — `nixpi-options-validation.nix`

### Purpose

Verify that NixOS module option defaults and overrides manifest correctly at VM runtime.

### Node A — defaults

Boot a minimal NixPI VM with no option overrides (`nixpi.primaryUser = "pi"` is the only required setting). Assert:

| Assertion | Command |
|---|---|
| Default primary user `pi` exists | `id pi` |
| Matrix binds to default port 6167 | `curl -sf http://localhost:6167/_matrix/client/versions` |
| NixPI Home binds to port 8080 | `curl -sf http://localhost:8080/` |
| Element Web binds to port 8081 | `curl -sf http://localhost:8081/` |
| Broker config contains `"maintain"` autonomy | Read `NIXPI_BROKER_CONFIG` path from service env: `cfg=$(systemctl show nixpi-broker.service -p Environment --value \| grep -oP 'NIXPI_BROKER_CONFIG=\K\S+'); grep -q maintain "$cfg"` |
| fail2ban active by default | `systemctl is-active fail2ban` |
| SSH password auth disabled | `sshd -T \| grep -i 'passwordauthentication no'` |

**Node A sizing:** `virtualisation.diskSize = 20480; virtualisation.memorySize = 4096;`

### Node B — overrides

Boot with custom port and security overrides. Assert:

| Override | Assertion |
|---|---|
| `nixpi.matrix.port = 7777` | `curl -sf http://localhost:7777/_matrix/client/versions` succeeds; port 6167 returns connection refused |
| `nixpi.services.home.port = 9090` | `curl -sf http://localhost:9090/` succeeds |
| `nixpi.security.fail2ban.enable = false` | `systemctl is-active fail2ban` exits non-zero |
| `nixpi.security.ssh.passwordAuthentication = true` | `sshd -T \| grep -i 'passwordauthentication yes'` |

**Node B sizing:** `virtualisation.diskSize = 20480; virtualisation.memorySize = 4096;`

Both nodes use `nixPiModules ++ [ mkTestFilesystems ]` and a managed user via `mkManagedUserConfig`.

---

## Section 5: Check Lane Updates

### `nixos-smoke`

Add `installer-smoke`. The `installer-smoke` alias is defined in `tests/nixos/default.nix` but is currently absent from the `nixos-smoke` lane in `flake.nix` (it only appears in `nixos-destructive`). Add it:

```nix
nixos-smoke = mkCheckLane "nixos-smoke" [
  { name = "smoke-matrix";    path = nixosTests.smoke-matrix; }
  { name = "smoke-firstboot"; path = nixosTests.smoke-firstboot; }
  { name = "smoke-security";  path = nixosTests.smoke-security; }
  { name = "smoke-broker";    path = nixosTests.smoke-broker; }
  { name = "smoke-desktop";   path = nixosTests.smoke-desktop; }
  { name = "installer-smoke"; path = nixosTests.installer-smoke; }
];
```

### `nixos-full`

Add the two new tests and register them in `tests` in `default.nix`:

```nix
nixos-full = mkCheckLane "nixos-full" [
  ...existing entries...
  { name = "nixpi-update";             path = nixosTests.nixpi-update; }
  { name = "nixpi-options-validation"; path = nixosTests.nixpi-options-validation; }
];
```

### `tests` attrset in `default.nix`

Add the two new entries:

```nix
tests = {
  ...existing entries...
  nixpi-update             = runTest ./nixpi-update.nix;
  nixpi-options-validation = runTest ./nixpi-options-validation.nix;
};
```

---

## Implementation Order

1. Migrate `default.nix` to `runTest`/`runInstallerTest` pattern
2. Migrate all 15 existing test files (mechanical transformation)
3. Run `nix build .#checks.x86_64-linux.nixos-smoke` to verify no regressions
4. Add `nixpi-options-validation.nix` (simpler new test)
5. Add `nixpi-update.nix` (complex new test requiring pre-built closures)
6. Update check lanes in `flake.nix`

---

## Out of Scope

- aarch64 / Raspberry Pi cross-platform test paths
- Migrating static checks (`config`, `installer-helper`, `installer-frontend`, `installer-backend`) — these are not NixOS VM tests and are unaffected
