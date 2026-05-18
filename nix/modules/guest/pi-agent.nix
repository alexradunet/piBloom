{
  lib,
  pkgs,
  vm,
  ...
}:
let
  repoName = vm.repoName or vm.hostname;
  repoRoot = vm.piAgent.repoRoot or "/home/alex/${repoName}";
  workingDirectory = vm.piAgent.workingDirectory or repoRoot;
  bootstrap = pkgs.writeShellScriptBin "nazar-vm-repo-bootstrap" ''
    set -euo pipefail

    repo_root=${lib.escapeShellArg repoRoot}
    working_directory=${lib.escapeShellArg workingDirectory}

    if [ ! -d "$repo_root" ]; then
      echo "Repo directory $repo_root does not exist." >&2
      echo "This should be a virtiofs mount from the host." >&2
      exit 1
    fi

    cd "$repo_root"

    if [ ! -d .git ]; then
      echo "Repo not initialized at $repo_root." >&2
      echo "The host should provision a clone of the Nazar monorepo at this virtiofs mount." >&2
      exit 1
    fi

    if [ ! -d "$working_directory" ]; then
      echo "Workspace directory $working_directory does not exist inside $repo_root." >&2
      exit 1
    fi

    echo "VM repo ready: $repo_root"
    echo "Service workspace: $working_directory"
    echo "Pi is available as: pi"
    echo "You may edit, test, and commit here. To deploy, push and request a rebuild from the Nazar host."
    echo "Next: cd $working_directory && pi"
  '';
  agentsMarkdown = pkgs.writeText "nazar-vm-agents.md" ''
    # Nazar VM Agent Instructions

    You are running inside a Nazar NixOS VM, not on the host.

    VM identity:

    - Hostname: `${vm.hostname}`
    - Monorepo root: `${repoRoot}` (virtiofs mount from host, no SSH needed)
    - Service workspace: `${workingDirectory}`
    - NAT IP: `${vm.ip}`

    Critical rules:

    - The VM-owned monorepo checkout at `${repoRoot}` is editable from this VM.
    - Make service changes in `${workingDirectory}`.
    - Commit and push durable service changes from `${repoRoot}`.
    - To deploy changes, push to the remote and request a rebuild from the Nazar host:
      `cd /root/nazar && nix run .#switch-${vm.hostname}` (run on the host).
    - Nazar owns infrastructure and networking: host VM lifecycle, VMID/IP/MAC,
      sizing, NAT/forwarding, public exposure, and shared network policy.
    - Do not create public exposure, firewall, VMID/IP/MAC, or host
      lifecycle changes from a VM repo. Those belong to `/root/nazar`.
  '';
  pi = pkgs.callPackage ../../packages/pi { };

  # Per-VM LSP servers. Override in fleet config with
  #   vm.piAgent.lspServers = [ pkgs.gopls ];
  # or add to the defaults below.
  defaultLspServers = [
    pkgs.nixd # Nix
    pkgs.typescript-language-server # TypeScript/JavaScript
    pkgs.pyright # Python
  ];

  # Per-VM language runtimes + extra LSP servers.
  # Keyed by hostname so each VM gets what its project needs.
  vmExtraPackages =
    {
      minecraft = [
        pkgs.jdk21 # Java runtime
        pkgs.jdt-language-server # Java LSP
      ];
    }
    .${vm.hostname} or [ ];
in
{
  imports = [ ./pi-default-packages.nix ];

  # Allow Git operations in the VM monorepo checkout without ownership warnings.
  programs.git = {
    enable = true;
    config.safe.directory = repoRoot;
  };

  environment.systemPackages = [
    pi
    pkgs.nodejs
    bootstrap
  ]
  ++ defaultLspServers
  ++ vmExtraPackages;

  environment.sessionVariables = {
    PI_TELEMETRY = "0";
    PI_SKIP_VERSION_CHECK = "1";
    NAZAR_VM_REPO = repoRoot;
    NAZAR_VM_WORKDIR = workingDirectory;
  };

  systemd.tmpfiles.rules = [
    "d ${repoRoot} 0755 alex users - -"
  ];

  system.activationScripts.nazar-vm-agent-context = lib.stringAfter [ "users" ] ''
    install -d -m 0755 -o alex -g users /home/alex/.pi/agent
    install -m 0644 -o alex -g users ${lib.escapeShellArg agentsMarkdown} /home/alex/.pi/agent/AGENTS.md
  '';

}
