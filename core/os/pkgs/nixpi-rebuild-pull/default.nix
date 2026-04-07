{ stdenvNoCC }:

stdenvNoCC.mkDerivation {
  pname = "nixpi-rebuild-pull";
  version = "0.1.0";

  dontUnpack = true;

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin"
    install -m 0755 ${../../../scripts/nixpi-rebuild-pull.sh} "$out/bin/nixpi-rebuild-pull"
    runHook postInstall
  '';
}
