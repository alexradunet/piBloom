{
  config,
  inputs,
  lib,
  pkgs,
  ...
}:
let
  exposure = import ../../fleet/exposure.nix;
  hostCode = exposure.host.code or { };
  hermes = inputs.hermes-agent.packages.${pkgs.stdenv.hostPlatform.system}.default;
in
{
  # Native NixOS OpenVSCode Server: no container, no ad-hoc npm install.
  # It runs as alex so browser terminals/editors see the same repos and can
  # launch the host-managed Hermes CLI.
  services.openvscode-server = {
    enable = hostCode.enable or false;
    user = "alex";
    group = "users";
    host = "127.0.0.1";
    port = hostCode.port or 4821;

    # Browser access is through SSH local forwarding. Keeping the connection
    # token disabled stays acceptable only while this service remains loopback.
    withoutConnectionToken = true;
    telemetryLevel = "off";

    userDataDir = "/home/alex/.openvscode-server/user-data";
    serverDataDir = "/home/alex/.openvscode-server/server-data";
    extensionsDir = "/home/alex/.openvscode-server/extensions";

    extraPackages = with pkgs; [
      bashInteractive
      coreutils
      curl
      fd
      gcc
      git
      gnumake
      gnugrep
      gnused
      gnutar
      gzip
      jq
      nil
      nix
      nixfmt
      nodejs
      openssh
      hermes
      pkg-config
      python3
      ripgrep
      unzip
      wget
      xz
    ];

    extraEnvironment = {
      NIX_CONFIG = "experimental-features = nix-command flakes";
      HERMES_HOME = "/var/lib/hermes/.hermes";
    };

    extraArguments = [ "/home/alex" ];
  };

  systemd.tmpfiles.rules = lib.mkIf (hostCode.enable or false) [
    "d /home/alex/.openvscode-server 0750 alex users - -"
    "d /home/alex/.openvscode-server/user-data 0750 alex users - -"
    "d /home/alex/.openvscode-server/server-data 0750 alex users - -"
    "d /home/alex/.openvscode-server/extensions 0750 alex users - -"
  ];

  assertions = [
    {
      assertion = !(hostCode.enable or false) || config.services.openvscode-server.host == "127.0.0.1";
      message = "OpenVSCode runs tokenless as alex; keep it bound to 127.0.0.1 and access it through SSH local forwarding.";
    }
  ];
}
