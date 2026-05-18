{ config, pkgs, ... }:
{
  # The upstream Hermes NixOS module owns
  # the hermes user, state directory, generated config, and gateway service.
  services.hermes-agent = {
    enable = true;
    addToSystemPackages = true;

    # Keep provider tokens out of the Nix store. This file may be absent during
    # the first rebuild; the upstream activation script only merges it when it
    # exists. Seed it with e.g. OPENROUTER_API_KEY=... before real use.
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
      bashInteractive
      coreutils
      curl
      fd
      git
      jq
      nix
      nixfmt
      nodejs_22
      openssh
      python3
      ripgrep
    ];
  };

  # The native module exports HERMES_HOME globally, but the shared state is
  # group-owned by hermes. Add the operator user so `hermes chat` from SSH or
  # code.nazar.studio can share the managed gateway state.
  users.users.alex.extraGroups = [ config.services.hermes-agent.group ];
}
