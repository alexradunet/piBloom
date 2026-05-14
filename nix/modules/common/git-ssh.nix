{
  lib,
  pkgs,
  vm,
  ...
}:
let
  gitHost = "git.nazar.studio";
  gitIp = "10.10.10.21";
  gitPort = 10022;
  keyDir = "/var/lib/nazar/git-ssh";
  keyPath = "${keyDir}/id_ed25519";
  knownHostsPath = "${keyDir}/known_hosts";
in
{
  systemd.tmpfiles.rules = [
    "d ${keyDir} 0700 alex users - -"
  ];

  systemd.services.nazar-vm-git-ssh-key = {
    description = "Ensure this MicroVM has a persistent Git SSH key";
    wantedBy = [ "multi-user.target" ];
    after = [ "local-fs.target" ];

    path = [
      pkgs.coreutils
      pkgs.openssh
    ];

    serviceConfig = {
      Type = "oneshot";
      User = "root";
      Group = "root";
    };

    script = ''
      set -euo pipefail

      install -d -m 0700 -o alex -g users ${lib.escapeShellArg keyDir}

      if [ ! -s ${lib.escapeShellArg keyPath} ]; then
        tmp=$(mktemp -p ${lib.escapeShellArg keyDir} id_ed25519.XXXXXX)
        rm -f "$tmp" "$tmp.pub"
        ssh-keygen -t ed25519 -N "" -C ${lib.escapeShellArg "${vm.hostname}@nazar-microvm-git"} -f "$tmp"
        install -m 0600 -o alex -g users "$tmp" ${lib.escapeShellArg keyPath}
        install -m 0644 -o alex -g users "$tmp.pub" ${lib.escapeShellArg "${keyPath}.pub"}
        rm -f "$tmp" "$tmp.pub"
      fi

      chown alex:users ${lib.escapeShellArg keyPath} ${lib.escapeShellArg "${keyPath}.pub"}
      chmod 0600 ${lib.escapeShellArg keyPath}
      chmod 0644 ${lib.escapeShellArg "${keyPath}.pub"}
      touch ${lib.escapeShellArg knownHostsPath}
      chown alex:users ${lib.escapeShellArg knownHostsPath}
      chmod 0644 ${lib.escapeShellArg knownHostsPath}
    '';
  };

  programs.ssh.extraConfig = ''
    Host ${gitHost} git ${gitIp}
      HostName ${gitIp}
      Port ${toString gitPort}
      User git
      IdentityFile ${keyPath}
      IdentitiesOnly yes
      UserKnownHostsFile ${knownHostsPath}
      StrictHostKeyChecking accept-new
  '';

  environment.sessionVariables = {
    NAZAR_VM_GIT_SSH_KEY = keyPath;
  };
}
