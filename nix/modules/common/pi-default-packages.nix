{ config, lib, pkgs, ... }:

let
  defaultPiPackages = [
    "npm:pi-subagents"
    "npm:context-mode"
    "npm:pi-web-access"
    "npm:pi-lens"
    "npm:@aliou/pi-synthetic"
  ];
  defaultPiPackagesJson = builtins.toJSON defaultPiPackages;
in
{
  # --- Layer 2: Session variable ---
  # Keeps global Pi package installs writable on NixOS. Pi's package manager
  # uses `npm install -g` for user-scoped npm packages, so point npm's global
  # prefix at alex's mutable Pi state instead of the immutable Nix profile/store.
  # See EXTENSIONS-RULE.md for the full three-layer NPM_CONFIG_PREFIX strategy.
  environment.sessionVariables.NPM_CONFIG_PREFIX = "/home/alex/.pi/npm-global";

  # Put extension CLI binaries (e.g. context-mode, pi-subagents) on PATH
  # so they can be invoked directly. Also ensures node can resolve globally-
  # installed modules via NODE_PATH.
  environment.sessionVariables.PATH = [ "/home/alex/.pi/npm-global/bin" ];
  environment.sessionVariables.NODE_PATH = "/home/alex/.pi/npm-global/lib/node_modules";

  system.activationScripts.nazar-pi-default-packages = lib.stringAfter [ "users" ] ''
    set -euo pipefail

    agent_dir=/home/alex/.pi/agent
    settings_file="$agent_dir/settings.json"
    npm_prefix=/home/alex/.pi/npm-global

    install -d -m 0755 -o alex -g users "$agent_dir" "$npm_prefix" "$npm_prefix/bin" "$npm_prefix/lib"

    # --- Layer 3: ~/.npmrc ---
    # Fallback for environments where NPM_CONFIG_PREFIX isn't available
    # (e.g. env -i, sudo -E). The session variable is the primary mechanism.
    npmrc_file=/home/alex/.npmrc
    desired_prefix_line="prefix=/home/alex/.pi/npm-global"
    if [ -f "$npmrc_file" ]; then
      if ! grep -qFx "$desired_prefix_line" "$npmrc_file"; then
        sed -i '/^prefix=/d' "$npmrc_file"
        echo "$desired_prefix_line" >> "$npmrc_file"
      fi
    else
      printf '%s\n' "$desired_prefix_line" > "$npmrc_file"
      chown alex:users "$npmrc_file"
    fi

    # --- Pi agent default packages ---
    # Merge default packages into settings.json, preserving any user-added entries.
    # Uses jq instead of embedded Python for simplicity.
    if [ -f "$settings_file" ] && [ -s "$settings_file" ]; then
      ${pkgs.jq}/bin/jq --argjson defaults '${defaultPiPackagesJson}' \
        '.packages = ((.packages // []) + $defaults | unique)' \
        "$settings_file" > "$settings_file.tmp" \
        && mv "$settings_file.tmp" "$settings_file"
    else
      printf '{"packages":%s}\n' '${defaultPiPackagesJson}' > "$settings_file"
    fi

    if [ -e "$settings_file" ]; then
      chown alex:users "$settings_file"
    fi
  '';
}
