{
  description = "Nazar NixOS host services";

  nixConfig = {
    extra-substituters = [ "https://cache.numtide.com" ];
    extra-trusted-public-keys = [ "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g=" ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    hermes-agent.url = "github:NousResearch/hermes-agent";

    # Keep llm-agents on its pinned nixpkgs so Numtide's binary cache hits and
    # agent packages do not need to rebuild against the host nixpkgs input.
    llm-agents.url = "github:numtide/llm-agents.nix";

    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      ...
    }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      fleet = import ./nix/fleet/services.nix;

      nixosModules = rec {
        nazar = ./nix/hosts/nazar;
        alex-laptop = ./nix/hosts/alex-laptop;
        default = nazar;
      };

      mkNixosSystem =
        module:
        nixpkgs.lib.nixosSystem {
          inherit system;
          specialArgs = {
            inherit inputs fleet;
          };
          modules = [ module ];
        };

      mkSwitchProgram =
        name:
        pkgs.writeShellApplication {
          name = "nazar-switch-${name}";
          runtimeInputs = [
            pkgs.nixos-rebuild
            pkgs.systemd
          ];
          text = ''
            set -euo pipefail

            if [ "$EUID" -ne 0 ]; then
              exec sudo "$0" "$@"
            fi

            if [ "''${NAZAR_SWITCH_SYSTEMD_RUN:-0}" != "1" ] && grep -Eq 'hermes-agent\.service' /proc/self/cgroup; then
              unit="nazar-switch-${name}-$(date +%s)"
              echo "==> detected agent service context; continuing rebuild in transient systemd unit $unit"
              exec systemd-run \
                --unit="$unit" \
                --collect \
                --wait \
                --pipe \
                --property=Type=exec \
                --working-directory="$(pwd -P)" \
                --setenv=NAZAR_SWITCH_SYSTEMD_RUN=1 \
                "$0" "$@"
            fi

            nixos-rebuild switch --flake ${self.outPath}#nazar "$@"
          '';
        };
      mkSwitchApp = name: description: {
        type = "app";
        program = "${mkSwitchProgram name}/bin/nazar-switch-${name}";
        meta.description = description;
      };
    in
    {
      inherit nixosModules;

      nixosConfigurations = {
        nazar = mkNixosSystem nixosModules.nazar;
        alex-laptop = mkNixosSystem nixosModules.alex-laptop;
      };

      packages.${system} = {
        hermes-agent = inputs.hermes-agent.packages.${system}.default;
      };

      apps.${system} = {
        default = mkSwitchApp "host" "Switch the Nazar host configuration";
        switch = mkSwitchApp "host" "Switch the Nazar host configuration";
        switch-host = mkSwitchApp "host" "Switch the Nazar host configuration";
      };

      checks.${system} = {
        dav-server-module-eval = pkgs.runCommand "dav-server-module-eval" { } ''
          mkdir -p $out
          echo ${toString (mkNixosSystem ./nix/modules/host/dav-server.nix).config.services.radicale.enable} > $out/radicale-enabled
        '';
      };

      devShells.${system} = {
        default = pkgs.mkShell {
          packages = [ pkgs.nixos-rebuild ];
        };
      };

      formatter.${system} = pkgs.writeShellApplication {
        name = "nazar-fmt";
        runtimeInputs = [
          pkgs.findutils
          pkgs.nixfmt
        ];
        text = ''
          find flake.nix nix -type f -name '*.nix' -print0 \
            | xargs -0 --no-run-if-empty nixfmt
        '';
      };
    };
}
