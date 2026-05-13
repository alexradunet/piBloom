{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.nixpi;
  inherit (lib)
    concatMapStringsSep
    literalExpression
    mkEnableOption
    mkIf
    mkOption
    types
    ;

  packageDefault = pkgs.callPackage ../packages/nixpi { };
  sourceFirewallRules = concatMapStringsSep "\n" (source: ''
    iptables -A nixos-fw -p tcp -s ${source} --dport ${toString cfg.port} -j nixos-fw-accept
  '') cfg.firewallAllowedSources;
  sourceFirewallStopRules = concatMapStringsSep "\n" (source: ''
    iptables -D nixos-fw -p tcp -s ${source} --dport ${toString cfg.port} -j nixos-fw-accept 2>/dev/null || true
  '') cfg.firewallAllowedSources;
in
{
  options.services.nixpi = {
    enable = mkEnableOption "NixPi, the web interface for Pi Coding Agent";

    package = mkOption {
      type = types.package;
      default = packageDefault;
      defaultText = literalExpression "pkgs.callPackage ../packages/nixpi { }";
      description = "NixPi package to run.";
    };

    user = mkOption {
      type = types.str;
      default = "alex";
      description = "User that owns the Pi session and runs NixPi.";
    };

    group = mkOption {
      type = types.str;
      default = "users";
      description = "Group used for the NixPi service.";
    };

    home = mkOption {
      type = types.str;
      default = "/home/${cfg.user}";
      defaultText = literalExpression ''"/home/''${config.services.nixpi.user}"'';
      description = "HOME used by Pi/NixPi for configuration and session state.";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "Address NixPi binds to.";
    };

    port = mkOption {
      type = types.port;
      default = 4815;
      description = "Port NixPi listens on.";
    };

    workingDirectory = mkOption {
      type = types.str;
      default = cfg.home;
      defaultText = literalExpression "config.services.nixpi.home";
      description = "Working directory passed to Pi as NIXPI_CWD.";
    };

    piBinary = mkOption {
      type = types.str;
      default = "/run/current-system/sw/bin/pi";
      description = "Pi executable or absolute path used for `pi --mode rpc`.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open the NixOS firewall for the NixPi port.";
    };

    firewallAllowedSources = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [ "10.10.10.1" ];
      description = ''
        Optional source CIDRs/addresses allowed to reach NixPi. When empty and
        openFirewall is true, the port is opened normally with allowedTCPPorts.
        When non-empty, source-restricted iptables rules are added instead.
      '';
    };

    environment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      example = {
        OPENAI_API_KEY = "...";
      };
      description = "Extra environment variables for the NixPi service.";
    };
  };

  config = mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];

    systemd.tmpfiles.rules = [
      "d ${toString cfg.home}/.pi 0750 ${cfg.user} ${cfg.group} - -"
      "d ${toString cfg.home}/.pi/agent 0750 ${cfg.user} ${cfg.group} - -"
    ];

    systemd.services.nixpi = {
      description = "NixPi web interface for Pi Coding Agent";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      environment = {
        HOME = toString cfg.home;
        USER = cfg.user;
        LOGNAME = cfg.user;
        NIXPI_HOST = cfg.host;
        NIXPI_PORT = toString cfg.port;
        NIXPI_CWD = toString cfg.workingDirectory;
        NIXPI_PI_BIN = cfg.piBinary;
        PI_SKIP_VERSION_CHECK = "1";
        PI_TELEMETRY = "0";
      }
      // cfg.environment;
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = toString cfg.workingDirectory;
        ExecStart = "${cfg.package}/bin/nixpi";
        Restart = "on-failure";
        RestartSec = 3;
        UMask = "0027";
      };
    };

    networking.firewall.allowedTCPPorts = mkIf (cfg.openFirewall && cfg.firewallAllowedSources == [ ]) [
      cfg.port
    ];

    networking.firewall.extraCommands = mkIf (cfg.openFirewall && cfg.firewallAllowedSources != [ ]) sourceFirewallRules;
    networking.firewall.extraStopCommands = mkIf (cfg.openFirewall && cfg.firewallAllowedSources != [ ]) sourceFirewallStopRules;
  };
}
