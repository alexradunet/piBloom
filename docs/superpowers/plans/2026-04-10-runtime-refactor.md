# Runtime Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final cleanup pass before VPS deploy — declarative Nix enable options, neverthrow Result<T,E> at extension boundaries, flake decomposition, bootstrap script modularisation, test consolidation. No backwards compatibility shims.

**Architecture:** Three independent phases executed in any order: (A) Nix layer — replace module-sets with enable options, flatten options, decompose flake, extract CIDR lib; (B) TypeScript layer — adopt neverthrow, remove safePath alias; (C) Shell + Tests + Docs — split bootstrap script, consolidate tests, remove stale references.

**Tech Stack:** Nix module system (`mkEnableOption`, `lib.mkIf`), `neverthrow` 8.x (`ok`/`err`/`ResultAsync`), Vitest, Biome, ShellCheck, `nix flake check`.

**Spec:** `docs/superpowers/specs/2026-04-10-runtime-refactor-design.md`

---

## Phase A — Nix Layer

### Task 1: Flatten `options/` into single `options.nix` (remove compat shims)

**Files:**
- Modify: `core/os/modules/options.nix`
- Delete: `core/os/modules/options/core.nix`
- Delete: `core/os/modules/options/security.nix`
- Delete: `core/os/modules/options/bootstrap.nix`
- Delete: `core/os/modules/options/agent.nix`

- [ ] **Step 1: Replace `options.nix` with single flat file**

```nix
# core/os/modules/options.nix
{ lib, config, ... }:

let
  absolutePath = lib.types.pathWith { absolute = true; };
  cfg = config.nixpi.bootstrap;
in
{
  options.nixpi = {
    primaryUser = lib.mkOption {
      type = lib.types.str;
      default = "pi";
      description = "Primary human/operator account for the NixPI machine.";
    };

    allowPrimaryUserChange = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Allow a one-time intentional change to `nixpi.primaryUser` on an
        already-activated system.
      '';
    };

    stateDir = lib.mkOption {
      type = absolutePath;
      default = "/var/lib/nixpi";
      description = "Root directory for service-owned NixPI state.";
    };

    timezone = lib.mkOption {
      type = lib.types.str;
      default = "UTC";
      description = "System timezone (IANA string, e.g. Europe/Paris).";
    };

    keyboard = lib.mkOption {
      type = lib.types.str;
      default = "us";
      description = "Console keyboard layout (e.g. fr, de, us).";
    };

    flake = lib.mkOption {
      type = lib.types.str;
      default = "/etc/nixos#nixos";
      description = "Flake URI for this NixPI system used by auto-upgrade and the broker.";
    };

    update = {
      onBootSec = lib.mkOption {
        type = lib.types.str;
        default = "5min";
        description = "Delay before the first automatic update check after boot.";
      };
      interval = lib.mkOption {
        type = lib.types.str;
        default = "6h";
        description = "Recurrence interval for the automatic update timer.";
      };
    };

    security = {
      fail2ban.enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether fail2ban protects SSH against brute-force attempts.";
      };
      ssh.passwordAuthentication = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether SSH password authentication is enabled.";
      };
      ssh.allowedSourceCIDRs = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        example = [ "198.51.100.10/32" "2001:db8::/48" ];
        description = "Source CIDRs allowed to reach the public SSH service.";
      };
      ssh.allowUsers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Explicit SSH login allowlist. Empty = use primaryUser.";
      };
      trustedInterface = lib.mkOption {
        type = lib.types.str;
        default = "wt0";
        description = "Network interface trusted for NixPI service surface.";
      };
      enforceServiceFirewall = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether NixPI service ports are opened only on the trusted interface.";
      };
      passwordlessSudo.enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Deprecated blanket passwordless sudo. Keep false; use broker instead.";
      };
    };

    bootstrap = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether the system is in declarative bootstrap mode.";
      };
      ssh.enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether SSH is exposed during bootstrap.";
      };
      temporaryAdmin.enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether the primary operator has declarative bootstrap-time passwordless sudo.";
      };
    };

    agent = {
      autonomy = lib.mkOption {
        type = lib.types.enum [ "observe" "maintain" "admin" ];
        default = "maintain";
        description = "Default privileged autonomy level for the always-on agent.";
      };
      allowedUnits = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ "nixpi-update.service" ];
        description = "Systemd units the broker may operate on.";
      };
      broker.enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether the root-owned NixPI operations broker is enabled.";
      };
      elevation.duration = lib.mkOption {
        type = lib.types.str;
        default = "30m";
        description = "Default duration for a temporary admin elevation grant.";
      };
      osUpdate.enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether the broker may apply or roll back NixOS generations.";
      };
      packagePaths = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ "/usr/local/share/nixpi" ];
        description = "Package root paths passed to the Pi agent settings.json packages field.";
      };
      piDir = lib.mkOption {
        type = lib.types.str;
        description = "Declarative Pi runtime directory exported as NIXPI_PI_DIR.";
      };
      workspaceDir = lib.mkOption {
        type = lib.types.str;
        description = "Root directory for the Pi agent workspace.";
      };
    };
  };

  config = {
    nixpi.bootstrap.ssh.enable = lib.mkDefault cfg.enable;
    nixpi.bootstrap.temporaryAdmin.enable = lib.mkDefault cfg.enable;
    nixpi.agent.piDir = lib.mkDefault "/home/${config.nixpi.primaryUser}/.pi";
    nixpi.agent.workspaceDir = lib.mkDefault "/home/${config.nixpi.primaryUser}/nixpi";
  };
}
```

- [ ] **Step 2: Delete the four sub-files**

```bash
rm core/os/modules/options/core.nix
rm core/os/modules/options/security.nix
rm core/os/modules/options/bootstrap.nix
rm core/os/modules/options/agent.nix
rmdir core/os/modules/options
```

- [ ] **Step 3: Verify Nix evaluates**

```bash
nix eval .#nixosConfigurations.vps.config.nixpi.primaryUser
```
Expected: `"pi"` (or whatever vps.nix sets)

- [ ] **Step 4: Commit**

```bash
git add core/os/modules/options.nix
git rm core/os/modules/options/core.nix core/os/modules/options/security.nix core/os/modules/options/bootstrap.nix core/os/modules/options/agent.nix
git commit -m "Flatten options/ sub-files into single options.nix, drop compat shims"
```

---

### Task 2: Create CIDR validation library

**Files:**
- Create: `core/os/lib/network.nix`
- Modify: `core/os/modules/network.nix`

- [ ] **Step 1: Create `core/os/lib/network.nix`**

```nix
# core/os/lib/network.nix
{ lib }:

let
  isDigits = value: builtins.match "^[0-9]+$" value != null;
  parseInt = value: builtins.fromJSON value;
  hasValidPrefix = max: prefix:
    if isDigits prefix then
      let prefixInt = parseInt prefix;
      in prefixInt >= 0 && prefixInt <= max
    else false;
  isValidIPv4CIDR = cidr:
    let parts = lib.splitString "/" cidr;
    in builtins.length parts == 2 && (
      let
        address = builtins.elemAt parts 0;
        prefix = builtins.elemAt parts 1;
        octets = lib.splitString "." address;
      in
      builtins.length octets == 4
      && hasValidPrefix 32 prefix
      && builtins.all (octet:
        if isDigits octet then
          let octetInt = parseInt octet;
          in octetInt >= 0 && octetInt <= 255
        else false
      ) octets
    );
  ipv6Segments = part: if part == "" then [ ] else lib.splitString ":" part;
  isValidIPv6Hextet = hextet: builtins.match "^[0-9A-Fa-f]{1,4}$" hextet != null;
  isValidIPv6CIDR = cidr:
    let parts = lib.splitString "/" cidr;
    in builtins.length parts == 2 && (
      let
        address = builtins.elemAt parts 0;
        prefix = builtins.elemAt parts 1;
        compressionParts = lib.splitString "::" address;
        compressionCount = builtins.length compressionParts - 1;
        segments = builtins.concatLists (map ipv6Segments compressionParts);
      in
      lib.hasInfix ":" address
      && compressionCount <= 1
      && hasValidPrefix 128 prefix
      && builtins.all isValidIPv6Hextet segments
      && (if compressionCount == 0 then builtins.length segments == 8 else builtins.length segments < 8)
    );
in
{
  isValidSourceCIDR = cidr: isValidIPv4CIDR cidr || isValidIPv6CIDR cidr;
}
```

- [ ] **Step 2: Update `core/os/modules/network.nix` to import lib**

Replace the inline CIDR logic at the top of `network.nix` with:

```nix
# core/os/modules/network.nix
{ lib, config, ... }:

let
  netLib = import ../lib/network.nix { inherit lib; };
  primaryUser = config.nixpi.primaryUser;
  securityCfg = config.nixpi.security;
  bootstrapCfg = config.nixpi.bootstrap;
  allowedSourceCIDRs = securityCfg.ssh.allowedSourceCIDRs;
  invalidAllowedSourceCIDRs = lib.filter (cidr: !(netLib.isValidSourceCIDR cidr)) allowedSourceCIDRs;
  sshAllowUsers =
    if securityCfg.ssh.allowUsers != [ ] then securityCfg.ssh.allowUsers
    else lib.optional (primaryUser != "") primaryUser;
  publicSshEnabled = bootstrapCfg.ssh.enable;
  ipv4AllowedSourceCIDRs = lib.filter (cidr: !(lib.hasInfix ":" cidr)) allowedSourceCIDRs;
  ipv6AllowedSourceCIDRs = lib.filter (cidr: lib.hasInfix ":" cidr) allowedSourceCIDRs;
  sshFirewallRules = lib.concatStringsSep "\n" (
    (map (cidr: "ip saddr ${cidr} tcp dport 22 accept") ipv4AllowedSourceCIDRs)
    ++ (map (cidr: "ip6 saddr ${cidr} tcp dport 22 accept") ipv6AllowedSourceCIDRs)
  );
in
# ... rest of network.nix unchanged from `{` onwards
```

(Keep everything from line 82 `{` to the end of the file unchanged — only the `let` block at the top changes.)

- [ ] **Step 3: Verify**

```bash
nix eval .#nixosConfigurations.vps.config.networking.nftables.enable
```
Expected: `true`

- [ ] **Step 4: Commit**

```bash
git add core/os/lib/network.nix core/os/modules/network.nix
git commit -m "Extract CIDR validation into core/os/lib/network.nix"
```

---

### Task 3: Add `nixpi.shell.enable` to `shell.nix` (default true)

**Files:**
- Modify: `core/os/modules/shell.nix`

- [ ] **Step 1: Add enable option and gate config with `lib.mkIf`**

Add to the top-level attribute set of `shell.nix`:

```nix
{ pkgs, lib, config, ... }:

let
  inherit (config.nixpi) allowPrimaryUserChange primaryUser stateDir;
  primaryHome = "/home/${primaryUser}";
  inherit (config.nixpi.agent) piDir workspaceDir;
  nodeBinDir = "${builtins.head config.nixpi.agent.packagePaths}/node_modules/.bin";
  primaryUserMarker = "${stateDir}/primary-user";
in
{
  imports = [ ./options.nix ];

  options.nixpi.shell.enable = lib.mkOption {
    type = lib.types.bool;
    default = true;
    description = ''
      Whether to configure the operator shell environment and primary user account.
      Must remain true for OVH KVM console access — disabling leaves the system
      without a login shell if SSH is unavailable.
    '';
  };

  config = lib.mkIf config.nixpi.shell.enable {
    # Copy the entire existing `config = { ... };` block from shell.nix verbatim —
    # lines 19–112 of the current file. Only the wrapping changes: `config = { ... }` → `config = lib.mkIf config.nixpi.shell.enable { ... }`.
    assertions = [ ... ];
    system.activationScripts."00-nixpi-primary-user-guard" = { ... };
    users.users.${primaryUser} = { ... };
    users.groups.${primaryUser} = { };
    security.sudo.extraRules = ...;
    environment.etc = { "issue".text = "NixPI\n"; };
    environment.sessionVariables = { ... };
    programs.bash = { ... };
    boot.kernel.sysctl."kernel.printk" = "4 4 1 7";
    # (paste the complete content — do not summarise)
  };
}
```

- [ ] **Step 2: Verify VPS still boots with shell enabled**

```bash
nix eval .#nixosConfigurations.vps.config.nixpi.shell.enable
```
Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add core/os/modules/shell.nix
git commit -m "Add nixpi.shell.enable option (default true) for KVM-safe shell access"
```

---

### Task 4: Add `nixpi.app.enable` to `app.nix`

**Files:**
- Modify: `core/os/modules/app.nix`

- [ ] **Step 1: Add enable option and gate config**

```nix
{ pkgs, lib, config, ... }:

let
  inherit (config.nixpi) primaryUser stateDir;
  inherit (config.nixpi.agent) piDir;
  agentStateDir = piDir;
  piAgent = pkgs.callPackage ../pkgs/pi { };
  appPackage = pkgs.callPackage ../pkgs/app { inherit piAgent; };
  piCommand = pkgs.writeShellScriptBin "pi" ''
    export PI_SKIP_VERSION_CHECK=1
    export NIXPI_BOOTSTRAP_MODE="${if config.nixpi.bootstrap.enable then "bootstrap" else "steady"}"
    export PATH="${lib.makeBinPath [ pkgs.bash pkgs.fd pkgs.ripgrep ]}:$PATH"
    exec ${appPackage}/share/nixpi/node_modules/.bin/pi "$@"
  '';
  defaultSettings = pkgs.writeText "pi-settings.json" (
    builtins.toJSON {
      packages = config.nixpi.agent.packagePaths;
      shellPath = "${pkgs.bash}/bin/bash";
    }
  );
  appSetupScript = pkgs.writeShellScript "nixpi-app-setup" ''
    ${pkgs.systemd}/bin/systemd-tmpfiles --create --prefix=${agentStateDir} --prefix=${stateDir} --prefix=/usr/local/share/nixpi

    if [ -e ${agentStateDir}/auth.json ]; then
      ln -sfn ../auth.json ${agentStateDir}/agent/auth.json
    else
      rm -f ${agentStateDir}/agent/auth.json
    fi
  '';
in
{
  imports = [ ./options.nix ];

  options.nixpi.app.enable = lib.mkOption {
    type = lib.types.bool;
    default = true;
    description = "Whether to install the Pi agent app service and runtime.";
  };

  config = lib.mkIf config.nixpi.app.enable {
    environment.systemPackages = [ appPackage piCommand ];

    systemd.tmpfiles.settings.nixpi-app = {
      "/usr/local/share/nixpi"."L+" = { argument = "${appPackage}/share/nixpi"; };
      "/etc/nixpi/appservices".d = { mode = "0755"; user = "root"; group = "root"; };
      "${stateDir}".d = { mode = "0770"; user = primaryUser; group = primaryUser; };
      "${stateDir}/services".d = { mode = "0770"; user = primaryUser; group = primaryUser; };
      "${agentStateDir}".d = { mode = "0700"; user = primaryUser; group = primaryUser; };
      "${agentStateDir}/agent".d = { mode = "0700"; user = primaryUser; group = primaryUser; };
      "${agentStateDir}/settings.json"."L+" = { argument = toString defaultSettings; };
    };

    systemd.services.nixpi-app-setup = {
      description = "NixPI app setup: apply declarative runtime tmpfiles";
      wantedBy = [ "multi-user.target" ];
      after = [ "systemd-tmpfiles-setup.service" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        User = "root";
        ExecStart = "${appSetupScript}";
      };
    };
  };
}
```

- [ ] **Step 2: Verify**

```bash
nix eval .#nixosConfigurations.vps.config.nixpi.app.enable
```
Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add core/os/modules/app.nix
git commit -m "Add nixpi.app.enable option (default true)"
```

---

### Task 5: Add `nixpi.tooling.enable` to `tooling.nix`

**Files:**
- Modify: `core/os/modules/tooling.nix`

- [ ] **Step 1: Add enable option and gate config**

```nix
{ pkgs, lib, config, ... }:

let
  nixpiRebuild = pkgs.callPackage ../pkgs/nixpi-rebuild { };
in
{
  imports = [ ./options.nix ];

  options.nixpi.tooling = {
    enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to install the NixPI operator tooling bundle.";
    };
    qemu.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install QEMU and OVMF for running local NixOS VM tests.
        Disable on production VPS to reduce closure size.
      '';
    };
  };

  config = lib.mkIf config.nixpi.tooling.enable {
    environment.systemPackages = with pkgs; [
      git git-lfs gh nodejs ripgrep fd bat htop jq curl wget
      unzip openssl just shellcheck biome typescript nixpiRebuild
    ]
    ++ lib.optionals config.nixpi.tooling.qemu.enable [ pkgs.qemu pkgs.OVMF ]
    ++ lib.optionals config.nixpi.security.fail2ban.enable [ pkgs.fail2ban ];
  };
}
```

- [ ] **Step 2: Verify**

```bash
nix eval .#nixosConfigurations.vps.config.nixpi.tooling.enable
```
Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add core/os/modules/tooling.nix
git commit -m "Add nixpi.tooling.enable option (default true)"
```

---

### Task 6: Replace `module-sets.nix` — single `nixpi` module in flake, update consumers

**Files:**
- Delete: `core/os/modules/module-sets.nix`
- Modify: `flake.nix` — nixosModules section

The four variant modules (`nixpi-base-no-shell`, `nixpi-base`, `nixpi-no-shell`, `nixpi`) collapse to one. All modules are always imported; enable flags control activation.

- [ ] **Step 1: Update `nixosModules` in `flake.nix`**

Replace lines 103–139 (the `nixosModules = { ... };` block) with:

```nix
nixosModules = {
  # Single composable module — all NixPI feature modules.
  # Control activation via nixpi.app.enable, nixpi.shell.enable,
  # nixpi.tooling.enable, nixpi.agent.broker.enable (all default true).
  nixpi =
    { ... }:
    {
      imports = [
        ./core/os/modules/options.nix
        ./core/os/modules/network.nix
        ./core/os/modules/update.nix
        ./core/os/modules/app.nix
        ./core/os/modules/broker.nix
        ./core/os/modules/tooling.nix
        ./core/os/modules/shell.nix
      ];
    };
};
```

Also remove the `moduleSets = import ./core/os/modules/module-sets.nix;` line at the top of the outputs let block.

- [ ] **Step 2: Search for all consumers of old module variants**

```bash
grep -r 'nixpi-base-no-shell\|nixpi-base\|nixpi-no-shell\|moduleSets\|module-sets' --include='*.nix' --include='*.ts' -l .
```

Update every file found:
- Any `self.nixosModules.nixpi-no-shell` → `self.nixosModules.nixpi` (with `nixpi.shell.enable = false;` in the module config if a test intentionally skips shell)
- Any `self.nixosModules.nixpi-base` → `self.nixosModules.nixpi` (with `nixpi.app.enable = false; nixpi.tooling.enable = false;`)
- Any `self.nixosModules.nixpi-base-no-shell` → same as above

- [ ] **Step 3: Delete `module-sets.nix`**

```bash
git rm core/os/modules/module-sets.nix
```

- [ ] **Step 4: Verify Nix evaluates**

```bash
nix eval .#nixosConfigurations.vps.config.system.stateVersion 2>&1 | head -5
nix eval .#nixosConfigurations.installed-test.config.nixpi.app.enable
```
Expected: no errors, `true`

- [ ] **Step 5: Commit**

```bash
git add flake.nix
git rm core/os/modules/module-sets.nix
git commit -m "Replace module-sets.nix with single nixpi module + per-component enable options"
```

---

### Task 7: Decompose `flake.nix` — extract pkgs, checks, hosts

**Files:**
- Create: `nix/pkgs.nix`
- Create: `nix/checks.nix`
- Create: `nix/hosts.nix`
- Modify: `flake.nix`

- [ ] **Step 1: Create `nix/pkgs.nix`**

```nix
# nix/pkgs.nix — package definitions for all supported systems
{ self, nixpkgs, nixos-anywhere, disko }:
let
  supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
  mkPkgs = system: import nixpkgs { inherit system; };
  mkPackages = system:
    let
      pkgs = mkPkgs system;
      piAgent = pkgs.callPackage ../core/os/pkgs/pi { };
      appPackage = pkgs.callPackage ../core/os/pkgs/app { inherit piAgent; };
      nixpiBootstrapDefaultInput =
        if self ? rev then "github:alexradunet/nixpi/${self.rev}"
        else "github:alexradunet/nixpi";
    in {
      pi = piAgent;
      app = appPackage;
      nixpi-bootstrap-host = pkgs.callPackage ../core/os/pkgs/nixpi-bootstrap-host {
        nixpiDefaultInput = nixpiBootstrapDefaultInput;
      };
      nixpi-rebuild = pkgs.callPackage ../core/os/pkgs/nixpi-rebuild { };
      plain-host-deploy = pkgs.callPackage ../nixos_vps_provisioner/pkgs/plain-host-deploy {
        nixosAnywherePackage = nixos-anywhere.packages.${system}.nixos-anywhere;
      };
    };
in
nixpkgs.lib.genAttrs supportedSystems mkPackages
```

- [ ] **Step 2: Create `nix/hosts.nix`**

```nix
# nix/hosts.nix — NixOS system configurations
{ self, nixpkgs, nixpkgs-stable, disko }:
let
  system = "x86_64-linux";
  mkConfiguredSystem = { system, modules }:
    nixpkgs.lib.nixosSystem {
      inherit system;
      modules = modules ++ [{
        nixpkgs.hostPlatform = system;
        nixpkgs.config.allowUnfree = true;
      }];
    };
  mkConfiguredStableSystem = { system, modules }:
    nixpkgs-stable.lib.nixosSystem {
      inherit system;
      modules = modules ++ [{
        nixpkgs.hostPlatform = system;
        nixpkgs.config.allowUnfree = true;
      }];
    };
in {
  # Canonical NixPI headless VPS profile used for local builds and CI topology checks.
  vps = mkConfiguredSystem {
    inherit system;
    modules = [ ../core/os/hosts/vps.nix ];
  };

  ovh-vps-base = mkConfiguredStableSystem {
    inherit system;
    modules = [
      disko.nixosModules.disko
      ../nixos_vps_provisioner/presets/ovh-single-disk.nix
      ../nixos_vps_provisioner/presets/ovh-vps-base.nix
    ];
  };

  # Representative installed NixPI system used by checks.
  installed-test = mkConfiguredSystem {
    inherit system;
    modules = [
      self.nixosModules.nixpi
      {
        nixpi.primaryUser = "alex";
        networking.hostName = "nixos";
        system.stateVersion = "25.05";
        boot.loader = { systemd-boot.enable = true; efi.canTouchEfiVariables = true; };
        fileSystems."/" = { device = "/dev/vda"; fsType = "ext4"; };
        fileSystems."/boot" = { device = "/dev/vda1"; fsType = "vfat"; };
      }
    ];
  };
}
```

- [ ] **Step 3: Create `nix/checks.nix`**

```nix
# nix/checks.nix — flake check lanes
{ self, nixpkgs, pkgs, pkgsUnfree, lib }:
let
  system = "x86_64-linux";
  nixosTests = import ../tests/nixos { inherit pkgs lib self; pkgs = pkgsUnfree; };
  nixpiBootstrapDefaultInput =
    if self ? rev then "github:alexradunet/nixpi/${self.rev}"
    else "github:alexradunet/nixpi";
  bootstrapHostWrapperDefaultInputCheck =
    pkgs.runCommandLocal "bootstrap-host-wrapper-default-input-check" { } ''
      wrapper="${self.packages.${system}.nixpi-bootstrap-host}/bin/nixpi-bootstrap-host"
      test -f "$wrapper"
      grep -F 'NIXPI_DEFAULT_INPUT' "$wrapper" >/dev/null
      grep -F '${nixpiBootstrapDefaultInput}' "$wrapper" >/dev/null
      ! grep -F -- '-dirty' "$wrapper" >/dev/null
      ! grep -F 'path:/nix/store/' "$wrapper" >/dev/null
      touch "$out"
    '';
  nixpiBootstrapHostCheck = pkgs.linkFarm "nixpi-bootstrap-host-check" [
    { name = "wrapper-default-input"; path = bootstrapHostWrapperDefaultInputCheck; }
    { name = "vm"; path = nixosTests.nixpi-bootstrap-host; }
  ];
  generatedModuleSystem = nixpkgs.lib.nixosSystem {
    inherit system;
    modules = [
      self.nixosModules.nixpi
      {
        nixpi.primaryUser = "pi";
        networking.hostName = "generated-module-test";
        system.stateVersion = "25.05";
        boot.loader.systemd-boot.enable = true;
        boot.loader.efi.canTouchEfiVariables = true;
        fileSystems."/" = { device = "/dev/vda"; fsType = "ext4"; };
        fileSystems."/boot" = { device = "/dev/vda1"; fsType = "vfat"; };
        nixpkgs.hostPlatform = system;
        nixpkgs.config.allowUnfree = true;
      }
    ];
  };
  bootCheck = pkgsUnfree.testers.runNixOSTest {
    name = "boot";
    nodes.nixpi = { ... }: {
      imports = [ self.nixosModules.nixpi ];
      nixpi.primaryUser = "alex";
      networking.hostName = "nixos";
      system.stateVersion = "25.05";
      boot.loader.systemd-boot.enable = true;
      boot.loader.efi.canTouchEfiVariables = true;
      fileSystems."/" = { device = "/dev/vda"; fsType = "ext4"; };
      fileSystems."/boot" = { device = "/dev/vda1"; fsType = "vfat"; };
      virtualisation.diskSize = 20480;
      virtualisation.memorySize = 4096;
    };
    testScript = ''
      nixpi = machines[0]
      nixpi.start()
      nixpi.wait_for_unit("multi-user.target", timeout=300)
      nixpi.succeed("id alex")
      nixpi.succeed("systemctl is-active NetworkManager")
    '';
  };
  mkCheckLane = name: entries: pkgs.linkFarm name entries;
in
{
  exported-topology =
    assert builtins.hasAttr "aarch64-linux" self.packages;
    assert builtins.hasAttr "nixpi-app-setup" generatedModuleSystem.config.systemd.services;
    pkgs.runCommandLocal "exported-topology-check" { } ''touch "$out"'';

  config = self.nixosConfigurations.installed-test.config.system.build.toplevel;

  flake-topology = pkgs.runCommandLocal "flake-topology-check" { } ''
    ! grep -F 'desktop-vm' ${../flake.nix}
    ! test -e ${../.}/core/os/hosts/x86_64-vm.nix
    ! test -e ${../.}/tools/run-qemu.sh
    ! test -e ${../.}/core/os/hosts/rpi-common.nix
    ! test -e ${../.}/core/os/hosts/rpi4.nix
    ! test -e ${../.}/core/os/hosts/rpi5.nix
    touch "$out"
  '';

  vps-topology = pkgs.runCommandLocal "vps-topology-check" { } ''
    grep -F 'nixosConfigurations.vps' ${../nix/hosts.nix} >/dev/null
    ! grep -F 'nixosConfigurations.rpi4' ${../nix/hosts.nix} >/dev/null
    ! grep -F 'nixosConfigurations.rpi5' ${../nix/hosts.nix} >/dev/null
    grep -F '../core/os/hosts/vps.nix' ${../nix/hosts.nix} >/dev/null
    ! grep -F 'primaryUser = lib.mkDefault "human";' ${../core/os/hosts/vps.nix} >/dev/null
    grep -F 'headless VPS profile' ${../core/os/hosts/vps.nix} >/dev/null
    grep -F 'enableRedistributableFirmware' ${../core/os/hosts/vps.nix} >/dev/null
    touch "$out"
  '';

  vps-console-config = pkgs.runCommandLocal "vps-console-config-check" { } ''
    params='${lib.concatStringsSep " " self.nixosConfigurations.vps.config.boot.kernelParams}'
    printf '%s\n' "$params" | grep -Eq '(^| )console=tty0($| )'
    printf '%s\n' "$params" | grep -Eq '(^| )console=ttyS0,115200($| )'
    test '${
      if self.nixosConfigurations.vps.config.systemd.services."getty@tty1".enable then "true" else "false"
    }' = true
    touch "$out"
  '';

  boot = bootCheck;

  nixos-smoke = mkCheckLane "nixos-smoke" [
    { name = "nixpi-runtime"; path = nixosTests.nixpi-runtime; }
    { name = "nixpi-security"; path = nixosTests.nixpi-security; }
    { name = "nixpi-broker"; path = nixosTests.nixpi-broker; }
  ];

  nixos-full = mkCheckLane "nixos-full" [
    { name = "boot"; path = bootCheck; }
    { name = "nixpi-firstboot"; path = nixosTests.nixpi-firstboot; }
    { name = "nixpi-system-flake"; path = nixosTests.nixpi-system-flake; }
    { name = "nixpi-bootstrap-host"; path = nixosTests.nixpi-bootstrap-host; }
    { name = "nixpi-network"; path = nixosTests.nixpi-network; }
    { name = "nixpi-e2e"; path = nixosTests.nixpi-e2e; }
    { name = "nixpi-security"; path = nixosTests.nixpi-security; }
    { name = "nixpi-modular-services"; path = nixosTests.nixpi-modular-services; }
    { name = "nixpi-post-setup-lockdown"; path = nixosTests.nixpi-post-setup-lockdown; }
    { name = "nixpi-broker"; path = nixosTests.nixpi-broker; }
    { name = "nixpi-update"; path = nixosTests.nixpi-update; }
    { name = "nixpi-options-validation"; path = nixosTests.nixpi-options-validation; }
  ];

  nixos-destructive = mkCheckLane "nixos-destructive" [
    { name = "nixpi-post-setup-lockdown"; path = nixosTests.nixpi-post-setup-lockdown; }
    { name = "nixpi-broker"; path = nixosTests.nixpi-broker; }
  ];

  bootstrap-host-wrapper-default-input = bootstrapHostWrapperDefaultInputCheck;
}
// nixosTests
// { nixpi-bootstrap-host = nixpiBootstrapHostCheck; }
```

- [ ] **Step 4: Rewrite `flake.nix` to pure composition**

```nix
# flake.nix
{
  description = "NixPI — Pi-native AI companion OS on NixOS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-25.11";
    disko.url = "github:nix-community/disko";
    disko.inputs.nixpkgs.follows = "nixpkgs-stable";
    nixos-anywhere.url = "github:nix-community/nixos-anywhere";
    nixos-anywhere.inputs.nixpkgs.follows = "nixpkgs-stable";
  };

  outputs = { self, nixpkgs, nixpkgs-stable, disko, nixos-anywhere, ... }:
    let
      system = "x86_64-linux";
      inherit (nixpkgs) lib;
      supportedSystems = [ system "aarch64-linux" ];
      forAllSystems = lib.genAttrs supportedSystems;
      mkPkgs = system: import nixpkgs { inherit system; };
      pkgs = mkPkgs system;
      pkgsUnfree = import nixpkgs { inherit system; config.allowUnfree = true; };
    in {
      packages = import ./nix/pkgs.nix { inherit self nixpkgs nixos-anywhere disko; };

      nixosModules = {
        nixpi = { ... }: {
          imports = [
            ./core/os/modules/options.nix
            ./core/os/modules/network.nix
            ./core/os/modules/update.nix
            ./core/os/modules/app.nix
            ./core/os/modules/broker.nix
            ./core/os/modules/tooling.nix
            ./core/os/modules/shell.nix
          ];
        };
      };

      nixosConfigurations = import ./nix/hosts.nix {
        inherit self nixpkgs nixpkgs-stable disko;
      };

      checks.${system} = import ./nix/checks.nix {
        inherit self nixpkgs pkgs pkgsUnfree lib;
      };

      formatter = forAllSystems (system: (mkPkgs system).nixfmt-rfc-style);

      apps.${system} = {
        nixpi-bootstrap-host = {
          type = "app";
          program = "${self.packages.${system}.nixpi-bootstrap-host}/bin/nixpi-bootstrap-host";
        };
        plain-host-deploy = {
          type = "app";
          program = "${self.packages.${system}.plain-host-deploy}/bin/plain-host-deploy";
        };
      };

      devShells = forAllSystems (system:
        let pkgs = mkPkgs system; in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs typescript biome
              nixfmt-rfc-style statix shellcheck
              jq curl git just
            ];
            shellHook = ''
              echo "NixPI dev shell"
              echo "Run 'npm install' to set up JS dependencies (includes vitest)"
            '';
          };
        }
      );
    };
}
```

- [ ] **Step 5: Verify**

```bash
nix flake check --no-build 2>&1 | head -20
nix eval .#nixosConfigurations.vps.config.nixpi.primaryUser
```
Expected: no evaluation errors, `"pi"` (or whatever vps.nix sets)

- [ ] **Step 6: Commit**

```bash
mkdir -p nix
git add nix/pkgs.nix nix/checks.nix nix/hosts.nix flake.nix
git commit -m "Decompose flake.nix into nix/pkgs.nix, nix/checks.nix, nix/hosts.nix"
```

---

## Phase B — TypeScript Layer

### Task 8: Install `neverthrow` + add `ActionResult` helpers to `utils.ts`

**Files:**
- Modify: `package.json` (via npm)
- Modify: `core/lib/utils.ts`

- [ ] **Step 1: Install neverthrow**

```bash
npm install neverthrow
```

Verify it's in `package.json` dependencies.

- [ ] **Step 2: Add `ActionResult` type and helpers to `core/lib/utils.ts`**

Add at the top of `core/lib/utils.ts` (after existing imports):

```ts
import { err, ok, type Result } from "neverthrow";

/** Success payload for extension action functions. */
export type ActionOk = { text: string; details?: Record<string, unknown> };

/** Standard return type for all extension action functions. */
export type ActionResult = Result<ActionOk, string>;

/** Construct a successful ActionResult. */
export function okAction(text: string, details?: Record<string, unknown>): ActionResult {
	return ok({ text, details });
}

/** Construct a failed ActionResult. */
export function errAction(message: string): ActionResult {
	return err(message);
}

/**
 * Convert an ActionResult to the tool result shape expected by pi-coding-agent.
 * Use in execute() wrappers: `return toToolResult(action(params))`.
 */
export function toToolResult(result: ActionResult) {
	return result.match(
		(r) => textToolResult(r.text, r.details ?? {}),
		(e) => errorResult(e),
	);
}
```

- [ ] **Step 3: Run tests to confirm nothing broken yet**

```bash
npm test 2>&1 | tail -10
```
Expected: all tests pass (no migration yet, just additions)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json core/lib/utils.ts
git commit -m "Add neverthrow dependency and ActionResult helpers to utils.ts"
```

---

### Task 9: Remove `safePath` alias from `filesystem.ts`

**Files:**
- Modify: `core/lib/filesystem.ts`
- Modify: `core/pi/extensions/objects/actions.ts`
- Modify: `core/pi/extensions/objects/actions-query.ts`
- Modify: `core/pi/extensions/episodes/actions.ts`

- [ ] **Step 1: Delete `safePath` from `filesystem.ts`**

Remove the function:
```ts
/** @deprecated alias for safePathWithin — use safePathWithin directly */
export function safePath(root: string, ...segments: string[]): string {
	return safePathWithin(root, ...segments);
}
```

- [ ] **Step 2: Update all call sites**

In `core/pi/extensions/objects/actions.ts`, replace:
```ts
import { getNixPiDir, safePath } from "../../../lib/filesystem.js";
```
with:
```ts
import { getNixPiDir, safePathWithin } from "../../../lib/filesystem.js";
```

Then replace every call `safePath(...)` → `safePathWithin(...)` in that file.

In `core/pi/extensions/objects/actions-query.ts`, do the same import swap and replace all `safePath(...)` calls.

In `core/pi/extensions/episodes/actions.ts`, do the same.

- [ ] **Step 3: Verify no remaining references**

```bash
grep -r 'safePath' core/ --include='*.ts'
```
Expected: no output

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -10
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add core/lib/filesystem.ts core/pi/extensions/objects/actions.ts core/pi/extensions/objects/actions-query.ts core/pi/extensions/episodes/actions.ts
git commit -m "Remove safePath alias — use safePathWithin directly at all call sites"
```

---

### Task 10: Migrate `objects/actions.ts` to neverthrow

**Files:**
- Modify: `core/pi/extensions/objects/actions.ts`

The current pattern returns `errorResult(msg)` or `textToolResult(msg)` directly. After migration, functions return `ActionResult` and callers use `toToolResult()`.

- [ ] **Step 1: Update imports in `actions.ts`**

```ts
import { errAction, okAction, type ActionResult } from "../../../lib/utils.js";
// Remove: errorResult, textToolResult imports (keep truncate if used)
```

- [ ] **Step 2: Update helper `tryResolveObjectPath` to return `Result`**

```ts
import { err, ok, type Result } from "neverthrow";

function tryResolveObjectPath(
	slug: string,
	filePath: string | undefined,
	invalidMessage: string,
): Result<{ filepath: string }, string> {
	try {
		return ok({ filepath: resolveObjectPath(slug, filePath) });
	} catch {
		return err(invalidMessage);
	}
}
```

- [ ] **Step 3: Update `createObject` to return `ActionResult`**

```ts
export function createObject(params: ObjectWriteParams): ActionResult {
	const resolved = tryResolveObjectPath(params.slug, params.path, "Path traversal blocked: invalid path");
	if (resolved.isErr()) return resolved;
	const { filepath } = resolved.value;
	fs.mkdirSync(path.dirname(filepath), { recursive: true });
	const data = mergedAttributes(params);
	const body = params.body ?? defaultObjectBody(data);
	try {
		fs.writeFileSync(filepath, stringifyFrontmatter(data, body), { flag: "wx" });
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === "EEXIST") {
			return errAction(`object already exists: ${params.type}/${params.slug}`);
		}
		return errAction(`failed to create object: ${(err as Error).message}`);
	}
	return okAction(`created ${params.type}/${params.slug}`);
}
```

- [ ] **Step 4: Update `updateObject`, `upsertObject`, `readObject`, `linkObjects`** — same pattern

```ts
export function updateObject(params: ObjectWriteParams): ActionResult {
	const invalidMessage = params.path ? "Path traversal blocked: invalid path" : "Path traversal blocked: invalid slug";
	const resolved = tryResolveObjectPath(params.slug, params.path, invalidMessage);
	if (resolved.isErr()) return resolved;
	const { filepath } = resolved.value;
	const record = readMemoryRecord(filepath);
	if (!record) return errAction(`object not found: ${params.type}/${params.slug}`);
	const attributes = mergedAttributes(params, record.attributes);
	writeObjectRecord(filepath, attributes, params.body ?? record.body);
	return okAction(`updated ${params.type}/${params.slug}`);
}

export function upsertObject(params: ObjectWriteParams): ActionResult {
	const resolved = tryResolveObjectPath(params.slug, params.path, "Path traversal blocked: invalid path");
	if (resolved.isErr()) return resolved;
	const { filepath } = resolved.value;
	const existing = readMemoryRecord(filepath);
	if (!existing) return createObject(params);
	const attributes = mergedAttributes(params, existing.attributes);
	writeObjectRecord(filepath, attributes, params.body ?? existing.body);
	return okAction(`upserted ${params.type}/${params.slug}`, { existed: true });
}

export function readObject(params: { type: string; slug: string; path?: string }): ActionResult {
	const invalidMessage = params.path ? "Path traversal blocked: invalid path" : "Path traversal blocked: invalid slug";
	const resolved = tryResolveObjectPath(params.slug, params.path, invalidMessage);
	if (resolved.isErr()) return resolved;
	const { filepath } = resolved.value;
	if (!fs.existsSync(filepath)) return errAction(`object not found: ${params.type}/${params.slug}`);
	const raw = fs.readFileSync(filepath, "utf-8");
	return okAction(truncate(raw));
}

export function linkObjects(params: { ref_a: string; ref_b: string }): ActionResult {
	const a = parseRef(params.ref_a);
	const b = parseRef(params.ref_b);
	const resolvedA = tryResolveObjectPath(a.slug, undefined, "Path traversal blocked: invalid slug");
	const resolvedB = tryResolveObjectPath(b.slug, undefined, "Path traversal blocked: invalid slug");
	if (resolvedA.isErr() || resolvedB.isErr()) return errAction("Path traversal blocked: invalid slug");
	const pathA = resolvedA.value.filepath;
	const pathB = resolvedB.value.filepath;
	if (!fs.existsSync(pathA)) return errAction(`object not found: ${params.ref_a}`);
	if (!fs.existsSync(pathB)) return errAction(`object not found: ${params.ref_b}`);
	appendObjectLink(pathA, params.ref_b);
	appendObjectLink(pathB, params.ref_a);
	return okAction(`linked ${params.ref_a} <-> ${params.ref_b}`);
}
```

- [ ] **Step 5: Run tests**

```bash
npm test 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add core/pi/extensions/objects/actions.ts
git commit -m "Migrate objects/actions.ts to neverthrow ActionResult"
```

---

### Task 11: Migrate `objects/actions-query.ts` + `objects/index.ts` execute wrappers

**Files:**
- Modify: `core/pi/extensions/objects/actions-query.ts`
- Modify: `core/pi/extensions/objects/index.ts`

- [ ] **Step 1: Update `resolveObjectsDir` in `actions-query.ts`**

```ts
import { err, ok, type Result } from "neverthrow";
import { errAction, okAction, type ActionResult } from "../../../lib/utils.js";

function resolveObjectsDir(directory?: string): Result<{ dir: string }, string> {
	if (!directory) return ok({ dir: path.join(getNixPiDir(), "Objects") });
	try {
		return ok({ dir: safePathWithin(os.homedir(), directory) });
	} catch {
		return err("Path traversal blocked: invalid directory");
	}
}
```

- [ ] **Step 2: Update `listObjects`, `queryObjects`, `searchObjects` to return `ActionResult`**

Each currently returns `errorResult(...)` or `textToolResult(...)`. Replace with `errAction(...)` / `okAction(...)`. Wrap the full function body with `Result` propagation:

```ts
export function listObjects(params: ListParams, signal?: AbortSignal): ActionResult {
	const resolved = resolveObjectsDir(params.directory);
	if (resolved.isErr()) return resolved;
	// ... rest of logic unchanged, replace errorResult/textToolResult calls
	return okAction(text, { count: ... });
}
```

- [ ] **Step 3: Update `objects/index.ts` execute wrappers to use `toToolResult`**

```ts
import { toToolResult } from "../../../lib/utils.js";

// in each tool:
async execute(_toolCallId, params) {
  return toToolResult(createObject(params as MemoryCreateParams));
},
```

Apply to all 8 tools in index.ts.

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add core/pi/extensions/objects/actions-query.ts core/pi/extensions/objects/index.ts
git commit -m "Migrate objects/actions-query.ts to neverthrow; update execute wrappers"
```

---

### Task 12: Migrate `episodes/actions.ts` + `episodes/index.ts`

**Files:**
- Modify: `core/pi/extensions/episodes/actions.ts`
- Modify: `core/pi/extensions/episodes/index.ts`

- [ ] **Step 1: Update imports in `episodes/actions.ts`**

```ts
import { errAction, okAction, type ActionResult } from "../../../lib/utils.js";
// Remove: errorResult import
```

- [ ] **Step 2: Migrate `createEpisode`, `promoteEpisode`, `consolidateEpisodes`**

Each function that returns `errorResult(...)` / `textToolResult(...)` → `errAction(...)` / `okAction(...)`. Add `ActionResult` return type annotations.

For `promoteEpisode`:
```ts
export function promoteEpisode(params: ...): ActionResult {
  // ... logic
  if (!episodeRecord) return errAction(`episode not found: ${params.episode_id}`);
  // ... on success:
  return okAction(`promoted ${params.episode_id} → ${params.target.type}/${params.target.slug}`, { ... });
}
```

- [ ] **Step 3: Update `episodes/index.ts` execute wrappers**

The `episode_create` tool has combined logic (create then optionally promote). Update to:

```ts
async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const typedParams = params as EpisodeCreateParams;
  const episodeResult = createEpisode(typedParams);
  if (episodeResult.isErr() || !typedParams.promote_to) {
    return toToolResult(episodeResult);
  }
  const promotion = promoteEpisode({
    episode_id: String((episodeResult.value.details as { id: string }).id),
    target: typedParams.promote_to,
    mode: "upsert",
    projectName: projectNameFromCtx(ctx),
  });
  if (promotion.isErr()) return toToolResult(promotion);
  return textToolResult(
    `${episodeResult.value.text}\n${promotion.value.text}`,
    { ...episodeResult.value.details, promotion: promotion.value.details },
  );
},
```

Apply `toToolResult(...)` to the other three tools.

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add core/pi/extensions/episodes/actions.ts core/pi/extensions/episodes/index.ts
git commit -m "Migrate episodes to neverthrow ActionResult"
```

---

### Task 13: Migrate `os` extension to neverthrow

**Files:**
- Modify: `core/pi/extensions/os/actions.ts`
- Modify: `core/pi/extensions/os/actions-health.ts`
- Modify: `core/pi/extensions/os/actions-proposal.ts`
- Modify: `core/pi/extensions/os/index.ts`

- [ ] **Step 1: Migrate `os/actions.ts`**

Functions that currently call `errorResult`/`textToolResult` → `errAction`/`okAction`. Add `ActionResult` return types. For async functions that use `run()`, return `ResultAsync` from neverthrow:

```ts
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { errAction, okAction, type ActionResult } from "../../../lib/utils.js";

export async function handleNixosUpdate(action: string, signal?: AbortSignal, ctx?: unknown): Promise<ActionResult> {
  // ... existing logic, replace return textToolResult(...) with return okAction(...)
  // replace return errorResult(...) with return errAction(...)
}
```

- [ ] **Step 2: Migrate `os/actions-health.ts`**

`handleSystemHealth` is async and returns text. Change return type to `Promise<ActionResult>`:

```ts
export async function handleSystemHealth(signal?: AbortSignal): Promise<ActionResult> {
  // ... existing logic unchanged
  return okAction(truncate(sections.join("\n\n")));
}
```

- [ ] **Step 3: Migrate `os/actions-proposal.ts`**

Same pattern — `Promise<ActionResult>` return type, swap `textToolResult`/`errorResult`.

- [ ] **Step 4: Update `os/index.ts` execute wrappers**

```ts
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  const p = params as Static<typeof NixosUpdateParams>;
  return toToolResult(await handleNixosUpdate(p.action, signal, ctx));
},
```

Apply `toToolResult(await ...)` to all 6 tools.

- [ ] **Step 5: Run tests**

```bash
npm test 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add core/pi/extensions/os/actions.ts core/pi/extensions/os/actions-health.ts core/pi/extensions/os/actions-proposal.ts core/pi/extensions/os/index.ts
git commit -m "Migrate os extension to neverthrow ActionResult"
```

---

### Task 14: Update `AGENTS.md` with actions split rule

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add actions split rule to AGENTS.md**

Under the "Coding Style & Naming Conventions" section, add:

```markdown
## Extension Actions Split Rule

Split an extension's actions into multiple files when a domain concern is
**independently testable and distinct in responsibility**. Document the split
with a single-line comment at the top of each file.

Compliant example:
- `os/actions.ts` — NixOS lifecycle and systemd control
- `os/actions-health.ts` — system health checks
- `os/actions-proposal.ts` — local Nix config proposal workflow

Extensions with a single coherent domain keep all actions in one `actions.ts`.
Do not split to match the os pattern unless there is a genuine testability reason.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "Document extension actions split rule in AGENTS.md"
```

---

## Phase C — Shell, Tests, Docs

### Task 15: Split `nixpi-bootstrap-host.sh` into lib/ phases

**Files:**
- Modify: `core/scripts/nixpi-bootstrap-host.sh` (reduce to orchestrator)
- Create: `core/scripts/lib/bootstrap-utils.sh`
- Create: `core/scripts/lib/bootstrap-files.sh`
- Create: `core/scripts/lib/bootstrap-keys.sh`
- Create: `core/scripts/lib/bootstrap-validation.sh`

- [ ] **Step 1: Create `core/scripts/lib/bootstrap-utils.sh`**

```bash
#!/usr/bin/env bash
# bootstrap-utils.sh — shared logging and string utilities
set -euo pipefail

log() {
	printf '%s\n' "$*" >&2
}

escape_nix_string() {
	local value="${1-}"
	value="${value//\\/\\\\}"
	value="${value//\"/\\\"}"
	value="${value//$'\n'/\\n}"
	value="${value//$'\r'/\\r}"
	value="${value//\$\{/\\\$\{}"
	printf '%s' "$value"
}

usage() {
	cat <<'EOF_USAGE'
Usage: nixpi-bootstrap-host --primary-user USER --ssh-allowed-cidr CIDR [--ssh-allowed-cidr CIDR ...]
  [--hostname HOSTNAME] [--timezone TZ] [--keyboard LAYOUT] [--nixpi-input FLAKE_REF]
  [--authorized-key KEY | --authorized-key-file PATH] [--force]

Bootstrap NixPI onto an already-installed NixOS host by writing /etc/nixos helper files.
EOF_USAGE
}
```

- [ ] **Step 2: Create `core/scripts/lib/bootstrap-keys.sh`**

```bash
#!/usr/bin/env bash
# bootstrap-keys.sh — SSH authorised key loading
set -euo pipefail

read_authorized_keys_file() {
	local source_file="$1"
	local -n _keys_ref="$2"
	local line=""
	while IFS= read -r line || [[ -n "$line" ]]; do
		if [[ "$line" =~ ^(ssh|ecdsa|sk)-[^[:space:]]+[[:space:]]+.+$ ]]; then
			_keys_ref+=("$line")
		fi
	done <"$source_file"
}

load_authorized_keys() {
	local authorized_key="$1"
	local authorized_key_file="$2"
	local -n _keys_out="$3"
	_keys_out=()

	if [[ -n "$authorized_key" && -n "$authorized_key_file" ]]; then
		log "Use either --authorized-key or --authorized-key-file, not both."
		exit 1
	fi
	if [[ -n "$authorized_key" ]]; then
		_keys_out+=("$authorized_key")
		return 0
	fi
	if [[ -n "$authorized_key_file" ]]; then
		if [[ ! -f "$authorized_key_file" ]]; then
			log "--authorized-key-file must point to an existing file."
			exit 1
		fi
		read_authorized_keys_file "$authorized_key_file" _keys_out
		return 0
	fi
	if [[ -f /root/.ssh/authorized_keys ]]; then
		read_authorized_keys_file /root/.ssh/authorized_keys _keys_out
	fi
}
```

- [ ] **Step 3: Create `core/scripts/lib/bootstrap-validation.sh`**

```bash
#!/usr/bin/env bash
# bootstrap-validation.sh — pre-flight checks
set -euo pipefail

require_writable_helper_path() {
	local output_path="$1"
	local force_overwrite="$2"
	if [[ "$force_overwrite" == "true" || ! -e "$output_path" ]]; then
		return 0
	fi
	log "Refusing to overwrite existing ${output_path}."
	log "Review the file and rerun with --force if you want nixpi-bootstrap-host to replace it."
	return 1
}

ensure_host_tree_prerequisites() {
	local etc_nixos_dir="$1"
	if [[ ! -f "${etc_nixos_dir}/hardware-configuration.nix" ]]; then
		log "hardware-configuration.nix is required at ${etc_nixos_dir}/hardware-configuration.nix."
		log "Generate it first with nixos-generate-config --dir ${etc_nixos_dir}."
		exit 1
	fi
	if [[ ! -f "${etc_nixos_dir}/configuration.nix" ]]; then
		write_generated_configuration "${etc_nixos_dir}/configuration.nix"
	fi
}

print_manual_integration_instructions() {
	local nixpi_input_escaped="$1"
	cat <<EOF_MANUAL
Manual integration required: /etc/nixos/flake.nix already exists.

1. Add the NixPI input:
   inputs.nixpi.url = "${nixpi_input_escaped}";
   inputs.nixpi.inputs.nixpkgs.follows = "nixpkgs";

2. Ensure your nixosSystem passes the NixPI input:
   specialArgs = { inherit nixpi; };

3. Add the generated helper module to your host's modules list:
   ./nixpi-integration.nix

4. Rebuild manually:
   sudo nixos-rebuild switch --flake /etc/nixos#nixos --impure
EOF_MANUAL
}
```

- [ ] **Step 4: Create `core/scripts/lib/bootstrap-files.sh`**

```bash
#!/usr/bin/env bash
# bootstrap-files.sh — Nix file writers
set -euo pipefail

write_host_module() {
	local output_path="$1"
	local hostname="$2"
	local primary_user="$3"
	local timezone="$4"
	local keyboard="$5"
	local nixpi_input="$6"
	shift 6
	local -a authorized_keys=("$@")

	local hostname_escaped primary_user_escaped timezone_escaped keyboard_escaped
	hostname_escaped="$(escape_nix_string "$hostname")"
	primary_user_escaped="$(escape_nix_string "$primary_user")"
	timezone_escaped="$(escape_nix_string "$timezone")"
	keyboard_escaped="$(escape_nix_string "$keyboard")"

	local authorized_keys_block="" ssh_allowed_cidrs_block=""
	# NOTE: ssh_allowed_cidrs is a global set in main — accessed directly
	if [[ "${#authorized_keys[@]}" -gt 0 ]]; then
		authorized_keys_block=$'\n'"  users.users.${primary_user}.openssh.authorizedKeys.keys = ["
		for key in "${authorized_keys[@]}"; do
			authorized_keys_block+=$'\n'"    \"$(escape_nix_string "$key")\""
		done
		authorized_keys_block+=$'\n'"  ];"
	fi

	ssh_allowed_cidrs_block=$'\n'"  nixpi.security.ssh.allowedSourceCIDRs = ["
	for cidr in "${ssh_allowed_cidrs[@]}"; do
		ssh_allowed_cidrs_block+=$'\n'"    \"$(escape_nix_string "$cidr")\""
	done
	ssh_allowed_cidrs_block+=$'\n'"  ];"

	cat >"$output_path" <<EOF_HOST
{ ... }:
{
  networking.hostName = "${hostname_escaped}";
  nixpi.bootstrap.enable = true;
  nixpi.primaryUser = "${primary_user_escaped}";
  nixpi.timezone = "${timezone_escaped}";
  nixpi.keyboard = "${keyboard_escaped}";
${ssh_allowed_cidrs_block}
${authorized_keys_block}
}
EOF_HOST
}

write_integration_module() {
	local output_path="$1"
	cat >"$output_path" <<'EOF_INTEGRATION'
{ nixpi, ... }:
{
  imports = [
    nixpi.nixosModules.nixpi
    ./nixpi-host.nix
  ];
}
EOF_INTEGRATION
}

write_generated_configuration() {
	local output_path="$1"
	cat >"$output_path" <<'EOF_CONFIG'
{ lib, modulesPath, ... }:
{
  imports = [ (modulesPath + "/profiles/qemu-guest.nix") ];
  system.stateVersion = "25.05";
  nix.settings.experimental-features = [ "nix-command" "flakes" ];
  networking.firewall.allowedTCPPorts = [ 22 ];
  boot.loader = {
    systemd-boot.enable = lib.mkForce false;
    efi.canTouchEfiVariables = lib.mkForce false;
    grub = { enable = true; efiSupport = true; efiInstallAsRemovable = true; device = "nodev"; };
  };
  services.qemuGuest.enable = lib.mkDefault true;
}
EOF_CONFIG
}

write_generated_flake() {
	local output_path="$1"
	local nixpi_input_escaped="$2"
	cat >"$output_path" <<EOF_FLAKE
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  inputs.nixpi.url = "${nixpi_input_escaped}";
  inputs.nixpi.inputs.nixpkgs.follows = "nixpkgs";

  outputs = { nixpkgs, nixpi, ... }: {
    nixosConfigurations.nixos = nixpkgs.lib.nixosSystem {
      system = builtins.currentSystem;
      specialArgs = { inherit nixpi; };
      modules = [
        ./configuration.nix
        ./nixpi-integration.nix
        ./hardware-configuration.nix
      ];
    };
  };
}
EOF_FLAKE
}
```

- [ ] **Step 5: Rewrite `nixpi-bootstrap-host.sh` as orchestrator**

```bash
#!/usr/bin/env bash
# nixpi-bootstrap-host — orchestrator
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/bootstrap-utils.sh"
source "$SCRIPT_DIR/lib/bootstrap-keys.sh"
source "$SCRIPT_DIR/lib/bootstrap-validation.sh"
source "$SCRIPT_DIR/lib/bootstrap-files.sh"

main() {
	local etc_nixos_dir="${NIXPI_BOOTSTRAP_ROOT:-/etc/nixos}"
	local nixos_rebuild_bin="${NIXPI_NIXOS_REBUILD:-nixos-rebuild}"
	local primary_user="" hostname="nixos" timezone="UTC" keyboard="us"
	local nixpi_input="${NIXPI_DEFAULT_INPUT:-github:alexradunet/nixpi}"
	local authorized_key="" authorized_key_file="" force_overwrite="false"
	# ssh_allowed_cidrs is NOT local: bootstrap-files.sh write_host_module reads it directly.
	ssh_allowed_cidrs=()
	local -a authorized_keys=()

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--primary-user)  primary_user="${2:?missing primary user}"; shift 2 ;;
			--hostname)      hostname="${2:?missing hostname}"; shift 2 ;;
			--timezone)      timezone="${2:?missing timezone}"; shift 2 ;;
			--keyboard)      keyboard="${2:?missing keyboard layout}"; shift 2 ;;
			--nixpi-input)   nixpi_input="${2:?missing nixpi input}"; shift 2 ;;
			--authorized-key)      authorized_key="${2:?missing authorized key}"; shift 2 ;;
			--authorized-key-file) authorized_key_file="${2:?missing authorized key file}"; shift 2 ;;
			--ssh-allowed-cidr)    ssh_allowed_cidrs+=("${2:?missing SSH allowed CIDR}"); shift 2 ;;
			--force)         force_overwrite="true"; shift ;;
			--help|-h)       usage; exit 0 ;;
			*)               usage >&2; exit 1 ;;
		esac
	done

	[[ -n "$primary_user" ]] || { usage >&2; exit 1; }
	[[ "${#ssh_allowed_cidrs[@]}" -gt 0 ]] || { log "At least one --ssh-allowed-cidr value is required."; exit 1; }

	if [[ "$etc_nixos_dir" != "/etc/nixos" && "$nixos_rebuild_bin" == "nixos-rebuild" ]]; then
		log "NIXPI_BOOTSTRAP_ROOT is for tests/staging only. Unset for a real host bootstrap."
		exit 1
	fi

	mkdir -p "$etc_nixos_dir"

	if [[ "$force_overwrite" == "true" ]]; then
		rm -f "${etc_nixos_dir}/flake.nix" "${etc_nixos_dir}/flake.lock" \
			"${etc_nixos_dir}/nixpi-host.nix" "${etc_nixos_dir}/nixpi-integration.nix"
	fi

	load_authorized_keys "$authorized_key" "$authorized_key_file" authorized_keys
	ensure_host_tree_prerequisites "$etc_nixos_dir"

	require_writable_helper_path "${etc_nixos_dir}/nixpi-host.nix" "$force_overwrite"
	require_writable_helper_path "${etc_nixos_dir}/nixpi-integration.nix" "$force_overwrite"

	write_host_module "${etc_nixos_dir}/nixpi-host.nix" \
		"$hostname" "$primary_user" "$timezone" "$keyboard" "$nixpi_input" \
		"${authorized_keys[@]+"${authorized_keys[@]}"}"
	write_integration_module "${etc_nixos_dir}/nixpi-integration.nix"

	if [[ -f "${etc_nixos_dir}/flake.nix" ]]; then
		print_manual_integration_instructions "$(escape_nix_string "$nixpi_input")"
		return 0
	fi

	write_generated_flake "${etc_nixos_dir}/flake.nix" "$(escape_nix_string "$nixpi_input")"
	exec "$nixos_rebuild_bin" switch --flake /etc/nixos#nixos --impure
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	main "$@"
fi
```

- [ ] **Step 6: Verify with shellcheck**

```bash
shellcheck core/scripts/nixpi-bootstrap-host.sh core/scripts/lib/*.sh
```
Expected: no errors

- [ ] **Step 7: Run integration tests**

```bash
npm test -- tests/integration/nixpi-bootstrap-host.test.ts 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 8: Commit**

```bash
mkdir -p core/scripts/lib
git add core/scripts/nixpi-bootstrap-host.sh core/scripts/lib/
git commit -m "Split nixpi-bootstrap-host.sh into lib/ phases (orchestrator + 4 libs)"
```

---

### Task 16: Consolidate test files + remove stale assertions

**Files:**
- Modify: `tests/extensions/persona.test.ts` (merge any standalone guardrail test file into it)
- Modify: various test files — remove assertions for removed features

- [ ] **Step 1: Find and remove stale absence assertions**

```bash
grep -r 'NetBird\|nixpi-deploy-ovh\|install-finalize\|nixpiBaseNoShell\|nixpiBase\|module-sets' tests/ --include='*.ts' -l
```

For each file found, remove the assertions that reference these removed features. Replace with a brief comment: `// removed feature — no test needed`.

- [ ] **Step 2: Find standalone guardrail test file**

```bash
ls tests/extensions/
```

If there is a `guardrails.test.ts` or similar alongside `persona.test.ts`, merge its tests into `persona.test.ts` under a `describe("tool_call guardrails", ...)` block and delete the standalone file.

- [ ] **Step 3: Run tests to confirm nothing broken**

```bash
npm test 2>&1 | tail -20
```
Expected: all pass (or fewer tests due to removed stale assertions)

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "Remove stale absence assertions; consolidate guardrail tests into persona.test.ts"
```

---

### Task 17: Add `neverthrow` boundary tests to extension test files

**Files:**
- Modify: `tests/extensions/objects.test.ts`
- Modify: `tests/extensions/episodes.test.ts`
- Modify: `tests/extensions/os.test.ts`

For each extension, add at least one `isErr()` test for the primary failure path of each action.

- [ ] **Step 1: Add failure path tests to `objects.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createObject, readObject, updateObject, linkObjects } from "../../core/pi/extensions/objects/actions.js";

describe("objects actions — error paths", () => {
  it("createObject returns Err when object already exists", () => {
    // create once
    const first = createObject({ type: "note", slug: "dup-test" });
    expect(first.isOk()).toBe(true);
    // create again
    const second = createObject({ type: "note", slug: "dup-test" });
    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr()).toContain("already exists");
  });

  it("readObject returns Err when object not found", () => {
    const result = readObject({ type: "note", slug: "does-not-exist-xyz" });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("not found");
  });

  it("updateObject returns Err when object not found", () => {
    const result = updateObject({ type: "note", slug: "does-not-exist-xyz" });
    expect(result.isErr()).toBe(true);
  });

  it("linkObjects returns Err when ref_a not found", () => {
    const result = linkObjects({ ref_a: "note/not-found-xyz", ref_b: "note/also-not-found" });
    expect(result.isErr()).toBe(true);
  });
});
```

- [ ] **Step 2: Add failure path tests to `episodes.test.ts`**

```ts
describe("episodes actions — error paths", () => {
  it("promoteEpisode returns Err for unknown episode id", () => {
    const result = promoteEpisode({
      episode_id: "9999-01-01T00-00-00Z-nonexistent",
      target: { type: "fact", slug: "test" },
      mode: "upsert",
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("not found");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test 2>&1 | tail -20
```
Expected: all pass including new tests

- [ ] **Step 4: Commit**

```bash
git add tests/extensions/objects.test.ts tests/extensions/episodes.test.ts tests/extensions/os.test.ts
git commit -m "Add neverthrow boundary (isErr) tests for extension action failure paths"
```

---

### Task 18: Docs stale reference cleanup

**Files:**
- Modify: any docs file containing stale references

- [ ] **Step 1: Find stale references**

```bash
grep -r 'NetBird\|nixpi-deploy-ovh\|install-finalize\|nixpiBaseNoShell\|nixpiBase\|module-sets\.nix\|nixpi-no-shell\|nixpi-base-no-shell' docs/ --include='*.md' -l
```

- [ ] **Step 2: For each file found, remove or update the stale content**

Remove lines that reference removed features. If a whole section is about a removed feature, delete the section. If a reference is incidental (e.g. "previously we used..."), remove it — no shim comments.

- [ ] **Step 3: Verify docs build**

```bash
npm run docs:dev &
sleep 3
kill %1
```
Expected: no build errors printed before kill

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "Remove stale doc references to removed features"
```

---

## Verification

After all tasks complete, run the full check suite:

```bash
npm run build
npm test
npm run check
nix flake check --no-build
shellcheck core/scripts/nixpi-bootstrap-host.sh core/scripts/lib/*.sh
```

All must pass before marking this plan complete.
