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
    environmentFiles = [ config.sops.secrets."hermes-env".path ];
    settings = {
      model = {
        provider = "custom";
        default = "hf:MiniMaxAI/MiniMax-M2.5";
        base_url = "https://api.synthetic.new/openai/v1";
        api_key = "\${SYNTHETIC_API_KEY}";
      };
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

  sops.secrets."hermes-env" = {
    sopsFile = ../../sops/nazar.yaml;
    owner = "hermes";
    group = "hermes";
    mode = "0400";
  };

  systemd.services.hermes-agent.unitConfig.ConditionFileNotEmpty =
    config.sops.secrets."hermes-env".path;

  systemd.tmpfiles.rules = [
    "d /var/lib/hermes 0750 hermes hermes - -"
    "d /srv/nazar/hermes-workspace 0770 hermes hermes - -"
  ];
}
