{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
  ownloom-wiki,
}:
buildNpmPackage {
  pname = "ownloom-gateway";
  version = "0.1.0";

  src = ./.;

  npmDepsHash = "sha256-wBcJGYDVDb/JE8uukjvxQsjmUKd/F4XtRgCil2jMWLY=";

  nativeBuildInputs = [makeWrapper ownloom-wiki];

  makeCacheWritable = true;
  env.PUPPETEER_SKIP_DOWNLOAD = "1";

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --ignore-scripts --no-audit --no-fund

    mkdir -p $out/share/ownloom-gateway $out/bin
    cp -r dist ui node_modules package.json $out/share/ownloom-gateway/

    makeWrapper ${nodejs}/bin/node $out/bin/ownloom-gateway \
      --add-flags "$out/share/ownloom-gateway/dist/main.js"

    runHook postInstall
  '';

  meta = {
    description = "ownloom generic transport gateway — routes WhatsApp and local API messages to a configurable agent backend";
    license = lib.licenses.mit;
    mainProgram = "ownloom-gateway";
  };
}
