{ config, lib, pkgs, ... }:

let
  defaultPiPackages = [
    "npm:pi-subagents"
    "npm:context-mode"
    "npm:pi-web-access"
    "npm:@plannotator/pi-extension"
    "npm:pi-lens"
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
    # Write the npm prefix into the user npmrc so `npm install -g` works even
    # when NPM_CONFIG_PREFIX isn't in the environment (e.g. env -i, sudo -E).
    # This is the last-resort fallback in the three-layer strategy.
    npmrc_file=/home/alex/.npmrc
    desired_prefix_line="prefix=/home/alex/.pi/npm-global"
    if [ -f "$npmrc_file" ]; then
      if ! grep -qFx "$desired_prefix_line" "$npmrc_file"; then
        # Remove any existing prefix line and append the correct one
        sed -i '/^prefix=/d' "$npmrc_file"
        echo "$desired_prefix_line" >> "$npmrc_file"
      fi
    else
      printf '%s\n' "$desired_prefix_line" > "$npmrc_file"
      chown alex:users "$npmrc_file"
    fi

    ${pkgs.python3}/bin/python3 - "$settings_file" '${defaultPiPackagesJson}' <<'PY'
import json
import os
import sys

settings_path = sys.argv[1]
default_packages = json.loads(sys.argv[2])

settings = {}
if os.path.exists(settings_path) and os.path.getsize(settings_path) > 0:
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            loaded = json.load(f)
        if isinstance(loaded, dict):
            settings = loaded
        else:
            print(f"warning: {settings_path} is not a JSON object; leaving unchanged", file=sys.stderr)
            sys.exit(0)
    except json.JSONDecodeError as exc:
        print(f"warning: cannot parse {settings_path}: {exc}; leaving unchanged", file=sys.stderr)
        sys.exit(0)

packages = settings.get("packages")
if not isinstance(packages, list):
    packages = []

seen = set()
for entry in packages:
    if isinstance(entry, str):
        seen.add(entry)
    elif isinstance(entry, dict) and isinstance(entry.get("source"), str):
        seen.add(entry["source"])

changed = False
for package in default_packages:
    if package not in seen:
        packages.append(package)
        seen.add(package)
        changed = True

if changed or settings.get("packages") is not packages:
    settings["packages"] = packages
    tmp_path = settings_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    os.replace(tmp_path, settings_path)
PY

    if [ -e "$settings_file" ]; then
      chown alex:users "$settings_file"
    fi
  '';
}
