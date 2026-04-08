{ lib, ... }:

let
  absolutePath = lib.types.pathWith { absolute = true; };
in
{
  options.nixpi = {
    primaryUser = lib.mkOption {
      type = lib.types.str;
      default = "pi";
      description = ''
        Primary human/operator account for the NixPI machine.
      '';
    };

    allowPrimaryUserChange = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Allow a one-time intentional change to `nixpi.primaryUser` on an
        already-activated system. When false, NixPI aborts activation before
        user management if the configured primary user drifts from the recorded
        operator account.
      '';
    };

    stateDir = lib.mkOption {
      type = absolutePath;
      default = "/var/lib/nixpi";
      description = ''
        Root directory for service-owned NixPI state.
      '';
    };

    timezone = lib.mkOption {
      type = lib.types.str;
      default = "UTC";
      description = ''
        System timezone. Any valid IANA timezone string (e.g. "Europe/Paris").
        Set interactively by the first-boot setup wizard.
      '';
    };

    keyboard = lib.mkOption {
      type = lib.types.str;
      default = "us";
      description = ''
        Console and X keyboard layout (e.g. "fr", "de", "us").
        Set interactively by the first-boot setup wizard.
      '';
    };

    flake = lib.mkOption {
      type = lib.types.str;
      default = "/etc/nixos#nixos";
      description = ''
        Flake URI for this NixPI system. Used by auto-upgrade and the broker's
        default rebuild target.
      '';
    };
  };
}
