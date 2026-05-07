{
  lib,
  writeShellApplication,
  coreutils,
  findutils,
  gawk,
  git,
  gnugrep,
  gnused,
  jq,
}:
writeShellApplication {
  name = "nixpi-audit";

  runtimeInputs = [
    coreutils
    findutils
    gawk
    git
    gnugrep
    gnused
    jq
  ];

  text = ''
        set -euo pipefail

        usage() {
          cat <<'EOF'
    Usage: nixpi-audit [--domain technical] [--write-report] [--capture-source] [--json]

    Compare the technical wiki baseline against implemented NixPI config.
    EOF
        }

        domain="technical"
        write_report=0
        capture_source=0
        json=0

        while [ "$#" -gt 0 ]; do
          case "$1" in
            --domain)
              domain="''${2:-}"
              shift 2
              ;;
            --write-report)
              write_report=1
              shift
              ;;
            --capture-source)
              capture_source=1
              shift
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
              echo "nixpi-audit: unknown argument: $1" >&2
              usage >&2
              exit 2
              ;;
          esac
        done

        if [ "$domain" != "technical" ]; then
          echo "nixpi-audit: only technical domain is supported" >&2
          exit 2
        fi

        repo_root="''${NIXPI_FLAKE_DIR:-''${NIXPI_ROOT:-''${HOME:-/tmp}/NixPI}}"
        wiki_root="''${NIXPI_WIKI_ROOT:-''${HOME:-/tmp}/wiki}"
        generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        generated_day="''${generated_at%%T*}"

        cd "$repo_root" || {
          echo "nixpi-audit: could not cd to $repo_root" >&2
          exit 1
        }

        flake_hosts="$(grep -oE '[A-Za-z0-9_-]+[[:space:]]*=[[:space:]]*mkHost[[:space:]]+\./hosts/' flake.nix 2>/dev/null | sed -E 's/[[:space:]]*=.*//' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
        pi_extensions=""
        if [ -f fleet/alex.nix ]; then
          pi_extensions="$(awk '/pi\.extensions[[:space:]]*=/, /];/' fleet/alex.nix | grep -oE '"[^"]+"' | tr -d '"' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"
        fi

        issues_file="$(mktemp)"
        report_file="$(mktemp)"
        trap 'rm -f "$issues_file" "$report_file"' EXIT

        add_issue() {
          printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$issues_file"
        }

        page_has_id() {
          local id="$1"
          grep -R -l -F -x -- "id: $id" "$wiki_root"/objects "$wiki_root"/pages 2>/dev/null | head -1 | grep -q .
        }

        for host in $flake_hosts; do
          if ! page_has_id "host/$host"; then
            add_issue error missing-host-page "$host" "flake host output $host has no wiki page with id host/$host"
          fi
        done

        for stale in host/vps-nixos service/syncthing tool/nixpi-permissions project/personal-second-brain host/evo-nixos host/nixpi-mini-pc; do
          if grep -R -F -- "$stale" "$wiki_root"/objects "$wiki_root"/pages 2>/dev/null | grep -q .; then
            add_issue error stale-identity "$stale" "stale technical wiki identity still appears in current pages"
          fi
        done

        for stale_path in \
          pages/resources/technical/vps-nixos.md \
          pages/resources/technical/syncthing.md \
          pages/technical/nixpi-permissions.md \
          pages/projects/personal-second-brain/index.md; do
          if [ -f "$wiki_root/$stale_path" ]; then
            add_issue error stale-page "$stale_path" "stale page should not exist in the fresh technical baseline"
          fi
        done

        vps_config="$repo_root/hosts/nixpi-vps/default.nix"
        if [ -f "$vps_config" ]; then
          if grep -Pzo 'nixpi-gateway\s*=\s*\{[\s\S]*?enable\s*=\s*true;' "$vps_config" >/dev/null 2>&1 && ! page_has_id service/nixpi-gateway; then
            add_issue error missing-service-page nixpi-gateway "NixPI Gateway is enabled in nixpi-vps but service/nixpi-gateway is missing"
          fi
          if ! grep -q 'nixpi-wiki-health-snapshot' "$vps_config"; then
            add_issue warning missing-health-snapshot-timer nixpi-wiki-health-snapshot "nixpi-vps should declare a read-only wiki memory health snapshot timer"
          fi
        fi

        if [ -n "$pi_extensions" ]; then
          nixpi_page="$(grep -R -l -F -x -- 'id: tool/nixpi' "$wiki_root"/objects "$wiki_root"/pages 2>/dev/null | head -1 || true)"
          for extension in $pi_extensions; do
            if [ -n "$nixpi_page" ] && ! grep -q -F -- "$extension" "$nixpi_page"; then
              add_issue warning pi-extension-doc-drift "$extension" "fleet/alex.nix declares $extension, but the nixpi tool page does not mention it"
            fi
          done
        fi

        issue_count="$(wc -l < "$issues_file" | tr -d ' ')"
        error_count="$(awk -F '\t' '$1 == "error" { n++ } END { print n + 0 }' "$issues_file")"
        ok="true"
        if [ "$error_count" -gt 0 ]; then ok="false"; fi

        {
          printf '# NixPI Current-State Audit — %s\n\n' "$generated_day"
          printf 'Status: %s\n' "$([ "$ok" = true ] && echo ok || echo review)"
          printf "%s \`%s\`\n" "Repo root:" "$repo_root"
          printf "%s \`%s\`\n\n" "Wiki root:" "$wiki_root"
          printf '## Flake hosts\n\n'
          for host in $flake_hosts; do printf -- '- %s\n' "$host"; done
          [ -n "$flake_hosts" ] || printf -- '- none\n'
          printf '\n## Pi extensions\n\n'
          for extension in $pi_extensions; do printf -- '- %s\n' "$extension"; done
          [ -n "$pi_extensions" ] || printf -- '- none\n'
          printf '\n## Checks\n\n'
          if [ "$issue_count" -eq 0 ]; then
            printf -- '- No current-state audit issues found.\n'
          else
            awk -F '\t' '{ printf "- **%s** [%s] %s — %s\n", $1, $2, $3, $4 }' "$issues_file"
          fi
        } > "$report_file"

        report_path=""
        if [ "$write_report" -eq 1 ]; then
          report_path="meta/reports/current-state-audit-$generated_day.md"
          mkdir -p "$wiki_root/meta/reports"
          cp "$report_file" "$wiki_root/$report_path"
        fi

        capture_path=""
        if [ "$capture_source" -eq 1 ]; then
          capture_path="sources/other/current-state-audit-$generated_day.md"
          mkdir -p "$wiki_root/sources/other"
          cp "$report_file" "$wiki_root/$capture_path"
        fi

        text="Current-state audit: $([ "$ok" = true ] && echo ok || echo review)
    Flake hosts: ''${flake_hosts:-none}
    Pi extensions: ''${pi_extensions:-none}
    Issues: $issue_count"
        if [ -n "$report_path" ]; then text="$text
    Report: $report_path"; fi
        if [ -n "$capture_path" ]; then text="$text
    Captured: $capture_path"; fi
        if [ "$issue_count" -gt 0 ]; then
          issue_lines="$(awk -F '\t' '{ printf "- %s [%s] %s: %s\n", $1, $2, $3, $4 }' "$issues_file")"
          text="$text
    $issue_lines"
        fi

        if [ "$json" -eq 1 ]; then
          issues_json="$(jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {severity: .[0], kind: .[1], subject: .[2], message: .[3]})' "$issues_file")"
          jq -n \
            --arg text "$text" \
            --arg generatedAt "$generated_at" \
            --arg repoRoot "$repo_root" \
            --arg wikiRoot "$wiki_root" \
            --arg flakeHosts "$flake_hosts" \
            --arg piExtensions "$pi_extensions" \
            --arg reportPath "$report_path" \
            --arg capturePath "$capture_path" \
            --argjson ok "$ok" \
            --argjson issues "$issues_json" \
            '{text: $text, details: {ok: $ok, generatedAt: $generatedAt, repoRoot: $repoRoot, wikiRoot: $wikiRoot, flakeHosts: ($flakeHosts | split(" ") | map(select(length > 0))), piExtensions: ($piExtensions | split(" ") | map(select(length > 0))), issues: $issues} + (if $reportPath != "" then {reportPath: $reportPath} else {} end) + (if $capturePath != "" then {capturePath: $capturePath} else {} end)}'
        else
          printf '%s\n' "$text"
        fi
  '';

  meta = {
    description = "Compare technical wiki baseline against implemented NixPI config";
    license = lib.licenses.mit;
    mainProgram = "nixpi-audit";
  };
}
