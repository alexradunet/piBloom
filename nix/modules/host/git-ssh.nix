{ fleet, lib, pkgs, ... }:
let
  stateDir = "/persist/git";
  repositoriesDir = "${stateDir}/repositories";
  namespace = "nazar";
  namespaceDir = "${repositoriesDir}/${namespace}";

  initRepo = pkgs.writeShellApplication {
    name = "nazar-git-init";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.findutils
      pkgs.git
    ];
    text = ''
      set -euo pipefail

      if [ "$(id -u)" -ne 0 ]; then
        exec sudo "$0" "$@"
      fi

      if [ "$#" -ne 1 ]; then
        echo "usage: nazar-git-init <repo[.git] | namespace/repo[.git]>" >&2
        exit 2
      fi

      repo=$1
      case "$repo" in
        */*) rel=$repo ;;
        *) rel=${namespace}/$repo ;;
      esac
      case "$rel" in
        *.git) ;;
        *) rel="$rel.git" ;;
      esac
      case "$rel" in
        ""|/*|../*|*/../*|*/..|*//*)
          echo "invalid repository path: $repo" >&2
          exit 2
          ;;
      esac

      target=${lib.escapeShellArg repositoriesDir}/$rel
      if [ -e "$target" ]; then
        echo "$target already exists" >&2
        exit 1
      fi

      install -d -m 2770 -o git -g git "$(dirname "$target")"
      git init --bare --initial-branch=main "$target"
      chown -R git:git "$target"
      chmod -R ug+rwX,o-rwx "$target"
      find "$target" -type d -exec chmod g+s {} +
      echo "created $target"
    '';
  };
  natBridgeIp = fleet.defaults.gateway; # 10.10.10.1
  privateIp = "10.44.0.1";
  gitPort = 10022;
  adminKeys = import ../../users/admin-keys.nix;
in
{
  # --- Git user ---
  users.groups.git = { };
  users.users.git = {
    isSystemUser = true;
    group = "git";
    home = repositoriesDir;
    createHome = false;
    shell = "${pkgs.git}/bin/git-shell";
    openssh.authorizedKeys.keys = adminKeys;
  };

  # --- Host sshd: Git endpoint on private interfaces ---
  services.openssh = {
    listenAddresses = [
      { addr = natBridgeIp; port = gitPort; }
      { addr = privateIp; port = gitPort; }
    ];
    extraConfig = ''
      Match User git
        X11Forwarding no
        AllowTcpForwarding no
        PermitTTY no
        GatewayPorts no
    '';
  };

  # --- Repository directories ---
  systemd.tmpfiles.rules = [
        "d ${stateDir} 0755 root root - -"
    "d ${repositoriesDir} 2770 root root - -"
    "d ${namespaceDir} 2770 root root - -"
    "L+ /${namespace} - - - - ${namespaceDir}"
    "d /var/lib/nazar 0755 root root - -"
  ];

  environment.systemPackages = [ initRepo ];
}
