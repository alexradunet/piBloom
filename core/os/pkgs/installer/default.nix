{ pkgs, python3, makeWrapper, nixpiSource }:

pkgs.stdenvNoCC.mkDerivation {
  pname = "nixpi-installer";
  version = "0.1.0";

  dontUnpack = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/bin" "$out/share/nixpi-installer"
    install -m 0644 ${./nixpi-install-module.nix.in} "$out/share/nixpi-installer/nixpi-install-module.nix.in"
    install -m 0644 ${./nixpi_installer.py} "$out/share/nixpi-installer/nixpi_installer.py"

    substituteInPlace "$out/share/nixpi-installer/nixpi_installer.py" \
      --replace-fail "@nixpiSource@" "${nixpiSource}" \
      --replace-fail "@nixpiInstallModuleTemplate@" "$out/share/nixpi-installer/nixpi-install-module.nix.in"

    chmod 0755 "$out/share/nixpi-installer/nixpi_installer.py"
    makeWrapper ${python3}/bin/python3 "$out/bin/nixpi-installer" \
      --add-flags "$out/share/nixpi-installer/nixpi_installer.py"

    PYTHONPYCACHEPREFIX="$(mktemp -d)" ${python3}/bin/python3 -m py_compile "$out/share/nixpi-installer/nixpi_installer.py"

    runHook postInstall
  '';
}
