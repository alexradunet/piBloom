{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.nixpi.gateway;
  signalCfg = cfg.modules.signal;
  gatewayPackage = pkgs.callPackage ../pkgs/pi-gateway { };
  signalCliDataDir = "${signalCfg.stateDir}/signal-cli-data";
  gatewayConfig = pkgs.writeText "nixpi-gateway.yml" (
    lib.generators.toYAML { } {
      gateway = {
        dbPath = "${cfg.stateDir}/gateway.db";
        piSessionDir = "${cfg.stateDir}/pi-sessions";
        maxReplyChars = cfg.maxReplyChars;
        maxReplyChunks = cfg.maxReplyChunks;
      };
      pi.cwd = cfg.piCwd;
      modules = lib.optionalAttrs signalCfg.enable {
        signal = {
          enabled = true;
          account = signalCfg.account;
          httpUrl = "http://127.0.0.1:${toString signalCfg.port}";
          allowedNumbers = signalCfg.allowedNumbers;
          adminNumbers = signalCfg.adminNumbers;
          directMessagesOnly = signalCfg.directMessagesOnly;
        };
      };
    }
  );
  bootstrapMode = if config.nixpi.bootstrap.enable then "bootstrap" else "steady";
  defaultPiSettings = pkgs.writeText "nixpi-gateway-settings.json" (
    builtins.toJSON {
      packages = config.nixpi.agent.packagePaths;
      shellPath = "${pkgs.bash}/bin/bash";
    }
  );
  defaultAgentSettings = pkgs.writeText "nixpi-gateway-agent-settings.json" (
    builtins.toJSON {
      packages = cfg.packagePaths;
      extensions = cfg.extensionPaths;
      defaultProvider = cfg.defaultProvider;
      defaultModel = cfg.defaultModel;
    }
  );
  waitForSignalDaemon = pkgs.writeShellScript "nixpi-gateway-wait-for-signal" ''
    set -euo pipefail

    for _ in $(seq 1 30); do
      if ${pkgs.curl}/bin/curl -fsS http://127.0.0.1:${toString signalCfg.port}/api/v1/check >/dev/null; then
        exit 0
      fi
      sleep 1
    done

    echo "signal module transport did not become healthy in time" >&2
    exit 1
  '';
  setupScript = pkgs.writeShellScript "nixpi-gateway-setup" ''
    set -euo pipefail

    install -d -m 0700 -o ${cfg.user} -g ${cfg.group} \
      ${cfg.stateDir} \
      ${cfg.stateDir}/pi-sessions \
      ${cfg.stateDir}/tmp \
      ${signalCfg.stateDir} \
      ${signalCliDataDir} \
      ${cfg.agentDir} \
      ${cfg.agentDir}/agent

    migrate_legacy_state() {
      local legacy_dir="$1"
      [ -d "$legacy_dir" ] || return 0

      if [ -d "$legacy_dir/signal-cli-data" ] \
        && [ ! -e ${signalCliDataDir}/accounts.json ] \
        && [ ! -e ${signalCliDataDir}/data/accounts.json ]; then
        cp -a "$legacy_dir/signal-cli-data/." ${signalCliDataDir}/
      fi

      if [ -d "$legacy_dir/pi-sessions" ] && [ ! -e ${cfg.stateDir}/pi-sessions/.migrated-from-legacy ]; then
        cp -a "$legacy_dir/pi-sessions/." ${cfg.stateDir}/pi-sessions/
        touch ${cfg.stateDir}/pi-sessions/.migrated-from-legacy
      fi

      for dbFile in gateway.db gateway.db-shm gateway.db-wal; do
        if [ -e "$legacy_dir/$dbFile" ] && [ ! -e ${cfg.stateDir}/$dbFile ]; then
          cp -a "$legacy_dir/$dbFile" ${cfg.stateDir}/$dbFile
        fi
      done
    }

    if [ ! -e ${cfg.stateDir}/.migrated-from-legacy ]; then
      migrate_legacy_state ${lib.escapeShellArg cfg.legacyStateDir}
      migrate_legacy_state ${lib.escapeShellArg cfg.legacyRootStateDir}
      touch ${cfg.stateDir}/.migrated-from-legacy
    fi

    if [ -d ${lib.escapeShellArg cfg.legacyAgentDir} ] && [ ! -e ${cfg.agentDir}/.migrated-from-legacy-agent ]; then
      if [ -f ${lib.escapeShellArg cfg.legacyAgentDir}/auth.json ] && [ ! -e ${cfg.agentDir}/auth.json ]; then
        install -m 0600 -o ${cfg.user} -g ${cfg.group} ${lib.escapeShellArg cfg.legacyAgentDir}/auth.json ${cfg.agentDir}/auth.json
      fi

      if [ -f ${lib.escapeShellArg cfg.legacyAgentDir}/settings.json ] && [ ! -e ${cfg.agentDir}/settings.json ]; then
        install -m 0644 -o ${cfg.user} -g ${cfg.group} ${lib.escapeShellArg cfg.legacyAgentDir}/settings.json ${cfg.agentDir}/settings.json
      fi

      if [ -f ${lib.escapeShellArg cfg.legacyAgentDir}/agent/settings.json ] && [ ! -e ${cfg.agentDir}/agent/settings.json ]; then
        install -m 0644 -o ${cfg.user} -g ${cfg.group} ${lib.escapeShellArg cfg.legacyAgentDir}/agent/settings.json ${cfg.agentDir}/agent/settings.json
      fi

      if [ -d ${lib.escapeShellArg cfg.legacyAgentDir}/agent/extensions ] && [ ! -e ${cfg.agentDir}/agent/extensions ]; then
        cp -a ${lib.escapeShellArg cfg.legacyAgentDir}/agent/extensions ${cfg.agentDir}/agent/extensions
      fi

      if [ -d ${lib.escapeShellArg cfg.legacyAgentDir}/agent/local-packages ] && [ ! -e ${cfg.agentDir}/agent/local-packages ]; then
        cp -a ${lib.escapeShellArg cfg.legacyAgentDir}/agent/local-packages ${cfg.agentDir}/agent/local-packages
      fi

      touch ${cfg.agentDir}/.migrated-from-legacy-agent
    fi

    if [ ! -e ${cfg.agentDir}/.seeded-from-source-agent ]; then
      if [ -f ${lib.escapeShellArg cfg.sourceAgentDir}/auth.json ] && [ ! -e ${cfg.agentDir}/auth.json ]; then
        install -m 0600 -o ${cfg.user} -g ${cfg.group} ${lib.escapeShellArg cfg.sourceAgentDir}/auth.json ${cfg.agentDir}/auth.json
      fi

      if [ -d ${lib.escapeShellArg cfg.sourceAgentDir}/agent/extensions ] && [ ! -e ${cfg.agentDir}/agent/extensions ]; then
        cp -a ${lib.escapeShellArg cfg.sourceAgentDir}/agent/extensions ${cfg.agentDir}/agent/extensions
      fi

      if [ -d ${lib.escapeShellArg cfg.sourceAgentDir}/agent/local-packages ] && [ ! -e ${cfg.agentDir}/agent/local-packages ]; then
        cp -a ${lib.escapeShellArg cfg.sourceAgentDir}/agent/local-packages ${cfg.agentDir}/agent/local-packages
      fi

      touch ${cfg.agentDir}/.seeded-from-source-agent
    fi

    install -m 0644 -o ${cfg.user} -g ${cfg.group} ${defaultPiSettings} ${cfg.agentDir}/settings.json
    install -m 0644 -o ${cfg.user} -g ${cfg.group} ${defaultAgentSettings} ${cfg.agentDir}/agent/settings.json

    if [ -e ${cfg.agentDir}/auth.json ]; then
      ln -sfn ../auth.json ${cfg.agentDir}/agent/auth.json
    else
      rm -f ${cfg.agentDir}/agent/auth.json
    fi

    ${pkgs.acl}/bin/setfacl -m u:${cfg.user}:--x,m::--x ${lib.escapeShellArg config.nixpi.stateDir}
    ${pkgs.acl}/bin/setfacl -m u:${cfg.user}:--x,m::--x ${lib.escapeShellArg cfg.homeTraversePath}
    ${pkgs.acl}/bin/setfacl -R -m u:${cfg.user}:rwX,m::rwX ${lib.escapeShellArg cfg.workspaceDir}
    ${pkgs.acl}/bin/setfacl -R -m d:u:${cfg.user}:rwX,d:m::rwX ${lib.escapeShellArg cfg.workspaceDir}

    chown -R ${cfg.user}:${cfg.group} ${cfg.stateDir} ${cfg.agentDir}
  '';
in
{
  imports = [ ./options.nix ];

  config = lib.mkIf (cfg.enable && signalCfg.enable) {
    assertions = [
      {
        assertion = signalCfg.account != "";
        message = "nixpi.gateway.modules.signal.account must not be empty when the Signal module is enabled.";
      }
      {
        assertion = signalCfg.allowedNumbers != [ ];
        message = "nixpi.gateway.modules.signal.allowedNumbers must not be empty when the Signal module is enabled.";
      }
      {
        assertion = signalCfg.adminNumbers != [ ];
        message = "nixpi.gateway.modules.signal.adminNumbers must not be empty when the Signal module is enabled.";
      }
    ];

    users.groups.${cfg.group} = { };
    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.agentDir;
      createHome = false;
      description = "NixPI gateway service account";
    };

    environment.systemPackages = [ gatewayPackage pkgs.signal-cli ];

    systemd.tmpfiles.settings.nixpi-gateway = {
      "${cfg.stateDir}".d = {
        mode = "0700";
        user = cfg.user;
        group = cfg.group;
      };
      "${cfg.stateDir}/pi-sessions".d = {
        mode = "0700";
        user = cfg.user;
        group = cfg.group;
      };
      "${cfg.stateDir}/tmp".d = {
        mode = "0700";
        user = cfg.user;
        group = cfg.group;
      };
      "${signalCfg.stateDir}".d = {
        mode = "0700";
        user = cfg.user;
        group = cfg.group;
      };
      "${signalCliDataDir}".d = {
        mode = "0700";
        user = cfg.user;
        group = cfg.group;
      };
      "${cfg.agentDir}".d = {
        mode = "0700";
        user = cfg.user;
        group = cfg.group;
      };
      "${cfg.agentDir}/agent".d = {
        mode = "0700";
        user = cfg.user;
        group = cfg.group;
      };
    };

    systemd.services.nixpi-gateway-setup = {
      description = "NixPI gateway setup and migration";
      wantedBy = [ "multi-user.target" ];
      before = [ "nixpi-signal-daemon.service" "nixpi-gateway.service" ];
      after = [ "systemd-tmpfiles-setup.service" "nixpi-app-setup.service" ];
      requires = [ "nixpi-app-setup.service" ];
      aliases = [ "nixpi-signal-gateway-setup.service" ];
      serviceConfig = {
        Type = "oneshot";
        User = "root";
        Group = "root";
        RemainAfterExit = true;
        ExecStart = setupScript;
      };
      restartTriggers = [ gatewayConfig defaultPiSettings defaultAgentSettings ];
    };

    systemd.services.nixpi-signal-daemon = {
      description = "NixPI Signal transport daemon";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" "nixpi-gateway-setup.service" ];
      wants = [ "network-online.target" "nixpi-gateway-setup.service" ];
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = signalCfg.stateDir;
        ExecStart = lib.escapeShellArgs [
          "${pkgs.signal-cli}/bin/signal-cli"
          "--config"
          signalCliDataDir
          "-a"
          signalCfg.account
          "daemon"
          "--http"
          "127.0.0.1:${toString signalCfg.port}"
          "--receive-mode"
          "on-start"
          "--ignore-attachments"
        ];
        Restart = "on-failure";
        RestartSec = 3;
      };
    };

    systemd.services.nixpi-gateway = {
      description = "NixPI gateway";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" "nixpi-signal-daemon.service" "nixpi-gateway-setup.service" ];
      wants = [ "network-online.target" "nixpi-signal-daemon.service" "nixpi-gateway-setup.service" ];
      aliases = [ "nixpi-signal-gateway.service" ];
      restartTriggers = [ defaultPiSettings defaultAgentSettings gatewayConfig ];
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.agentDir;
        ExecStartPre = waitForSignalDaemon;
        ExecStart = lib.escapeShellArgs [ "${gatewayPackage}/bin/nixpi-gateway" gatewayConfig ];
        Restart = "on-failure";
        RestartSec = 3;
        Environment = [
          "HOME=${cfg.agentDir}"
          "PI_CODING_AGENT_DIR=${cfg.agentDir}"
          "NIXPI_PI_DIR=${cfg.agentDir}"
          "NIXPI_DIR=${cfg.workspaceDir}"
          "NIXPI_STATE_DIR=${config.nixpi.stateDir}"
          "NIXPI_BOOTSTRAP_MODE=${bootstrapMode}"
        ];
      };
    };
  };
}
