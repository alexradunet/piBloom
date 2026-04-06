# core/os/modules/app.nix
{ pkgs, lib, config, appPackage, ... }:

let
  primaryUser = config.nixpi.primaryUser;
  primaryHome = "/home/${primaryUser}";
  stateDir = config.nixpi.stateDir;
  agentStateDir = "${primaryHome}/.pi";
  piCommand = pkgs.writeShellScriptBin "pi" ''
    export PI_SKIP_VERSION_CHECK=1
    export PATH="${lib.makeBinPath [ pkgs.fd pkgs.ripgrep ]}:$PATH"
    exec ${appPackage}/share/nixpi/node_modules/.bin/pi "$@"
  '';
  defaultSettings = pkgs.writeText "pi-settings.json"
    (builtins.toJSON { packages = config.nixpi.agent.packagePaths; });
in

{
  imports = [ ./options.nix ];

  environment.systemPackages = [ appPackage piCommand ];

  systemd.tmpfiles.settings.nixpi-app = {
    "/usr/local/share/nixpi"."L+" = { argument = "${appPackage}/share/nixpi"; };
    "/etc/nixpi/appservices".d = { mode = "0755"; user = "root"; group = "root"; };
    "${stateDir}".d = { mode = "0770"; user = primaryUser; group = primaryUser; };
    "${stateDir}/services".d = { mode = "0770"; user = primaryUser; group = primaryUser; };
  };

  system.services.nixpi-chat = {
    imports = [ (lib.modules.importApply ../services/nixpi-chat.nix { inherit pkgs; }) ];
    nixpi-chat = {
      package = appPackage;
      inherit primaryUser agentStateDir;
      workspaceDir = config.nixpi.agent.workspaceDir;
    };
  };

  systemd.services.nixpi-app-setup = {
    description = "NixPI app setup: create agent state dir and seed default settings";
    wantedBy = [ "multi-user.target" ];
    after = [ "systemd-tmpfiles-setup.service" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      User = "root";
      ExecStart = "${pkgs.writeShellScript "nixpi-app-setup" ''
        primary_group="$(id -gn ${primaryUser})"

        install -d -m 0700 -o ${primaryUser} -g "$primary_group" ${agentStateDir}

        if [ ! -e ${agentStateDir}/settings.json ]; then
          install -m 0600 -o ${primaryUser} -g "$primary_group" ${defaultSettings} ${agentStateDir}/settings.json
        fi

        chown -R ${primaryUser}:"$primary_group" ${agentStateDir}
        chmod 0700 ${agentStateDir}
      ''}";
    };
  };

}
