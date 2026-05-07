{
  lib,
  writeShellApplication,
  coreutils,
  findutils,
  jq,
}:
writeShellApplication {
  name = "nixpi-status";

  runtimeInputs = [coreutils findutils jq];

  text = ''
        set -euo pipefail

        format="text"
        while [ "$#" -gt 0 ]; do
          case "$1" in
            --json)
              format="json"
              shift
              ;;
            --format)
              if [ "$#" -lt 2 ]; then
                echo "nixpi-status: --format requires text or json" >&2
                exit 2
              fi
              format="$2"
              shift 2
              ;;
            --help|-h)
              cat <<'EOF'
    Usage: nixpi-status [--format text|json] [--json]

    Show local NixPI runtime paths and host state.
    EOF
              exit 0
              ;;
            *)
              echo "nixpi-status: unknown argument: $1" >&2
              exit 2
              ;;
          esac
        done

        if [ "$format" != "text" ] && [ "$format" != "json" ]; then
          echo "nixpi-status: unsupported format: $format" >&2
          exit 2
        fi

        current_host="''${NIXPI_WIKI_HOST:-}"
        if [ -z "$current_host" ] && [ -r /etc/hostname ]; then
          current_host="$(tr -d '\n' < /etc/hostname)"
        fi
        if [ -z "$current_host" ]; then
          current_host="''${HOSTNAME:-nixos}"
        fi

        nixpi_root="''${NIXPI_ROOT:-''${HOME:-/tmp}/NixPI}"
        flake_dir="''${NIXPI_FLAKE_DIR:-$nixpi_root}"
        wiki_root="''${NIXPI_WIKI_ROOT:-''${HOME:-/tmp}/wiki}"
        agent_dir="''${NIXPI_AGENT_DIR:-''${PI_CODING_AGENT_DIR:-''${HOME:-/tmp}/.pi/agent}}"
        evolution_dir="$wiki_root/pages/areas/infrastructure/nixpi/evolution"

        fleet_hosts=""
        if [ -d "$nixpi_root/hosts" ]; then
          for host_dir in "$nixpi_root"/hosts/*; do
            if [ -d "$host_dir" ] && [ -f "$host_dir/default.nix" ]; then
              name="$(basename "$host_dir")"
              if [ -z "$fleet_hosts" ]; then
                fleet_hosts="$name"
              else
                fleet_hosts="$fleet_hosts, $name"
              fi
            fi
          done
        fi
        if [ -z "$fleet_hosts" ]; then
          fleet_hosts="unknown"
        fi

        fleet_membership="external"
        case ", $fleet_hosts," in
          *", $current_host,"*) fleet_membership="fleet" ;;
        esac

        if [ "$format" = "json" ]; then
          jq -n \
            --arg host "$current_host" \
            --arg fleetHosts "$fleet_hosts" \
            --arg fleetMembership "$fleet_membership" \
            --arg agentDir "$agent_dir" \
            --arg flakeDir "$flake_dir" \
            --arg wikiRoot "$wiki_root" \
            --arg evolutionDir "$evolution_dir" \
            '{ok: true, host: $host, fleetHosts: $fleetHosts, fleetMembership: $fleetMembership, agentDir: $agentDir, flakeDir: $flakeDir, wikiRoot: $wikiRoot, evolutionDir: $evolutionDir}'
          exit 0
        fi

        cat <<EOF
    NixPI runtime: active
    Host: $current_host ($fleet_membership)
    Fleet hosts: $fleet_hosts
    Agent dir: $agent_dir
    Flake dir: $flake_dir
    Wiki root: $wiki_root
    Evolution notes: $evolution_dir
    EOF
  '';

  meta = {
    description = "Show local NixPI runtime paths and host state";
    license = lib.licenses.mit;
    mainProgram = "nixpi-status";
  };
}
