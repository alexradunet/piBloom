{
  stdenv,
  lib,
  glibcLocales,
  python3,
  pkgs,
  nixpiSource,
}:

let
  nixpiCalamaresHelpers = builtins.readFile ./nixpi_calamares.py;
in
stdenv.mkDerivation {
  pname = "calamares-nixos-extensions";
  version = "0.3.23-nixpi";

  src = "${pkgs.path}/pkgs/by-name/ca/calamares-nixos-extensions/src";
  nativeBuildInputs = [ python3 ];

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    cp -r "$src" source
    chmod -R u+w source

    python <<'PY'
from pathlib import Path


def replace_once(text, before, after, description):
    updated = text.replace(before, after, 1)
    if updated == text:
        raise RuntimeError(f"failed to patch {description}")
    return updated


path = Path("source/modules/nixos/main.py")
text = path.read_text()
helper_code = ${builtins.toJSON nixpiCalamaresHelpers}

text = replace_once(
    text,
    """{
  imports =
    [ # Include the results of the hardware scan.
      ./hardware-configuration.nix
    ];

""",
    """{
  imports =
    [ # Include the results of the hardware scan.
      ./hardware-configuration.nix
      ./nixpi-install.nix
    ];

""",
    "configuration imports",
)

marker = 'def env_is_set(name):\n'
text = replace_once(text, marker, helper_code + "\n\n" + marker, "NixPI helper injection")

text = replace_once(
    text,
    """    # Write the configuration.nix file
    libcalamares.utils.host_env_process_output(["cp", "/dev/stdin", config], None, cfg)
""",
    """    # Materialize the NixPI installation helpers and the standard /etc/nixos flake.
    nixpi_artifacts = write_nixpi_install_artifacts(
        root_mount_point,
        variables,
        cfg,
        libcalamares.utils.host_env_process_output,
    )

    # Write the configuration.nix file used by nixos-install itself.
    libcalamares.utils.host_env_process_output(["cp", "/dev/stdin", config], None, cfg)
""",
    "NixPI config materialization",
)

text = replace_once(
    text,
    """        [
            "nixos-install",
            "--no-root-passwd",
            "--root",
            root_mount_point,
""",
    """        [
            "nixos-install",
            "--no-root-passwd",
            "--flake",
            nixpi_artifacts["flake_install_ref"],
            "--root",
            root_mount_point,
""",
    "nixos-install flake invocation",
)

path.write_text(text)
PY

    mkdir -p "$out"/{etc,lib,share}/calamares
    cp -r source/modules "$out/lib/calamares/"
    cp -r source/config/* "$out/etc/calamares/"
    cp -r source/branding "$out/share/calamares/"

    substituteInPlace "$out/etc/calamares/settings.conf" --replace-fail @out@ "$out"
    substituteInPlace "$out/etc/calamares/modules/locale.conf" --replace-fail @glibcLocales@ "${glibcLocales}"
    substituteInPlace "$out/lib/calamares/modules/nixos/main.py" --replace-fail "@nixpiSource@" "${nixpiSource}"
    PYTHONPYCACHEPREFIX="$(mktemp -d)" python3 -m py_compile "$out/lib/calamares/modules/nixos/main.py"

    runHook postInstall
  '';

  meta = {
    description = "Calamares modules for NixPI installs on NixOS";
    homepage = "https://github.com/alexradunet/NixPI";
    license = with lib.licenses; [ mit cc-by-40 cc-by-sa-40 ];
    platforms = lib.platforms.linux;
  };
}
