{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.ownloom-code-server;
  humanHome = config.ownloom.human.homeDirectory;
in {
  imports = [
    ../paths/module.nix
  ];

  options.services.ownloom-code-server = {
    enable = lib.mkEnableOption "code-server web IDE for ownloom";

    user = lib.mkOption {
      type = lib.types.str;
      default = config.ownloom.human.name;
      defaultText = lib.literalExpression "config.ownloom.human.name";
      description = "User account that runs code-server. Defaults to the primary ownloom human.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "users";
      description = "Group for the code-server service.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Host to bind code-server to. Defaults to loopback — access via SSH tunnel.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 4444;
      description = "Port code-server listens on.";
    };

    hashedPassword = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = ''
        Argon2id hashed password for code-server auth.
        Generate with: echo -n 'mypassword' | nix run nixpkgs#libargon2 -- "$(head -c 20 /dev/random | base64)" -e
        Leave empty to use the NixOS module default (random password or none).
      '';
    };

    extensions = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = with pkgs.vscode-extensions; [
        jnoortheen.nix-ide
        bbenoist.nix
      ];
      defaultText = lib.literalExpression ''with pkgs.vscode-extensions; [ jnoortheen.nix-ide bbenoist.nix ];'';
      description = "VS Code extensions to pre-install. Nix IDE support included by default.";
    };

    extraPackages = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = [];
      description = "Additional packages to add to code-server PATH.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.host == "127.0.0.1" || cfg.host == "::1";
        message = "services.ownloom-code-server.host must stay loopback-only (access via SSH tunnel).";
      }
    ];

    services.code-server = {
      enable = true;
      inherit (cfg) user port hashedPassword group host;

      # Run as the primary ownloom user so code-server can access home directory files.
      extraGroups = [];

      auth = lib.mkIf (cfg.hashedPassword != "") "password";

      package = pkgs.vscode-with-extensions.override {
        vscode = pkgs.code-server;
        vscodeExtensions = cfg.extensions;
      };

      extraPackages = with pkgs;
        [
          bash-completion
          coreutils
          curl
          fd
          git
          gnugrep
          jq
          nh
          nixos-rebuild
          nodejs
          python3
          ripgrep
          tree
          unzip
          wget
        ]
        ++ cfg.extraPackages;

      extraEnvironment = {
        NIX_PATH = "nixpkgs=${pkgs.path}";
      };

      userDataDir = "${humanHome}/.code-server/user-data";

      disableTelemetry = true;
      disableUpdateCheck = true;
      disableGettingStartedOverride = true;

      extraArguments = [
        "--disable-workspace-trust"
      ];
    };

    # Ensure the data directories exist with correct ownership.
    systemd.services.code-server.serviceConfig = {
      WorkingDirectory = config.ownloom.root;
    };
  };
}
