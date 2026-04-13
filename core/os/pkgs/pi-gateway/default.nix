{ lib, buildNpmPackage, nodejs, makeWrapper }:

buildNpmPackage {
  pname = "nixpi-gateway";
  version = "0.1.0";

  src = ../../../../Agents/pi-gateway;

  npmDepsHash = "sha256-OKIdhcdwwLiKAssUbUAT///A7tIJnmhiJ5oQdD9eXAk=";

  nativeBuildInputs = [ makeWrapper ];

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/nixpi-gateway $out/bin
    cp -r dist node_modules package.json $out/share/nixpi-gateway/

    makeWrapper ${nodejs}/bin/node $out/bin/nixpi-gateway \
      --add-flags "$out/share/nixpi-gateway/dist/main.js"

    runHook postInstall
  '';

  meta = {
    description = "NixPI generic transport gateway";
    license = lib.licenses.mit;
    mainProgram = "nixpi-gateway";
  };
}
