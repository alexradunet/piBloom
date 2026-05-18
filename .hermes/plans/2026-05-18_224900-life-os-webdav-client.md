# Life OS WebDAV Client Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a reusable declarative NixOS client module so `alex-laptop` and future NixOS clients automatically get Life OS desktop apps and a WebDAV mount to Nazar over Tailscale after rebuild.

**Architecture:** Keep Nazar as the private Life OS server and expose Life OS/WebDAV only over Tailscale. Add a client-side NixOS module that enables the required desktop apps, enables `davfs2`, creates a user-owned automount at a stable path, and encodes regression checks in `flake.nix`. Keep DAV credentials and Tailscale auth keys outside the Nix store; for this first iteration, use a runtime secrets file and document the manual secret placement.

**Tech Stack:** NixOS modules, Tailscale, systemd automounts, `davfs2`, KDE PIM packages, Obsidian, Thunderbird, flake checks.

---

## Current Context / Assumptions

- Canonical repo: `/home/alex/repos/nazar`.
- Server host: `nazar`.
- Laptop host: `alex-laptop`.
- Nazar is already enrolled in Tailscale at `100.92.138.94`.
- `alex-laptop` already imports:
  - `nix/modules/laptop/nazar-tunnel.nix`
  - `nix/modules/laptop/tailscale.nix`
- Laptop Tailscale is declarative client-only via `services.tailscale.useRoutingFeatures = "client"`.
- Server firewall already allows TCP/80 and TCP/443 on `tailscale0` only, and does not globally expose HTTP/HTTPS.
- Existing Life OS state root on Nazar is `/srv/life` with subdirectories for `calendar`, `tasks`, `projects`, `journal`, `habits`, `notes`, etc.
- User wants **WebDAV mount for now**, not local sync.
- User is on KDE and wants apps to consume Life OS comfortably.
- Keep secrets out of Nix expressions and `/nix/store`.
- Do not use `--impure`.

## Desired User Experience

After a client rebuild:

1. Tailscale daemon is enabled and uses client mode.
2. KDE/desktop Life OS apps are installed:
   - Obsidian
   - Thunderbird
   - KOrganizer
   - KAddressBook
   - Kontact or Merkuro if available/desired
3. `davfs2` is enabled.
4. A WebDAV mount exists at a predictable path, proposed:

   ```text
   /home/alex/LifeOS
   ```

5. The mount is not eagerly required during boot; it should be automounted on access.
6. If secrets are missing, the system should still rebuild, but mounting should fail clearly at runtime with documented instructions.
7. Future client hosts should enable the same module with a small option block.

## Proposed NixOS Interface

Create a client module with options under `nazar.lifeOs.client`:

```nix
nazar.lifeOs.client = {
  enable = true;
  user = "alex";
  group = "users";

  # Use a Tailscale/MagicDNS name once confirmed; use the Tailscale IP as a first working default if needed.
  davUrl = "http://100.92.138.94/dav/";

  # Local mount point for WebDAV-backed Life OS files.
  mountPoint = "/home/alex/LifeOS";

  # Runtime-only credential file, not managed directly by Nix.
  # Format should follow davfs2 secrets syntax.
  secretsFile = "/etc/davfs2/secrets";

  desktopApps.enable = true;
  kdeApps.enable = true;
  thunderbird.enable = true;
  obsidian.enable = true;
};
```

Prefer `http://100.92.138.94/...` only as a bootstrapping default if no stable Tailnet DNS name is available yet. Once MagicDNS name is known, switch to a name such as:

```text
http://nazar.<tailnet>.ts.net/dav/
```

or a private vhost such as:

```text
https://dav.nazar.<tailnet>.ts.net/
```

## Key Design Decision: Mount URL

Before coding the final mount, verify the actual WebDAV URL served by Nazar. Candidate endpoints:

- `http://100.92.138.94/dav/`
- `http://100.92.138.94/life/`
- `http://100.92.138.94/`
- `https://100.92.138.94/dav/`
- Tailnet MagicDNS equivalent once known

Implementation must not guess silently. It should inspect the host nginx/Radicale/WebDAV config and/or curl the candidate endpoints from Nazar/laptop context.

## Files Likely to Change

### Create

- `nix/modules/laptop/life-os-client.nix`
- Optional: `runbooks/LIFE_OS_CLIENTS.md`

### Modify

- `nix/hosts/alex-laptop/default.nix`
  - Import `../../modules/laptop/life-os-client.nix`.
  - Enable `nazar.lifeOs.client.enable = true;`.
  - Optionally set host-specific `davUrl`/`mountPoint`.
- `flake.nix`
  - Extend or add client evaluation checks.
- Possibly `runbooks/TAILSCALE_PRIVATE_ACCESS.md`
  - Link to Life OS client setup and WebDAV credentials instructions.

## Implementation Tasks

### Task 1: Verify the live/private DAV endpoint

**Objective:** Identify the correct WebDAV URL clients should mount.

**Files:**
- Read: `nix/modules/host/*.nix`
- Read: `nix/hosts/nazar/default.nix`
- Read: relevant runbooks
- No code changes yet.

**Steps:**

1. Search active config for DAV/nginx/Radicale routing:

   ```bash
   rg -n "dav|webdav|radicale|nginx|virtualHost|locations" nix runbooks packages
   ```

   Use Hermes `search_files` instead of raw `rg` when operating through tools.

2. Read the matching files.
3. Determine the actual URL path and protocol.
4. If the endpoint is ambiguous, test from a machine with access:

   ```bash
   curl -I http://100.92.138.94/<candidate-path>
   ```

5. Record the chosen URL in the implementation notes/final response.

**Expected Result:** One confirmed DAV base URL for client mount.

---

### Task 2: Create the reusable Life OS client module skeleton

**Objective:** Add a module with options but minimal behavior first.

**Files:**
- Create: `nix/modules/laptop/life-os-client.nix`

**Implementation Sketch:**

```nix
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.nazar.lifeOs.client;
in
{
  options.nazar.lifeOs.client = {
    enable = lib.mkEnableOption "Life OS client integration";

    user = lib.mkOption {
      type = lib.types.str;
      default = "alex";
      description = "User that owns the Life OS client mount.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "users";
      description = "Group that owns the Life OS client mount.";
    };

    davUrl = lib.mkOption {
      type = lib.types.str;
      description = "WebDAV URL for the Life OS files, reachable over Tailscale.";
    };

    mountPoint = lib.mkOption {
      type = lib.types.path;
      default = "/home/${cfg.user}/LifeOS";
      description = "Local WebDAV mount point.";
    };

    secretsFile = lib.mkOption {
      type = lib.types.path;
      default = "/etc/davfs2/secrets";
      description = "Runtime davfs2 secrets file. Must not be stored in Nix.";
    };

    desktopApps.enable = lib.mkEnableOption "Life OS desktop applications" // {
      default = true;
    };

    kdeApps.enable = lib.mkEnableOption "KDE PIM applications" // {
      default = true;
    };

    thunderbird.enable = lib.mkEnableOption "Thunderbird" // {
      default = true;
    };

    obsidian.enable = lib.mkEnableOption "Obsidian" // {
      default = true;
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = config.services.tailscale.enable;
        message = "Life OS client requires services.tailscale.enable = true.";
      }
      {
        assertion = config.services.tailscale.useRoutingFeatures == "client";
        message = "Life OS client expects Tailscale client mode unless routing behavior is explicitly designed.";
      }
    ];
  };
}
```

**Verification:**

```bash
nix fmt
nix flake check --no-build
```

Expected: evaluation passes once the module is imported and required options are set.

---

### Task 3: Add desktop application packages

**Objective:** Install Life OS consumer apps declaratively when the module is enabled.

**Files:**
- Modify: `nix/modules/laptop/life-os-client.nix`

**Implementation Sketch:**

Use `lib.optionals` so package sets can be toggled independently:

```nix
environment.systemPackages =
  lib.optionals (cfg.desktopApps.enable && cfg.obsidian.enable) [
    pkgs.obsidian
  ]
  ++ lib.optionals (cfg.desktopApps.enable && cfg.thunderbird.enable) [
    pkgs.thunderbird
  ]
  ++ lib.optionals (cfg.desktopApps.enable && cfg.kdeApps.enable) [
    pkgs.kdePackages.korganizer
    pkgs.kdePackages.kaddressbook
    pkgs.kdePackages.kontact
    pkgs.kdePackages.merkuro
  ];
```

If `pkgs.kdePackages.merkuro` does not exist in the current nixpkgs, remove it or guard it with `lib.optional (pkgs.kdePackages ? merkuro) pkgs.kdePackages.merkuro`.

**Verification:**

```bash
nix build .#nixosConfigurations.alex-laptop.config.system.build.toplevel --print-build-logs
```

Expected: package names resolve and laptop toplevel builds.

---

### Task 4: Add WebDAV support and automount

**Objective:** Enable `davfs2` and create a lazy systemd automount for Life OS.

**Files:**
- Modify: `nix/modules/laptop/life-os-client.nix`

**Implementation Sketch:**

```nix
services.davfs2.enable = true;

systemd.tmpfiles.rules = [
  "d ${toString cfg.mountPoint} 0750 ${cfg.user} ${cfg.group} - -"
];

fileSystems.${toString cfg.mountPoint} = {
  device = cfg.davUrl;
  fsType = "davfs";
  options = [
    "noauto"
    "x-systemd.automount"
    "x-systemd.idle-timeout=10min"
    "_netdev"
    "uid=${cfg.user}"
    "gid=${cfg.group}"
    "file_mode=0640"
    "dir_mode=0750"
  ];
};
```

**Notes:**

- Confirm whether `uid=`/`gid=` accept names for `davfs2` in this context. If not, use numeric IDs or omit and rely on mount owner behavior.
- Do not embed username/password in `device`, `options`, or Nix config.
- `davfs2` reads credentials from `/etc/davfs2/secrets` or user secrets. Document the expected line, for example:

  ```text
  https://dav.example.invalid/ alex PASSWORD
  ```

  The real password must be inserted manually or via a future secrets module.

**Verification:**

```bash
nix build .#nixosConfigurations.alex-laptop.config.system.build.toplevel --print-build-logs
```

Expected: toplevel builds.

Runtime verification after switching laptop:

```bash
systemctl status home-alex-LifeOS.automount --no-pager -l
ls -la /home/alex/LifeOS
findmnt /home/alex/LifeOS
```

---

### Task 5: Enable the module on `alex-laptop`

**Objective:** Wire the reusable module into the laptop host config.

**Files:**
- Modify: `nix/hosts/alex-laptop/default.nix`

**Steps:**

1. Add import:

   ```nix
   ../../modules/laptop/life-os-client.nix
   ```

2. Add config near existing Nazar access settings:

   ```nix
   nazar.lifeOs.client = {
     enable = true;
     davUrl = "<confirmed DAV URL>";
     mountPoint = "/home/alex/LifeOS";
   };
   ```

3. Add assertions for expected client behavior if not already fully covered by module:

   ```nix
   {
     assertion = config.nazar.lifeOs.client.enable;
     message = "alex-laptop must keep Life OS client integration enabled.";
   }
   {
     assertion = config.services.davfs2.enable;
     message = "alex-laptop must keep davfs2 enabled for the Life OS WebDAV mount.";
   }
   ```

**Verification:**

```bash
nix fmt
nix flake check --no-build
nix build .#nixosConfigurations.alex-laptop.config.system.build.toplevel --print-build-logs
```

---

### Task 6: Extend flake checks with Life OS client invariants

**Objective:** Make regressions visible in CI/checks.

**Files:**
- Modify: `flake.nix`

**Implementation Sketch:**

In `alex-laptop-tunnel-module-eval`, add assertions for:

- `nazar.lifeOs.client.enable == true`
- `services.davfs2.enable == true`
- `fileSystems."/home/alex/LifeOS"` exists
- `fileSystems."/home/alex/LifeOS".fsType == "davfs"`
- `fileSystems."/home/alex/LifeOS".options` contains `x-systemd.automount`
- `fileSystems."/home/alex/LifeOS".options` contains `_netdev`
- `environment.systemPackages` contains the selected package derivations if feasible

If checking package membership is too brittle, check the module options instead:

- `nazar.lifeOs.client.desktopApps.enable`
- `nazar.lifeOs.client.kdeApps.enable`
- `nazar.lifeOs.client.obsidian.enable`
- `nazar.lifeOs.client.thunderbird.enable`

**Verification:**

```bash
nix build .#checks.x86_64-linux.alex-laptop-tunnel-module-eval --print-build-logs
```

Then inspect outputs:

```bash
find result -maxdepth 1 -type f -print -exec cat {} \;
```

Expected: all marker files contain the expected values and the derivation succeeds.

---

### Task 7: Add a client runbook

**Objective:** Document how future clients consume Life OS and what manual secret/enrollment steps remain.

**Files:**
- Create: `runbooks/LIFE_OS_CLIENTS.md`
- Optionally modify: `runbooks/TAILSCALE_PRIVATE_ACCESS.md`

**Content Requirements:**

Include:

1. Overview of the client module.
2. How to enable it on a new host.
3. Tailscale enrollment:

   ```bash
   sudo tailscale up --hostname=<host> --ssh=false
   ```

   Or future auth-key path once secrets management is added.

4. WebDAV credentials file instructions:

   ```bash
   sudo install -m 0600 -o root -g root /dev/null /etc/davfs2/secrets
   sudoedit /etc/davfs2/secrets
   ```

   Example placeholder only; never include real credentials:

   ```text
   <dav-url> <username> <password>
   ```

5. Switch command:

   ```bash
   sudo nixos-rebuild switch --flake .#alex-laptop
   ```

6. Verification:

   ```bash
   systemctl is-active tailscaled
   sudo tailscale status
   systemctl status home-alex-LifeOS.automount --no-pager -l
   ls /home/alex/LifeOS
   findmnt /home/alex/LifeOS
   ```

7. Desktop app setup notes:
   - Open Obsidian and use `/home/alex/LifeOS/notes` or `/home/alex/LifeOS` as the vault/path depending on actual layout.
   - KOrganizer/KAddressBook/Thunderbird can be pointed manually at the same DAV endpoint for calendar/contact/task UI.
   - KDE Akonadi account provisioning is intentionally not automated in this first pass.

---

### Task 8: Full validation before commit

**Objective:** Verify formatting, evaluation, build, and specific check derivations.

**Commands:**

```bash
nix fmt
git diff --check
nix flake check --no-build
nix build .#checks.x86_64-linux.alex-laptop-tunnel-module-eval --print-build-logs
nix build .#nixosConfigurations.alex-laptop.config.system.build.toplevel --print-build-logs
```

Expected:

- Formatting succeeds.
- No whitespace errors.
- Flake evaluation succeeds.
- Laptop invariant check succeeds.
- Laptop toplevel builds.

---

### Task 9: Commit and push

**Objective:** Persist the declarative client integration.

**Commands:**

```bash
git status --short
git add flake.nix nix/hosts/alex-laptop/default.nix nix/modules/laptop/life-os-client.nix runbooks/LIFE_OS_CLIENTS.md runbooks/TAILSCALE_PRIVATE_ACCESS.md
git commit -m "feat(life-os): add laptop WebDAV client integration"
git push
```

Expected:

- Commit succeeds.
- Push succeeds to `codeberg/main`.

---

### Task 10: Runtime rollout on laptop

**Objective:** Apply and verify on `alex-laptop`.

**Commands on laptop:**

```bash
cd /home/alex/repos/nazar
git pull
sudo nixos-rebuild switch --flake .#alex-laptop
systemctl is-active tailscaled
sudo tailscale status
systemctl status home-alex-LifeOS.automount --no-pager -l
ls -la /home/alex/LifeOS
findmnt /home/alex/LifeOS
```

Expected:

- Rebuild succeeds.
- Tailscale is active and connected.
- Automount exists.
- Accessing `/home/alex/LifeOS` triggers the mount.
- `findmnt /home/alex/LifeOS` shows a `davfs` mount.

## Risks / Tradeoffs

### WebDAV mount and Obsidian

Obsidian can work over a mounted WebDAV filesystem, but it is not as robust as a local synced folder. Risks include latency, file locking quirks, and network failure behavior. This is acceptable for the first iteration because the user explicitly requested WebDAV mount for now.

### Credentials

`davfs2` credentials must not be placed in Nix. First iteration should document a manual `/etc/davfs2/secrets` setup. Later, add `sops-nix` or `agenix` for declarative secret delivery.

### KDE PIM provisioning

KOrganizer/KAddressBook account creation through Akonadi is not cleanly declarative. Do not attempt brittle Akonadi DB/config generation in the first pass. Install the apps and document one-time setup.

### URL stability

Using raw Tailscale IP works but is less maintainable than MagicDNS. Prefer MagicDNS once confirmed. If MagicDNS is unavailable during implementation, use `100.92.138.94` and leave a clear TODO/runbook note.

### Boot behavior

The mount must use `noauto`, `x-systemd.automount`, and `_netdev` to avoid making laptop boot depend on Nazar or network availability.

## Open Questions To Resolve During Implementation

1. What is the exact active WebDAV URL/path on Nazar?
2. Is the WebDAV endpoint HTTP-only over Tailscale or HTTPS with a valid/private cert?
3. Is Tailscale MagicDNS enabled and what is Nazar's stable MagicDNS name?
4. What username should WebDAV clients use: `alex` or a service-specific DAV user?
5. Does the current server expose all of `/srv/life` via WebDAV or only selected subtrees?
6. Should `/home/alex/LifeOS` point to the entire Life OS root or only `/srv/life/notes`?

## Acceptance Criteria

- `alex-laptop` imports and enables a reusable Life OS client module.
- `services.davfs2.enable` is true for `alex-laptop`.
- `/home/alex/LifeOS` is declared as a lazy WebDAV automount.
- Obsidian, Thunderbird, and KDE PIM apps are installed by the module.
- No DAV credentials or Tailscale auth keys are stored in Nix expressions.
- Flake checks verify the important client invariants.
- Laptop toplevel builds successfully.
- Runbook documents enrollment, credentials, rebuild, and runtime verification.
