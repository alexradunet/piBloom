{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.ownloom.pi;
  userName = config.ownloom.human.name;
  userHome = config.ownloom.human.homeDirectory;
  userGroup = config.users.users.${userName}.group or "users";

  extensionSources = {
    ownloom = "${config.ownloom.root}/os/pkgs/pi-adapter/extension";
  };

  desiredSettings =
    {
      inherit (cfg) packages;
      extensions = map (name: extensionSources.${name}) cfg.extensions;
      inherit (cfg) skills;
      inherit (cfg) prompts;
      inherit (cfg) themes;
    }
    // lib.optionalAttrs (cfg.enableSkillCommands != null) {
      inherit (cfg) enableSkillCommands;
    };

  desiredSettingsFile = pkgs.writeText "ownloom-pi-settings.json" (builtins.toJSON desiredSettings);
  extensionSourceChecks =
    lib.concatMapStringsSep "\n" (name: ''
      if [ ! -d ${lib.escapeShellArg extensionSources.${name}} ]; then
        echo "ownloom-pi-settings: missing PI extension source ${name}: ${extensionSources.${name}}" >&2
        echo "ownloom-pi-settings: sync the ownloom checkout before activating this host, or remove the extension from ownloom.pi.extensions." >&2
        exit 1
      fi
    '')
    cfg.extensions;
in {
  imports = [../paths/module.nix];

  options.ownloom.pi = {
    enable = lib.mkEnableOption "declarative PI resource activation for the primary user" // {default = true;};

    extensions = lib.mkOption {
      type = lib.types.listOf (lib.types.enum (builtins.attrNames extensionSources));
      default = [];
      example = ["ownloom"];
      description = ''
        Declaratively enabled PI extensions. Names map to local extension source
        directories under the ownloom checkout and are merged into
        ~/.pi/agent/settings.json during activation.
      '';
    };

    packages = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI package sources written to ~/.pi/agent/settings.json.";
    };

    skills = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI skill paths written to ~/.pi/agent/settings.json.";
    };

    prompts = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI prompt template paths written to ~/.pi/agent/settings.json.";
    };

    themes = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI theme paths written to ~/.pi/agent/settings.json.";
    };

    enableSkillCommands = lib.mkOption {
      type = lib.types.nullOr lib.types.bool;
      default = null;
      description = ''
        Optional declarative override for PI skill command registration.
        Null preserves the existing runtime/user value.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    # Expose the Synthetic API key from the NixOS sops secret to interactive Pi sessions.
    # No TypeScript extension needed for a simple file-read.
    programs.bash.interactiveShellInit = ''
      if [ -r /run/secrets/synthetic_api_key ] && [ -z "''${SYNTHETIC_API_KEY:-}" ]; then
        export SYNTHETIC_API_KEY="$(< /run/secrets/synthetic_api_key)"
      fi
    '';

    system.activationScripts.ownloom-pi-settings = lib.stringAfter ["users"] ''
      install -d -m 0755 -o ${userName} -g ${userGroup} ${lib.escapeShellArg "${userHome}/.pi/agent"}

      ${extensionSourceChecks}

      settings=${lib.escapeShellArg "${userHome}/.pi/agent/settings.json"}
      desired=${lib.escapeShellArg desiredSettingsFile}

      # Merge desired keys into existing settings.json, creating it if absent.
      # jq null-input reads desired, then slurps existing (if present) and merges.
      if [ -f "$settings" ]; then
        ${pkgs.jq}/bin/jq -s '.[0] * .[1]' "$settings" "$desired" > "$settings.tmp"
      else
        ${pkgs.jq}/bin/jq '.' "$desired" > "$settings.tmp"
      fi
      mv "$settings.tmp" "$settings"

      chown ${userName}:${userGroup} ${lib.escapeShellArg "${userHome}/.pi/agent/settings.json"}
      chmod 0644 ${lib.escapeShellArg "${userHome}/.pi/agent/settings.json"}
    '';
  };
}
