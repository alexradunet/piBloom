{ config, lib, ... }:
let
  cfg = config.nazar.access.sshSocks;
in
{
  options.nazar.access.sshSocks = {
    enable = lib.mkEnableOption "persistent SSH SOCKS access to nazar";

    localUser = lib.mkOption {
      type = lib.types.str;
      default = "alex";
      description = "Local user that owns and runs the AutoSSH tunnel.";
    };

    sshUser = lib.mkOption {
      type = lib.types.str;
      default = "alex";
      description = "Remote SSH user on nazar.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "167.235.12.22";
      description = "Public nazar SSH endpoint used for the SOCKS tunnel.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 22;
      description = "Remote SSH port on nazar.";
    };

    keyPath = lib.mkOption {
      type = lib.types.path;
      default = "/home/${cfg.localUser}/.ssh/nazar_ed25519";
      description = ''
        Private key used for the tunnel. The AutoSSH systemd unit is skipped
        when this path does not exist, so the laptop configuration can stay
        declarative while the secret key remains outside the repository.
      '';
    };

    bindAddress = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Local address for the SOCKS listener.";
    };

    localPort = lib.mkOption {
      type = lib.types.port;
      default = 1080;
      description = "Local SOCKS5 port forwarded through nazar.";
    };

    hostPublicKey = lib.mkOption {
      type = lib.types.str;
      default = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHO8D1SwnjwFVj+bz/ITvENDLeskYUd8fUb+GIxW7Lay";
      description = ''
        Nazar's OpenSSH host public key. Verify out of band before trusting or
        updating this value.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    programs.ssh.knownHosts.nazar-public = {
      hostNames = lib.unique [
        "nazar-public"
        cfg.host
      ];
      publicKey = cfg.hostPublicKey;
    };

    programs.ssh.extraConfig = ''
      Host nazar-public
        HostName ${cfg.host}
        Port ${toString cfg.port}
        User ${cfg.sshUser}
        IdentityFile ${cfg.keyPath}
        IdentitiesOnly yes
        HostKeyAlias nazar-public
        StrictHostKeyChecking yes
        ServerAliveInterval 30
        ServerAliveCountMax 3

      Host nazar-socks
        HostName ${cfg.host}
        Port ${toString cfg.port}
        User ${cfg.sshUser}
        IdentityFile ${cfg.keyPath}
        IdentitiesOnly yes
        HostKeyAlias nazar-public
        StrictHostKeyChecking yes
        BatchMode yes
        DynamicForward ${cfg.bindAddress}:${toString cfg.localPort}
        ExitOnForwardFailure yes
        ServerAliveInterval 30
        ServerAliveCountMax 3
    '';

    services.autossh.sessions = [
      {
        name = "nazar-socks";
        user = cfg.localUser;
        monitoringPort = 0;
        extraArguments = "-N nazar-socks";
      }
    ];

    systemd.services.autossh-nazar-socks = {
      wants = [ "network-online.target" ];
      after = lib.mkForce [ "network-online.target" ];
      unitConfig = {
        ConditionPathExists = cfg.keyPath;
        Documentation = [
          "man:autossh(1)"
          "man:ssh_config(5)"
        ];
      };
      serviceConfig = {
        Restart = lib.mkForce "always";
        RestartSec = "10s";
      };
    };
  };
}
