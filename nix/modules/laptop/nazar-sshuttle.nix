{
  config,
  fleet,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.nazar.access.sshuttle;
  hostIdentity = import ../../fleet/host.nix;
  privateDomains = import ../../fleet/private-domains.nix { inherit fleet lib; };

  sshuttleArgs = lib.concatStringsSep " " (
    [
      "--method=auto"
      "-r"
      cfg.sshHostAlias
    ]
    ++ lib.concatMap (host: [
      "-x"
      host
    ]) cfg.excludeHosts
    ++ cfg.extraArgs
    ++ cfg.subnets
  );
in
{
  options.nazar.access.sshuttle = {
    enable = lib.mkEnableOption "transparent private access to nazar with sshuttle";

    sshUser = lib.mkOption {
      type = lib.types.str;
      default = "alex";
      description = "Remote SSH user on nazar.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = hostIdentity.public.ipv4;
      description = "Public nazar SSH endpoint used for the sshuttle control connection.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 22;
      description = "Remote SSH port on nazar.";
    };

    keyPath = lib.mkOption {
      type = lib.types.str;
      default = "/home/alex/.ssh/id_ed25519";
      description = ''
        Private key used for the tunnel. This should be the private half of a
        public key listed in nix/users/alex-public-ssh-keys.nix. The sshuttle
        systemd unit is skipped when this path does not exist, so the laptop
        configuration can stay declarative while the secret key remains outside
        the repository.
      '';
    };

    sshHostAlias = lib.mkOption {
      type = lib.types.str;
      default = "nazar-sshuttle";
      description = "Generated OpenSSH host alias used by the sshuttle service.";
    };

    privateIp = lib.mkOption {
      type = lib.types.str;
      default = hostIdentity.private.ip;
      description = "Host-local private service address routed by sshuttle.";
    };

    subnets = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ hostIdentity.private.cidr ];
      description = "Remote addresses routed through sshuttle.";
    };

    excludeHosts = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ hostIdentity.public.ipv4 ];
      description = "Hosts excluded from sshuttle routing, normally the public SSH endpoint.";
    };

    privateDomains = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = privateDomains;
      defaultText = "Nazar private domains from fleet/vms.nix privateAccess and host exposure";
      description = ''
        Private service domains mapped to the private service address in
        /etc/hosts. This lets browsers, curl, and other tools use the normal
        service URLs without per-application SOCKS proxy settings.
      '';
    };

    hostPublicKey = lib.mkOption {
      type = lib.types.str;
      default = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHO8D1SwnjwFVj+bz/ITvENDLeskYUd8fUb+GIxW7Lay";
      description = ''
        Nazar's OpenSSH host public key. Verify out of band before trusting or
        updating this value.
      '';
    };

    extraArgs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Extra command-line arguments passed to sshuttle.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ pkgs.sshuttle ];

    networking.hosts."${cfg.privateIp}" = cfg.privateDomains;

    programs.ssh.knownHosts.nazar-public = {
      hostNames = lib.unique [
        cfg.sshHostAlias
        cfg.host
      ];
      publicKey = cfg.hostPublicKey;
    };

    programs.ssh.extraConfig = ''
      Host ${cfg.sshHostAlias}
        HostName ${cfg.host}
        Port ${toString cfg.port}
        User ${cfg.sshUser}
        IdentityFile ${cfg.keyPath}
        IdentitiesOnly yes
        HostKeyAlias ${cfg.sshHostAlias}
        StrictHostKeyChecking yes
        BatchMode yes
        ServerAliveInterval 30
        ServerAliveCountMax 3
    '';

    systemd.services.nazar-sshuttle = {
      description = "Transparent sshuttle access to nazar private services";
      documentation = [
        "man:sshuttle(1)"
        "man:ssh_config(5)"
      ];
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];
      unitConfig.ConditionPathExists = cfg.keyPath;
      serviceConfig = {
        Type = "simple";
        ExecStart = "${pkgs.sshuttle}/bin/sshuttle ${sshuttleArgs}";
        Restart = "always";
        RestartSec = "10s";
      };
    };
  };
}
