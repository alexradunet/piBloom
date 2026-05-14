{
  inputs,
  lib,
  pkgs,
  vm,
  ...
}:
let
  repoInputName =
    {
      minecraft = "minecraft";
      dav-server = "dav-server";
    }
    .${vm.hostname} or vm.hostname;
  repoName =
    {
      minecraft = "minecraft";
      dav-server = "dav-server";
    }
    .${vm.hostname} or vm.hostname;
  serviceModuleName =
    {
      minecraft = "minecraft-service";
      dav-server = "dav-server";
    }
    .${vm.hostname} or vm.hostname;
  repoRoot = "/home/alex/${repoName}";
  switchApp = "switch-${vm.hostname}";
  serviceName = vm.service or vm.hostname;
  dnsName = vm.dns or "";
  dnsAliases = vm.aliases or [ ];
  dnsNames = lib.filter (name: name != "") ([ dnsName ] ++ dnsAliases);
  dnsAliasesText = if dnsAliases == [ ] then "" else lib.concatStringsSep ", " dnsAliases;
  dnsNamesText = if dnsNames == [ ] then "" else lib.concatStringsSep ", " dnsNames;
  includeCommonAgent = true;
  selfFlakeRoot = "/etc/nazar/self";
  selfSwitchFlake = "${selfFlakeRoot}#${vm.hostname}";
  fallbackUpdateCommand = "nix flake lock --update-input ${repoInputName}";
  context = {
    host = "nazar";
    orchestratorRepo = "/root/nazar";
    orchestrator = "Nazar host";
    vm = {
      hostname = vm.hostname;
      service = serviceName;
      ip = vm.ip;
      dns = dnsName;
      dnsAliases = dnsAliases;
      dnsNames = dnsNames;
    };
    serviceRepo = {
      name = repoName;
      root = repoRoot;
      flakeInput = repoInputName;
      nixosModule = serviceModuleName;
    };
    localSwitch = {
      authority = vm.hostname;
      flake = selfSwitchFlake;
      command = "sudo nixos-rebuild switch --flake ${selfSwitchFlake}";
      helper = "nazar-vm-switch";
    };
    productionSwitch = {
      authority = vm.hostname;
      app = switchApp;
      updateLockCommand = fallbackUpdateCommand;
      switchCommand = "nix run .#${switchApp}";
      fallbackAuthority = "nazar";
    };
    policy = {
      vmLocalRebuild = true;
      vmMayPushServiceRepo = true;
      vmHasBroadFleetDeployCredentials = false;
      nazarOwnsInfrastructureAndNetworking = true;
    };
  };
  contextJson = pkgs.writeText "nazar-vm-context.json" (builtins.toJSON context);
  contextMarkdown = pkgs.writeText "nazar-vm-context.md" ''
    # Nazar VM Context

    This machine is a NixOS VM in the Nazar fleet.

    | Item | Value |
    |---|---|
    | VM hostname | `${vm.hostname}` |
    | Service | `${serviceName}` |
    | NAT IP | `${vm.ip}` |
    | Service DNS | `${dnsName}` |
    | Service DNS aliases | `${dnsAliasesText}` |
    | All service DNS names | `${dnsNamesText}` |
    | VM-owned repo | `${repoRoot}` |
    | Nazar flake input | `${repoInputName}` |
    | VM-local rebuild flake | `${selfSwitchFlake}` |
    | Nazar fallback switch app | `.#${switchApp}` |

    ## Canonical workflow for agents and humans on this VM

    This VM-owned repository exports the service module for this whole NixOS VM.
    The VM is allowed to rebuild and activate itself. Nazar still owns the
    infrastructure boundary: host lifecycle, VMID/IP/MAC sizing, NAT/forwarding,
    public exposure, and shared network policy.

    Author, test, commit, push, and switch this VM:

    ```bash
    cd ${repoRoot}
    nix flake check --no-build
    git status
    git add <files>
    git commit
    git push
    nazar-vm-switch
    # equivalent raw command:
    sudo nixos-rebuild switch --flake ${selfSwitchFlake}
    ```

    `/etc/nazar/self` is a generated VM-local integration flake. It composes the
    current Nazar VM baseline with the local checkout at `${repoRoot}`, so agents
    can evolve this VM without asking an agent on Nazar to switch every service edit.

    Nazar remains a fallback switch authority and can still apply the pushed
    service commit from the orchestrator repository:

    ```bash
    cd /root/nazar
    ${fallbackUpdateCommand}
    nix flake check --no-build
    nix run .#${switchApp}
    ```

    Do not make host lifecycle, VMID/IP/MAC, public firewall,
    or NAT forwarding changes from this VM repo. Those still belong to Nazar's
    infrastructure repository.
  '';
  agentsMarkdown = pkgs.writeText "nazar-vm-agents.md" ''
    # Nazar VM Agent Instructions

    You are running inside a Nazar NixOS VM, not on the host.

    Read `/etc/nazar/vm-context.md` or run `nazar-vm-context` for the current VM
    identity, repository, and switch commands.

    Critical rules:

    - The VM-owned repo at `${repoRoot}` is editable from this VM.
    - The repo is available as a virtiofs mount from the host; no SSH is needed for Git.
    - You may rebuild this VM locally with `nazar-vm-switch`, equivalent to
      `sudo nixos-rebuild switch --flake ${selfSwitchFlake}`.
    - Commit and push durable service changes from `${repoRoot}` so Nazar's
      fallback switch path can reproduce them.
    - Nazar owns infrastructure and networking: host VM lifecycle, VMID/IP/MAC,
      sizing, NAT/forwarding, public exposure, and shared network policy.
    - Do not create public exposure, firewall, VMID/IP/MAC, or host
      lifecycle changes from a VM repo. Those belong to `/root/nazar`.

    Helpful commands:

    ```bash
    nazar-vm-context
    nazar-vm-switch
    nazar-switch-request
    nazar-vm-repo-bootstrap
    ```
  '';
  contextCommand = pkgs.writeShellScriptBin "nazar-vm-context" ''
    set -eu

    format=markdown
    if [ "''${1:-}" = "--format" ]; then
      format="''${2:-markdown}"
      shift 2 || true
    elif [ "''${1:-}" = "--help" ] || [ "''${1:-}" = "-h" ]; then
      cat <<'EOF'
    Usage: nazar-vm-context [--format markdown|json]

    Print the declarative Nazar fleet context for this VM.
    EOF
      exit 0
    elif [ "''${1:-}" != "" ]; then
      echo "nazar-vm-context: unknown argument: $1" >&2
      exit 2
    fi

    case "$format" in
      markdown) cat /etc/nazar/vm-context.md ;;
      json) cat /etc/nazar/vm-context.json ;;
      *)
        echo "nazar-vm-context: --format must be markdown or json" >&2
        exit 2
        ;;
    esac
  '';
  selfSwitchCommand = pkgs.writeShellScriptBin "nazar-vm-switch" ''
    set -euo pipefail

    repo_root=${lib.escapeShellArg repoRoot}
    host=${lib.escapeShellArg vm.hostname}
    self_flake=${lib.escapeShellArg selfSwitchFlake}

    if [ ! -d "$repo_root/.git" ]; then
      echo "No git checkout found at $repo_root." >&2
      echo "Run: nazar-vm-repo-bootstrap" >&2
      exit 1
    fi

    cd "$repo_root"

    if [ -n "$(git status --porcelain)" ]; then
      echo "warning: $repo_root has uncommitted changes; nix will build the current working tree snapshot." >&2
    fi

    echo "Rebuilding $host from VM-local integration flake: $self_flake"
    if [ "$(id -u)" -eq 0 ]; then
      exec nixos-rebuild switch --flake "$self_flake" "$@"
    else
      exec sudo nixos-rebuild switch --flake "$self_flake" "$@"
    fi
  '';
  switchRequestCommand = pkgs.writeShellScriptBin "nazar-switch-request" ''
    set -eu

    repo_root=${lib.escapeShellArg repoRoot}
    repo_input=${lib.escapeShellArg repoInputName}
    switch_app=${lib.escapeShellArg switchApp}
    self_flake=${lib.escapeShellArg selfSwitchFlake}
    fallback_update_command=${lib.escapeShellArg fallbackUpdateCommand}

    if [ ! -d "$repo_root/.git" ]; then
      echo "No git checkout found at $repo_root." >&2
      echo "Run: nazar-vm-repo-bootstrap" >&2
      exit 1
    fi

    cd "$repo_root"

    branch=$(git branch --show-current 2>/dev/null || true)
    head=$(git rev-parse --short HEAD)
    upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
    dirty=$(git status --porcelain)

    echo "VM repo:     $repo_root"
    echo "Branch:      ''${branch:-detached}"
    echo "HEAD:        $head"
    echo "Upstream:    ''${upstream:-none}"
    echo

    if [ -n "$dirty" ]; then
      echo "Working tree has uncommitted changes:"
      git status --short
      echo
    fi

    if [ -n "$upstream" ]; then
      counts=$(git rev-list --left-right --count "$upstream...HEAD" 2>/dev/null || echo "? ?")
      behind=$(printf '%s' "$counts" | awk '{print $1}')
      ahead=$(printf '%s' "$counts" | awk '{print $2}')
      echo "Ahead/behind upstream: ahead=$ahead behind=$behind"
      if [ "$ahead" != "0" ] && [ "$ahead" != "?" ]; then
        echo "Push when ready: git push"
        echo
      fi
    else
      echo "No upstream configured. Run nazar-vm-repo-bootstrap or set an origin/main upstream."
      echo
    fi

    cat <<EOF
    VM-local switch path:

      cd $repo_root
      nazar-vm-switch
      # or: sudo nixos-rebuild switch --flake $self_flake

    Nazar fallback switch path after the desired commit is pushed:

      cd /root/nazar
      $fallback_update_command
      nix flake check --no-build
      nix run .#$switch_app

    EOF
  '';
  selfFlake = pkgs.writeText "nazar-vm-self-flake.nix" ''
    {
      description = "VM-local self-rebuild flake for ${vm.hostname} in the Nazar fleet";

      inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

        disko = {
          url = "github:nix-community/disko";
          inputs.nixpkgs.follows = "nixpkgs";
        };

        microvm = {
          url = "github:astro/microvm.nix";
          inputs.nixpkgs.follows = "nixpkgs";
        };

        llm-agents.url = "github:numtide/llm-agents.nix";

        ${lib.optionalString (vm.hostname != "git") ''
          "${repoInputName}" = {
            url = "path:${repoRoot}";
            inputs.nixpkgs.follows = "nixpkgs";
          };
        ''}
      };

      outputs =
        inputs@{
          self,
          nixpkgs,
          disko,
          ...
        }:
        let
          system = "x86_64-linux";
          fleet = import ./nix/fleet/vms.nix;
          vm = fleet.vms."${vm.hostname}";
          commonVmModules = [
            ./nix/modules/common/base.nix
            ./nix/modules/common/users.nix
            ./nix/modules/common/security.nix
            ./nix/modules/common/development.nix
            ./nix/modules/common/nazar-context.nix
          ];
          agentVmModules = [ ./nix/modules/common/pi-agent.nix ];
          microvmGuestModules = [
            inputs.microvm.nixosModules.microvm
            ./nix/modules/host/microvm-guest.nix
          ];
          serviceModules =
            if "${serviceModuleName}" == "dav-server" then
              [ ./nix/modules/services/dav-server.nix ]
            else
              [ inputs."${repoInputName}".nixosModules."${serviceModuleName}" ];
        in
        {
          nixosConfigurations."${vm.hostname}" = nixpkgs.lib.nixosSystem {
            inherit system;
            specialArgs = {
              inherit inputs fleet vm;
            };
            modules =
              [
                disko.nixosModules.disko
              ]
              ++ commonVmModules
              ++ microvmGuestModules
              ++ nixpkgs.lib.optionals ${if includeCommonAgent then "true" else "false"} agentVmModules
              ++ serviceModules;
          };
        };
    }
  '';
  selfFlakeSource = pkgs.runCommand "nazar-vm-self-flake-source-${vm.hostname}" { } ''
    set -eu
    mkdir -p "$out/nix/modules/common" "$out/nix/modules/services" "$out/nix/fleet" "$out/nix/users" "$out/nix/packages/pi"
    cp ${selfFlake} "$out/flake.nix"
    cp ${../../../flake.lock} "$out/flake.lock"
    cp ${../../fleet/vms.nix} "$out/nix/fleet/vms.nix"
    cp ${../../users/admin-keys.nix} "$out/nix/users/admin-keys.nix"
    cp ${./base.nix} "$out/nix/modules/common/base.nix"
    cp ${./users.nix} "$out/nix/modules/common/users.nix"
    cp ${./security.nix} "$out/nix/modules/common/security.nix"
    cp ${./development.nix} "$out/nix/modules/common/development.nix"
    cp ${./nazar-context.nix} "$out/nix/modules/common/nazar-context.nix"
    cp ${./pi-agent.nix} "$out/nix/modules/common/pi-agent.nix"
    cp ${./pi-default-packages.nix} "$out/nix/modules/common/pi-default-packages.nix"
    cp ${../../packages/pi/default.nix} "$out/nix/packages/pi/default.nix"
    cp ${../../packages/pi/hashes.json} "$out/nix/packages/pi/hashes.json"
    cp ${../../packages/pi/package-lock.json} "$out/nix/packages/pi/package-lock.json"
    mkdir -p "$out/nix/modules/host"
    cp ${../host/microvm-guest.nix} "$out/nix/modules/host/microvm-guest.nix"
    cp ${../services/dav-server.nix} "$out/nix/modules/services/dav-server.nix"
  '';
in
{
  environment.etc."nazar/vm-context.md".source = contextMarkdown;
  environment.etc."nazar/vm-context.json".source = contextJson;

  programs.git = {
    enable = true;
    config.safe.directory = repoRoot;
  };

  environment.systemPackages = [
    contextCommand
    selfSwitchCommand
    switchRequestCommand
  ];

  environment.sessionVariables = {
    NAZAR_VM_CONTEXT = "/etc/nazar/vm-context.md";
    NAZAR_VM_REPO = repoRoot;
    NAZAR_VM_REPO_INPUT = repoInputName;
    NAZAR_VM_SWITCH_APP = switchApp;
    NAZAR_VM_SELF_FLAKE = selfSwitchFlake;
    NAZAR_ORCHESTRATOR_REPO = "/root/nazar";
  };

  system.activationScripts.nazar-vm-agent-context = lib.stringAfter [ "users" ] ''
    install -d -m 0755 -o alex -g users /home/alex/.pi/agent
    install -m 0644 -o alex -g users ${lib.escapeShellArg agentsMarkdown} /home/alex/.pi/agent/AGENTS.md
  '';

  system.activationScripts.nazar-vm-self-flake = lib.stringAfter [ "etc" "users" ] ''
    install -d -m 0755 -o root -g root ${selfFlakeRoot}
    ${pkgs.rsync}/bin/rsync -a --delete ${selfFlakeSource}/ ${selfFlakeRoot}/
    chmod -R u=rwX,go=rX ${selfFlakeRoot}
  '';
}
