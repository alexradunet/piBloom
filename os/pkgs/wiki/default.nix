{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
}:
buildNpmPackage {
  pname = "ownloom-wiki";
  version = "0.3.0";

  src = lib.cleanSourceWith {
    src = ./.;
    filter = path: _type: let
      base = baseNameOf path;
      parent = baseNameOf (dirOf path);
      forbidden = [
        "node_modules"
        "dist"
        ".vite"
      ];
    in
      !(lib.elem base forbidden || lib.elem parent forbidden || lib.hasSuffix ".sqlite" base);
  };

  npmDepsHash = "sha256-oIl8AsDmocgG6CEQeif/9c51xhgKoFFx6L4R3OsBZWc=";

  nativeBuildInputs = [makeWrapper];
  makeCacheWritable = true;

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test -- --run \
      tests/actions-meta.test.ts \
      tests/actions-meta-digest.test.ts \
      tests/actions-pages-v2.test.ts
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/ownloom-wiki $out/bin
    cp -r dist package.json README.md seed $out/share/ownloom-wiki/

    makeWrapper ${nodejs}/bin/node $out/bin/ownloom-wiki \
      --add-flags "$out/share/ownloom-wiki/dist/cli.cjs"

    runHook postInstall
  '';

  meta = {
    description = "Portable plain-Markdown LLM wiki CLI and core tools";
    license = lib.licenses.mit;
    mainProgram = "ownloom-wiki";
  };
}
