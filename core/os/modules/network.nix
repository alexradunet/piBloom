# core/os/modules/network.nix
{ pkgs, lib, config, ... }:

let
  resolved = import ../lib/resolve-primary-user.nix { inherit lib config; };
  primaryUser = resolved.resolvedPrimaryUser;
  primaryHome = resolved.resolvedPrimaryHome;
  serviceUser = config.nixpi.serviceUser;
  stateDir = config.nixpi.stateDir;
  setupCompleteFile = "${primaryHome}/.nixpi/.setup-complete";
  cfg = config.nixpi.services;
  securityCfg = config.nixpi.security;
  sshAllowUsers =
    if securityCfg.ssh.allowUsers != [ ] then
      securityCfg.ssh.allowUsers
    else
      lib.optional (primaryUser != "") primaryUser;
  bindsLocally =
    cfg.bindAddress == "127.0.0.1"
    || cfg.bindAddress == "::1"
    || cfg.bindAddress == "localhost";
  exposedPorts =
    lib.optionals cfg.home.enable [ cfg.home.port ]
    ++ lib.optionals cfg.chat.enable [ cfg.chat.port ]
    ++ [ config.nixpi.matrix.port ];
in

{
  imports = [ ./options.nix ];

  config = {
    assertions = [
      {
        assertion = securityCfg.trustedInterface != "";
        message = "nixpi.security.trustedInterface must not be empty.";
      }
      {
        assertion = cfg.bindAddress != "";
        message = "nixpi.services.bindAddress must not be empty.";
      }
      {
        assertion = lib.length (lib.unique exposedPorts) == lib.length exposedPorts;
        message = "nixPI service ports must be unique across built-in services and Matrix.";
      }
    ];

    hardware.enableAllFirmware = true;
    services.netbird.enable = true;
    services.netbird.clients.default.config.DisableAutoConnect = lib.mkForce true;

    services.openssh = {
      enable = true;
      settings = {
        AllowAgentForwarding = false;
        AllowTcpForwarding = false;
        ClientAliveCountMax = 2;
        ClientAliveInterval = 300;
        LoginGraceTime = 30;
        MaxAuthTries = 3;
        PasswordAuthentication = securityCfg.ssh.passwordAuthentication;
        PubkeyAuthentication = "yes";
        PermitRootLogin = "no";
        X11Forwarding = false;
      };
      extraConfig = lib.optionalString (sshAllowUsers != [ ]) ''
        AllowUsers ${lib.concatStringsSep " " sshAllowUsers}
      '';
    };
    systemd.services.sshd.unitConfig = lib.mkIf (!config.nixpi.bootstrap.keepSshAfterSetup) {
      ConditionPathExists = "!${setupCompleteFile}";
    };

    networking.firewall.enable = true;
    networking.firewall.allowedTCPPorts = [ 22 ];
    networking.firewall.interfaces = lib.mkIf securityCfg.enforceServiceFirewall {
      "${securityCfg.trustedInterface}".allowedTCPPorts = exposedPorts;
    };
    networking.networkmanager.enable = true;

    services.fail2ban = lib.mkIf securityCfg.fail2ban.enable {
      enable = true;
      jails.sshd.settings = {
        enabled = true;
        backend = "systemd";
        bantime = "1h";
        findtime = "10m";
        maxretry = 5;
      };
    };

    environment.etc."nixpi/fluffychat-web".source = pkgs.fluffychat-web;

    systemd.tmpfiles.rules = [
      "d ${stateDir}/services/home/tmp 0770 ${serviceUser} ${serviceUser} -"
      "d ${stateDir}/services/chat/tmp 0770 ${serviceUser} ${serviceUser} -"
      "d ${primaryHome}/nixPI 2775 ${primaryUser} ${serviceUser} -"
    ];

    environment.systemPackages = with pkgs; [
      git git-lfs gh
      ripgrep fd bat htop jq curl wget unzip openssl
      just shellcheck biome typescript
      qemu OVMF
      chromium
      netbird
      nginx
    ] ++ lib.optionals securityCfg.fail2ban.enable [ pkgs.fail2ban ];

    system.services = lib.mkMerge [
      (lib.mkIf cfg.home.enable {
        nixpi-home = {
          imports = [ (lib.modules.importApply ../services/nixpi-home.nix { inherit pkgs; }) ];
          nixpi-home = {
            port = cfg.home.port;
            inherit stateDir serviceUser;
            chatPort = cfg.chat.port;
            matrixPort = config.nixpi.matrix.port;
            trustedInterface = securityCfg.trustedInterface;
          };
        };
      })
      (lib.mkIf cfg.chat.enable {
        nixpi-chat = {
          imports = [ (lib.modules.importApply ../services/nixpi-chat.nix { inherit pkgs; }) ];
          nixpi-chat = {
            port = cfg.chat.port;
            matrixPort = config.nixpi.matrix.port;
            inherit stateDir serviceUser;
          };
        };
      })
    ];
    warnings =
      lib.optional (!securityCfg.enforceServiceFirewall && !bindsLocally) ''
        nixPI's built-in service surface is bound to `${cfg.bindAddress}` without
        the trusted-interface firewall restriction. Home, Chat, and
        Matrix may be reachable on all network interfaces.
      '';
  };
}
