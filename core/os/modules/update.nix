# core/os/modules/update.nix
{
  lib,
  config,
  ...
}:

{
  config = {
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

    nix.settings.experimental-features = [
      "nix-command"
      "flakes"
    ];

    system.autoUpgrade = {
      enable = true;
      flake = config.nixpi.flake;
      flags = lib.mkAfter [ "--impure" ];
    };

    systemd.services.nixos-upgrade = {
      aliases = [ "nixpi-update.service" ];
      unitConfig.ConditionPathExists = "/etc/nixos/flake.nix";
    };

    systemd.timers.nixos-upgrade.wantedBy = lib.mkForce [ ];

    systemd.timers.nixpi-update = {
      description = "NixPI update check timer";
      wantedBy = [ "timers.target" ];

      timerConfig = {
        OnBootSec = config.nixpi.update.onBootSec;
        OnUnitActiveSec = config.nixpi.update.interval;
        Persistent = true;
        Unit = "nixos-upgrade.service";
      };
    };
  };
}
