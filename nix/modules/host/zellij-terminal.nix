{
  lib,
  pkgs,
  ...
}:
let
  exposure = import ../../fleet/exposure.nix;
  terminal = exposure.host.terminal or { };

  enable = terminal.enable or false;
  port = terminal.port or 8082;

  zellijConfig = pkgs.writeText "zellij-web-config.kdl" ''
    web_server true
    web_sharing "on"
    web_server_ip "127.0.0.1"
    web_server_port ${toString port}
    show_startup_tips false
    show_release_notes false

    web_client {
        font "monospace"
    }
  '';

  startZellijWeb = pkgs.writeShellScript "zellij-web-start" ''
    set -euo pipefail
    exec ${pkgs.util-linux}/bin/script -q -f -c '${pkgs.zellij}/bin/zellij --config ${zellijConfig} --session web-terminal' /dev/null
  '';
in
{
  environment.systemPackages = [ pkgs.zellij ];

  systemd.services.zellij-web = lib.mkIf enable {
    description = "Zellij web terminal for alex";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];

    environment = {
      HOME = "/home/alex";
      SHELL = "/run/current-system/sw/bin/bash";
      TERM = "xterm-256color";
      ZELLIJ_CONFIG_FILE = toString zellijConfig;
      XDG_RUNTIME_DIR = "/run/zellij-web";
      XDG_CONFIG_HOME = "/home/alex/.config";
      XDG_DATA_HOME = "/home/alex/.local/share";
      XDG_CACHE_HOME = "/home/alex/.cache";
    };

    serviceConfig = {
      User = "alex";
      Group = "users";
      WorkingDirectory = "/home/alex";
      RuntimeDirectory = "zellij-web";
      RuntimeDirectoryMode = "0700";
      Restart = "always";
      RestartSec = "5s";
      KillMode = "mixed";
      ExecStart = toString startZellijWeb;
    };
  };
}
