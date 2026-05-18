{
  inputs,
  lib,
  pkgs,
  ...
}:
let
  exposure = import ../../fleet/exposure.nix;
  webui = exposure.host.hermesWebui or { };

  enable = webui.enable or false;
  port = webui.port or 8787;
  stateDir = "/var/lib/hermes/webui";
  envFile = "/var/lib/hermes/webui-env";

  hermesAgent = inputs.hermes-agent.packages.${pkgs.stdenv.hostPlatform.system}.default;
  hermesWebui = pkgs.stdenvNoCC.mkDerivation {
    pname = "hermes-webui";
    version = "e6be01c4dd84a5f2a146adc3727f0e458508dc13";

    src = pkgs.fetchFromGitHub {
      owner = "nesquena";
      repo = "hermes-webui";
      rev = "e6be01c4dd84a5f2a146adc3727f0e458508dc13";
      hash = "sha256-crMdPf2yYJajOOvqiuAydGvigwItft90IjSqXFMEVDk=";
    };

    installPhase = ''
      runHook preInstall
      mkdir -p $out/share/hermes-webui
      cp -R . $out/share/hermes-webui
      runHook postInstall
    '';
  };

  launcher = pkgs.writeShellApplication {
    name = "hermes-webui";
    runtimeInputs = [
      hermesAgent
      pkgs.coreutils
      pkgs.gnused
    ];
    text = ''
      set -euo pipefail

      hermes_python="$(${pkgs.gnused}/bin/sed -n "s/^export HERMES_PYTHON='\(.*\)'$/\1/p" "${hermesAgent}/bin/hermes" | ${pkgs.coreutils}/bin/head -n1)"
      if [ -z "$hermes_python" ] || [ ! -x "$hermes_python" ]; then
        echo "Could not discover Hermes Agent Python interpreter from ${hermesAgent}/bin/hermes" >&2
        exit 1
      fi

      agent_dir="$($hermes_python - <<'PY'
      import pathlib
      import run_agent

      print(pathlib.Path(run_agent.__file__).parent)
      PY
      )"

      export HERMES_WEBUI_AGENT_DIR="$agent_dir"
      export HERMES_WEBUI_PYTHON="$hermes_python"
      exec "$hermes_python" "${hermesWebui}/share/hermes-webui/server.py"
    '';
  };

  passwordCheck = pkgs.writeShellScript "hermes-webui-password-check" ''
    set -euo pipefail
    if [ ! -r ${lib.escapeShellArg envFile} ]; then
      echo "Missing ${envFile}; refusing to expose Hermes WebUI without password protection." >&2
      echo "Create it with: sudo install -m 0600 -o alex -g users /dev/stdin ${envFile}" >&2
      exit 1
    fi
    if ! grep -Eq '^HERMES_WEBUI_PASSWORD=.+$' ${lib.escapeShellArg envFile}; then
      echo "${envFile} must contain a non-empty HERMES_WEBUI_PASSWORD=... entry." >&2
      exit 1
    fi
  '';
in
{
  systemd.services.hermes-webui = lib.mkIf enable {
    description = "Hermes WebUI";
    wantedBy = [ "multi-user.target" ];
    wants = [
      "hermes-agent.service"
      "network-online.target"
    ];
    after = [
      "network-online.target"
      "hermes-agent.service"
    ];

    environment = {
      HOME = "/var/lib/hermes";
      HERMES_HOME = "/var/lib/hermes/.hermes";
      HERMES_CONFIG_PATH = "/var/lib/hermes/.hermes/config.yaml";
      HERMES_WEBUI_HOST = "127.0.0.1";
      HERMES_WEBUI_PORT = toString port;
      HERMES_WEBUI_STATE_DIR = stateDir;
      HERMES_WEBUI_DEFAULT_WORKSPACE = "/var/lib/hermes/workspace";
      HERMES_WEBUI_SKIP_ONBOARDING = "1";
      PYTHONUNBUFFERED = "1";
    };

    path = with pkgs; [
      bashInteractive
      coreutils
      curl
      fd
      git
      hermesAgent
      jq
      nix
      nixfmt
      nodejs_22
      openssh
      ripgrep
    ];

    serviceConfig = {
      Type = "simple";
      User = "alex";
      Group = "users";
      WorkingDirectory = "${hermesWebui}/share/hermes-webui";
      EnvironmentFile = envFile;
      ExecStartPre = passwordCheck;
      ExecStart = "${launcher}/bin/hermes-webui";
      Restart = "on-failure";
      RestartSec = "5s";

      NoNewPrivileges = true;
      PrivateTmp = true;
      ProtectSystem = "strict";
      ReadWritePaths = [
        "/var/lib/hermes"
        "/home/alex"
      ];
      StateDirectory = [ "hermes/webui" ];
      StateDirectoryMode = "0750";
      UMask = "0077";
    };
  };

  systemd.tmpfiles.rules = lib.mkIf enable [
    "d /var/lib/hermes 0750 alex users - -"
    "d ${stateDir} 0750 alex users - -"
    "d /var/lib/hermes/workspace 0750 alex users - -"
    "z ${stateDir} 0750 alex users - -"
    "z /var/lib/hermes/workspace 0750 alex users - -"
  ];
}
