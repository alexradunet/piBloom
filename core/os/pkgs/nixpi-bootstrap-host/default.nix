{
  pkgs,
  lib,
  makeWrapper,
  nixpiDefaultInput ? "github:alexradunet/nixpi",
}:

pkgs.stdenvNoCC.mkDerivation {
  pname = "nixpi-bootstrap-host";
  version = "0.1.0";

  dontUnpack = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/bin" "$out/share/nixpi-bootstrap-host/lib"
    install -m 0755 ${../../../scripts/nixpi-bootstrap-host.sh} "$out/share/nixpi-bootstrap-host/nixpi-bootstrap-host.sh"
    install -m 0644 ${../../../scripts/lib/bootstrap-utils.sh} "$out/share/nixpi-bootstrap-host/lib/bootstrap-utils.sh"
    install -m 0644 ${../../../scripts/lib/bootstrap-keys.sh} "$out/share/nixpi-bootstrap-host/lib/bootstrap-keys.sh"
    install -m 0644 ${../../../scripts/lib/bootstrap-validation.sh} "$out/share/nixpi-bootstrap-host/lib/bootstrap-validation.sh"
    install -m 0644 ${../../../scripts/lib/bootstrap-files.sh} "$out/share/nixpi-bootstrap-host/lib/bootstrap-files.sh"

    makeWrapper ${pkgs.bash}/bin/bash "$out/bin/nixpi-bootstrap-host" \
      --set NIXPI_DEFAULT_INPUT "${nixpiDefaultInput}" \
      --prefix PATH : "${lib.makeBinPath [ pkgs.coreutils pkgs.nix pkgs.openssl ]}" \
      --add-flags "$out/share/nixpi-bootstrap-host/nixpi-bootstrap-host.sh"

    runHook postInstall
  '';

  meta.mainProgram = "nixpi-bootstrap-host";
}
