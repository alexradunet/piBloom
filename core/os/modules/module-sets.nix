{
  nixpiBaseNoShell = [
    ./options.nix
    ./network.nix
    ./update.nix
  ];

  nixpiBase = [
    ./options.nix
    ./network.nix
    ./update.nix
    ./shell.nix
  ];

  nixpiNoShell = [
    ./options.nix
    ./network.nix
    ./update.nix
    ./runtime.nix
    ./collab.nix
    ./tooling.nix
    ./ttyd.nix
    ./setup-apply.nix
  ];

  nixpi = [
    ./options.nix
    ./network.nix
    ./update.nix
    ./runtime.nix
    ./collab.nix
    ./tooling.nix
    ./shell.nix
    ./ttyd.nix
    ./setup-apply.nix
  ];
}
