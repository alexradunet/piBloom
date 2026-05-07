{
  config,
  lib,
  ...
}: let
  cfg = config.ownloom;
in {
  imports = [
    (lib.mkRenamedOptionModule ["ownloom" "user"] ["ownloom" "human"])
  ];

  config.environment.sessionVariables = {
    OWNLOOM_ROOT = cfg.root;
    OWNLOOM_WIKI_ROOT = cfg.wiki.root;
    OWNLOOM_WIKI_WORKSPACE = cfg.wiki.workspace;
    OWNLOOM_WIKI_DEFAULT_DOMAIN = cfg.wiki.defaultDomain;
    OWNLOOM_WIKI_HOST = config.networking.hostName;
  };

  options.ownloom.plannerEnvVars = lib.mkOption {
    type = lib.types.attrsOf lib.types.str;
    default = {};
    description = ''Planner environment variables for injection into Pi service environments.  Set by service-planner when the planner is enabled.'';
  };

  options.ownloom = {
    role = lib.mkOption {
      type = lib.types.enum ["common" "server" "workstation" "laptop"];
      default = "common";
      description = ''
        High-level ownloom role for this host. Role modules set this for
        diagnostics, assertions, documentation, and generated context.
      '';
    };

    human = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "human";
        description = ''
          Primary human/operator username for ownloom services and user-scoped paths.
          Hosts may override this to a real local account name such as "alex".
        '';
        example = "alex";
      };

      homeDirectory = lib.mkOption {
        type = lib.types.str;
        default = "/home/${cfg.human.name}";
        defaultText = lib.literalExpression ''"/home/${config.ownloom.human.name}"'';
        description = ''
          Home directory of the primary human/operator ownloom user.
          Defaults to /home/<ownloom.human.name>.
        '';
        example = "/home/alex";
      };
    };

    owner = {
      displayName = lib.mkOption {
        type = lib.types.str;
        default = "Human Operator";
        description = "Human-readable owner/operator name used for account descriptions and identity defaults.";
        example = "Alex";
      };

      email = lib.mkOption {
        type = lib.types.str;
        default = "";
        description = "Optional owner/operator email address for tools that need a contact identity.";
        example = "human@example.com";
      };

      sshKeys = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "SSH public keys for the owner/operator. The primary user uses these by default.";
      };
    };

    root = lib.mkOption {
      type = lib.types.str;
      default = "${cfg.human.homeDirectory}/ownloom";
      description = ''
        Absolute path to the ownloom root directory.
        All other ownloom.* paths derive from this by default.
        Change this to relocate the entire ownloom workspace.
      '';
      example = "/home/your-user/ownloom";
    };

    repos = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = {
        ownloom = cfg.root;
        os = "${cfg.root}/os";
      };
      defaultText = lib.literalExpression ''
        {
          ownloom = config.ownloom.root;
          os = "''${config.ownloom.root}/os";
        }
      '';
      description = ''
        Attribute set of absolute paths to ownloom source trees.
        Defaults derive from the root monorepo checkout.
      '';
    };

    config = lib.mkOption {
      type = lib.types.str;
      default = cfg.root;
      defaultText = lib.literalExpression "config.ownloom.root";
      description = ''
        Absolute path to the fleet configuration flake.
        This is the flake ref base for nixos-rebuild switch.
      '';
    };

    wiki = {
      root = lib.mkOption {
        type = lib.types.str;
        default = "${cfg.human.homeDirectory}/wiki";
        defaultText = lib.literalExpression ''"''${config.ownloom.human.homeDirectory}/wiki"'';
        description = ''
          Absolute path to the single Markdown wiki root. Technical and personal
          are frontmatter domains inside this root, not separate vaults.
        '';
      };

      workspace = lib.mkOption {
        type = lib.types.str;
        default = "ownloom";
        description = ''
          Wiki workspace name passed to Pi sessions and wiki tools.
        '';
      };

      defaultDomain = lib.mkOption {
        type = lib.types.str;
        default = "technical";
        description = ''
          Default wiki domain for tools when no domain is specified.
        '';
      };
    };
  };
}
