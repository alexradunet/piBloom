# core/os/modules/options.nix
# Shared NixOS options consumed across nixPI modules.
{ lib, ... }:

let
  mkPortOption = default: description:
    lib.mkOption {
      type = lib.types.port;
      inherit default description;
    };
in
{
  options.nixpi = {
    primaryUser = lib.mkOption {
      type = lib.types.str;
      default = builtins.getEnv "NIXPI_PRIMARY_USER";
      description = ''
        Primary human/operator account for the nixPI machine.
      '';
    };

    primaryHome = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = ''
        Home directory for the primary nixPI operator account. When left empty,
        nixPI defaults to `/home/<primaryUser>`.
      '';
    };

    createPrimaryUser = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Whether nixPI should create and manage the primary operator account.
        Disable this when layering nixPI onto an existing NixOS user.
      '';
    };

    install = {
      mode = lib.mkOption {
        type = lib.types.enum [ "existing-user" "managed-user" ];
        default = "existing-user";
        description = ''
          Whether nixPI should attach to an existing operator account or create
          and manage one directly.
        '';
      };

      autoDetectPrimaryUser = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether the installer should attempt to resolve `nixpi.primaryUser`
          from the invoking human account when `nixpi.primaryUser` is empty.
          The declarative module graph itself does not inspect `users.users`
          for this, because that causes evaluation recursion in VM builds.
        '';
      };
    };

    serviceUser = lib.mkOption {
      type = lib.types.str;
      default = "agent";
      description = ''
        Dedicated system account that owns the always-on Pi agent runtime and
        other service-managed state.
      '';
    };

    stateDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/nixpi";
      description = ''
        Root directory for service-owned nixPI state.
      '';
    };

    security = {
      trustedInterface = lib.mkOption {
        type = lib.types.str;
        default = "wt0";
        description = ''
          Network interface trusted to reach the externally exposed nixPI
          service surface.
        '';
      };

      enforceServiceFirewall = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether nixPI service ports are opened only on the trusted interface.
        '';
      };

      passwordlessSudo.enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = ''
          Deprecated blanket passwordless sudo escape hatch. Keep disabled in
          favor of narrow bootstrap rules and the broker service.
        '';
      };
    };

    bootstrap = {
      passwordlessSudo.enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether nixPI grants narrow passwordless sudo rules needed by the
          first-boot bootstrap flow.
        '';
      };
    };

    agent = {
      autonomy = lib.mkOption {
        type = lib.types.enum [ "observe" "maintain" "admin" ];
        default = "maintain";
        description = ''
          Default privileged autonomy level granted to the always-on agent.
        '';
      };

      allowedUnits = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [
          "pi-daemon.service"
          "netbird.service"
          "nixpi-home.service"
          "nixpi-chat.service"
          "nixpi-files.service"
          "nixpi-code.service"
          "matrix-synapse.service"
          "nixpi-update.service"
        ];
        description = ''
          Systemd units that the broker may operate on.
        '';
      };

      broker.enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether the root-owned nixPI operations broker is enabled.
        '';
      };

      elevation.duration = lib.mkOption {
        type = lib.types.str;
        default = "30m";
        description = ''
          Default duration for a temporary admin elevation grant.
        '';
      };

      osUpdate.enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether the broker may apply or roll back NixOS generations.
        '';
      };
    };

    services = {
      bindAddress = lib.mkOption {
        type = lib.types.str;
        default = "0.0.0.0";
        description = ''
          Bind address used by the built-in nixPI service surface.
        '';
      };

      home = {
        enable = lib.mkEnableOption "nixPI Home service" // { default = true; };
        port = mkPortOption 8080 "TCP port for the nixPI Home landing page.";
      };

      chat = {
        enable = lib.mkEnableOption "nixPI web chat service" // { default = true; };
        port = mkPortOption 8081 "TCP port for the nixPI Chat web client.";
      };

      files = {
        enable = lib.mkEnableOption "nixPI Files service" // { default = true; };
        port = mkPortOption 5000 "TCP port for the nixPI file browser.";
      };

      code = {
        enable = lib.mkEnableOption "nixPI code-server service" // { default = true; };
        port = mkPortOption 8443 "TCP port for the nixPI browser IDE.";
      };
    };

    matrix = {
      bindAddress = lib.mkOption {
        type = lib.types.str;
        default = "0.0.0.0";
        description = ''
          Bind address used by the local Matrix homeserver listener.
        '';
      };

      port = mkPortOption 6167 "TCP port for the local Matrix homeserver.";

      enableRegistration = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether Matrix account registration is enabled.
        '';
      };

      maxUploadSize = lib.mkOption {
        type = lib.types.str;
        default = "20M";
        description = ''
          Maximum upload size accepted by the local Matrix homeserver.
        '';
      };
    };

    update = {
      onBootSec = lib.mkOption {
        type = lib.types.str;
        default = "5min";
        description = ''
          Delay before the first automatic update check after boot.
        '';
      };

      interval = lib.mkOption {
        type = lib.types.str;
        default = "6h";
        description = ''
          Recurrence interval for the automatic update timer.
        '';
      };
    };
  };
}
