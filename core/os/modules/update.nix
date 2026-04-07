# core/os/modules/update.nix
{
  pkgs,
  lib,
  config,
  ...
}:

let
  inherit (config.nixpi) primaryUser;
  nixpiUpdate = pkgs.callPackage ../pkgs/nixpi-update { };
in

{
  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];

  assertions = [
    {
      assertion = config.nixpi.update.onBootSec != "";
      message = "nixpi.update.onBootSec must not be empty.";
    }
    {
      assertion = config.nixpi.update.interval != "";
      message = "nixpi.update.interval must not be empty.";
    }
  ];

  system.services.nixpi-update = {
    process.argv = [ "${nixpiUpdate}/bin/nixpi-update" ];
    systemd.service = {
      description = "NixPI NixOS update";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      unitConfig = {
        ConditionPathExists = "/etc/nixos/flake.nix";
      };
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = false;
        Restart = "no";
        Environment = [
          "PATH=/run/current-system/sw/bin:${lib.makeBinPath [ pkgs.nix ]}"
          "NIXPI_PRIMARY_USER=${primaryUser}"
          "NIXPI_SYSTEM_FLAKE_DIR=/etc/nixos"
        ];
      };
    };
  };

  systemd.timers.nixpi-update = {
    description = "NixPI update check timer";
    wantedBy = [ "timers.target" ];

    timerConfig = {
      OnBootSec = config.nixpi.update.onBootSec;
      OnUnitActiveSec = config.nixpi.update.interval;
      Persistent = true;
    };
  };
}
