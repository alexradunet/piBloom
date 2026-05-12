{
  config,
  inputs,
  lib,
  pkgs,
  ...
}:
let
  llmAgents = inputs.llm-agents.packages.${pkgs.stdenv.hostPlatform.system};
in
{
  services.hermes-agent = {
    enable = true;
    package = llmAgents.hermes-agent;
    addToSystemPackages = true;
    stateDir = "/var/lib/hermes";
    workingDirectory = "/srv/nazar/hermes-workspace";
    environmentFiles = [ "/var/lib/hermes/env" ];
    settings = {
      model.default = "anthropic/claude-sonnet-4";
      toolsets = [ "all" ];
      terminal = {
        backend = "local";
        timeout = 180;
      };
      memory = {
        memory_enabled = true;
        user_profile_enabled = true;
      };
    };
    extraPackages = with pkgs; [
      git
      jq
      ripgrep
      rsync
      openssh
    ];
  };

  users.users.alex.extraGroups = [ "hermes" ];

  systemd.services.hermes-agent.unitConfig.ConditionFileNotEmpty = "/var/lib/hermes/env";

  systemd.tmpfiles.rules = [
    "d /var/lib/hermes 0750 hermes hermes - -"
    "f /var/lib/hermes/env 0600 hermes hermes - -"
    "d /srv/nazar/hermes-workspace 0770 hermes hermes - -"
  ];

  system.activationScripts.hermes-env-placeholder = lib.stringAfter [ "users" ] ''
    install -d -m 0750 -o hermes -g hermes /var/lib/hermes
    if [ ! -e /var/lib/hermes/env ]; then
      install -m 0600 -o hermes -g hermes /dev/null /var/lib/hermes/env
    fi
  '';
}
