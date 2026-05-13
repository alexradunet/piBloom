{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs,
}:

let
  package = lib.importJSON ../../../package.json;
in
buildNpmPackage {
  pname = "nixpi";
  inherit (package) version;

  src = lib.cleanSource ../../..;

  npmDepsFetcherVersion = 2;
  npmDepsHash = "sha256-/K3qF5esJjbaImI2fHMdGLIWfnVof79hAKT7Qi6ulxo=";

  nativeBuildInputs = [ makeWrapper ];

  dontNpmBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/nixpi $out/bin
    cp -R \
      package.json \
      package-lock.json \
      server.js \
      public \
      bin \
      node_modules \
      $out/lib/nixpi/

    chmod +x $out/lib/nixpi/bin/nixpi.js
    makeWrapper ${nodejs}/bin/node $out/bin/nixpi \
      --add-flags $out/lib/nixpi/bin/nixpi.js

    runHook postInstall
  '';

  passthru.category = "AI Coding Agents";

  meta = {
    description = "Private web interface for Pi Coding Agent";
    homepage = "https://git.nazar.studio/nazar/nixpi";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
    mainProgram = "nixpi";
  };
}
