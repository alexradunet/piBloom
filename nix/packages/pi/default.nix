{
  lib,
  buildNpmPackage,
  fetchurl,
  fd,
  makeWrapper,
  ripgrep,
  runCommand,
}:

let
  versionData = lib.importJSON ./hashes.json;
  version = versionData.version;

  srcWithLock = runCommand "pi-src-with-lock" { } ''
    mkdir -p $out
    tar -xzf ${
      fetchurl {
        url = "https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-${version}.tgz";
        hash = versionData.sourceHash;
      }
    } -C $out --strip-components=1
    cp ${./package-lock.json} $out/package-lock.json
  '';
in
buildNpmPackage {
  npmDepsFetcherVersion = 2;
  inherit version;
  pname = "pi";

  src = srcWithLock;

  npmDepsHash = versionData.npmDepsHash;
  makeCacheWritable = true;

  nativeBuildInputs = [ makeWrapper ];

  # The package from npm is already built.
  dontNpmBuild = true;

  postInstall = ''
    wrapProgram $out/bin/pi \
      --prefix PATH : ${
        lib.makeBinPath [
          fd
          ripgrep
        ]
      } \
      --run 'export NPM_CONFIG_PREFIX="''${NPM_CONFIG_PREFIX:-$HOME/.pi/npm-global}"' \
      --run 'mkdir -p "$NPM_CONFIG_PREFIX" 2>/dev/null || true' \
      --set PI_SKIP_VERSION_CHECK 1 \
      --set PI_TELEMETRY 0
  '';

  passthru.category = "AI Coding Agents";

  meta = {
    description = "A terminal-based coding agent with multi-model support";
    homepage = "https://github.com/badlogic/pi-mono";
    changelog = "https://github.com/badlogic/pi-mono/releases";
    license = lib.licenses.mit;
    sourceProvenance = with lib.sourceTypes; [ binaryBytecode ];
    maintainers = with lib.maintainers; [ aos ];
    platforms = lib.platforms.all;
    mainProgram = "pi";
  };
}
