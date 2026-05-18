{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.nazar.lifeOs.client;
  mountPoint = toString cfg.mountPoint;
in
{
  options.nazar.lifeOs.client = {
    enable = lib.mkEnableOption "Life OS client integration";

    user = lib.mkOption {
      type = lib.types.str;
      default = "alex";
      description = "User that owns and consumes the Life OS WebDAV mount.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "users";
      description = "Group that owns and consumes the Life OS WebDAV mount.";
    };

    davUrl = lib.mkOption {
      type = lib.types.str;
      description = "Life OS WebDAV URL reachable through Tailscale.";
    };

    mountPoint = lib.mkOption {
      type = lib.types.path;
      default = "/home/${cfg.user}/LifeOS";
      defaultText = lib.literalExpression ''"/home/$${config.nazar.lifeOs.client.user}/LifeOS"'';
      description = "Local mount point for the Life OS WebDAV filesystem.";
    };

    desktopApps.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Install desktop applications useful for consuming Life OS.";
    };

    kdeApps.enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Install KDE PIM applications for CalDAV/CardDAV calendars, contacts, tasks, and reminders.";
    };

    thunderbird.enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Install Thunderbird as a reliable CalDAV/CardDAV client and debugging fallback.";
    };

    obsidian.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Install Obsidian for Life OS Markdown notes and journals.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = config.services.tailscale.enable;
        message = "Life OS client requires services.tailscale.enable = true.";
      }
      {
        assertion = config.services.tailscale.useRoutingFeatures == "client";
        message = "Life OS client expects Tailscale client mode unless routing behavior is explicitly designed.";
      }
    ];

    services.davfs2.enable = true;

    systemd.tmpfiles.rules = [
      "d ${mountPoint} 0750 ${cfg.user} ${cfg.group} - -"
    ];

    fileSystems.${mountPoint} = {
      device = cfg.davUrl;
      fsType = "davfs";
      options = [
        "noauto"
        "nofail"
        "x-systemd.automount"
        "x-systemd.idle-timeout=10min"
        "x-systemd.after=tailscaled.service"
        "_netdev"
        "uid=${cfg.user}"
        "gid=${cfg.group}"
        "file_mode=0640"
        "dir_mode=0750"
      ];
    };

    environment.systemPackages =
      lib.optionals (cfg.desktopApps.enable && cfg.obsidian.enable) [
        pkgs.obsidian
      ]
      ++ lib.optionals (cfg.desktopApps.enable && cfg.thunderbird.enable) [
        pkgs.thunderbird
      ]
      ++ lib.optionals (cfg.desktopApps.enable && cfg.kdeApps.enable) (
        [
          pkgs.kdePackages.korganizer
          pkgs.kdePackages.kaddressbook
          pkgs.kdePackages.kontact
        ]
        ++ lib.optional (pkgs.kdePackages ? merkuro) pkgs.kdePackages.merkuro
      );
  };
}
