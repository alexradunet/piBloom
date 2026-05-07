{
  lib,
  writeShellApplication,
  coreutils,
  gnused,
  jq,
}:
writeShellApplication {
  name = "nixpi-evolution";

  runtimeInputs = [coreutils gnused jq];

  text = ''
        set -euo pipefail

        usage() {
          cat <<'EOF'
    Usage: nixpi-evolution --title <title> [--summary <text>] [--area <area>] [--risk <risk>] [--status <status>] [--json]

    Create or resolve a NixPI evolution note under the technical wiki.
    EOF
        }

        title=""
        summary=""
        area="system"
        risk="medium"
        status="proposed"
        json=0

        while [ "$#" -gt 0 ]; do
          case "$1" in
            --title)
              title="''${2:-}"
              shift 2
              ;;
            --summary)
              summary="''${2:-}"
              shift 2
              ;;
            --area)
              area="''${2:-}"
              shift 2
              ;;
            --risk)
              risk="''${2:-}"
              shift 2
              ;;
            --status)
              status="''${2:-}"
              shift 2
              ;;
            --json)
              json=1
              shift
              ;;
            --help|-h)
              usage
              exit 0
              ;;
            *)
              echo "nixpi-evolution: unknown argument: $1" >&2
              usage >&2
              exit 2
              ;;
          esac
        done

        if [ -z "$title" ]; then
          echo "nixpi-evolution: --title is required" >&2
          exit 2
        fi

        case "$area" in wiki|persona|extensions|services|system) ;; *) echo "nixpi-evolution: invalid area: $area" >&2; exit 2 ;; esac
        case "$risk" in low|medium|high) ;; *) echo "nixpi-evolution: invalid risk: $risk" >&2; exit 2 ;; esac
        case "$status" in proposed|planning|implementing|validating|reviewing|applied|rejected) ;; *) echo "nixpi-evolution: invalid status: $status" >&2; exit 2 ;; esac

        nixpi_root="''${NIXPI_ROOT:-''${HOME:-/tmp}/NixPI}"
        wiki_root="''${NIXPI_WIKI_ROOT:-''${HOME:-/tmp}/wiki}"
        evolution_dir="$wiki_root/pages/areas/infrastructure/nixpi/evolution"
        slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"
        if [ -z "$slug" ]; then
          echo "nixpi-evolution: title does not produce a usable slug" >&2
          exit 2
        fi

        path="$evolution_dir/$slug.md"
        if [ ! -f "$path" ] && [ -d "$evolution_dir" ]; then
          existing="$(grep -R -l -F -x -- "title: $title" "$evolution_dir"/*.md 2>/dev/null | head -1 || true)"
          if [ -n "$existing" ]; then
            path="$existing"
          fi
        fi

        created=false
        if [ ! -f "$path" ]; then
          created=true
          date="$(date +%F)"
          if [ -z "$summary" ]; then
            summary="$title — NixPI evolution note."
          fi
          mkdir -p "$evolution_dir"
          tmp="$path.tmp-$$"
          cat > "$tmp" <<EOF
    ---
    id: evolution/nixpi-$slug
    schema_version: 1
    type: evolution
    object_type: evolution
    title: $title
    tags: [nixpi, evolution]
    domain: technical
    areas: [ai, infrastructure]
    status: $status
    risk: $risk
    area: $area
    validation_level: working
    summary: $summary
    created: $date
    updated: $date
    ---

    # $title

    ## Motivation

    ## Plan

    ## Validation

    ## Rollout

    ## Rollback

    ## Linked files
    EOF
          mv "$tmp" "$path"
        fi

        if [ "$json" -eq 1 ]; then
          jq -n --arg path "$path" --argjson created "$created" '{ok: true, created: $created, path: $path}'
        else
          if [ "$created" = true ]; then
            printf 'Created evolution note: %s\n' "$path"
          else
            printf 'Resolved evolution note: %s\n' "$path"
          fi
        fi
  '';

  meta = {
    description = "Create or resolve a NixPI evolution note";
    license = lib.licenses.mit;
    mainProgram = "nixpi-evolution";
  };
}
