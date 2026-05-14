{
  lib,
  pkgs,
  vm,
  ...
}:
let
  repoName =
    {
      git = "nazar";
      minecraft = "minecraft";
      dav-server = "dav-server";
    }
    .${vm.hostname} or vm.hostname;
  repoRoot = "/home/alex/${repoName}";
  bootstrap = pkgs.writeShellScriptBin "nazar-vm-repo-bootstrap" ''
    set -euo pipefail

    repo_name=${lib.escapeShellArg repoName}
    repo_root=${lib.escapeShellArg repoRoot}

    if [ ! -d "$repo_root" ]; then
      echo "Repo directory $repo_root does not exist." >&2
      echo "This should be a virtiofs mount from the host." >&2
      exit 1
    fi

    cd "$repo_root"

    if [ ! -d .git ]; then
      echo "Repo not initialized at $repo_root." >&2
      echo "The host should provision this directory via:" >&2
      echo "  nazar-git-init $repo_name" >&2
      exit 1
    fi

    echo "VM repo ready: $repo_root"
    echo "Pi is available as: pi"
    echo "You may edit, test, commit here; production switches are handed off with: nazar-switch-request"
    echo "Next: cd $repo_root && pi"
  '';
  pi = pkgs.callPackage ../../packages/pi { };

  # Per-VM LSP servers. Override in fleet config with
  #   vm.nixpi.lspServers = [ pkgs.gopls ];
  # or add to the defaults below.
  defaultLspServers = [
    pkgs.nixd                       # Nix
    pkgs.typescript-language-server  # TypeScript/JavaScript
    pkgs.pyright                    # Python
  ];

  # Per-VM language runtimes + extra LSP servers.
  # Keyed by hostname so each VM gets what its project needs.
  vmExtraPackages =
    {
      minecraft = [
        pkgs.jdk21                     # Java runtime
        pkgs.jdt-language-server        # Java LSP
      ];
    }
    .${vm.hostname} or [];
in
{
  imports = [ ./pi-default-packages.nix ];

  environment.systemPackages = [
    pi
    pkgs.nodejs
    bootstrap
  ] ++ defaultLspServers ++ vmExtraPackages;

  environment.sessionVariables = {
    PI_TELEMETRY = "0";
    PI_SKIP_VERSION_CHECK = "1";
    NAZAR_VM_REPO = repoRoot;
  };

  systemd.tmpfiles.rules = [
    "d ${repoRoot} 0755 alex users - -"
  ];
}
