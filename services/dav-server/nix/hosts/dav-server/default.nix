{
  imports = [
    ../../modules/dav-server.nix
  ];

  # Legacy guest module for compatibility/local experiments. Nazar production
  # now imports the service module directly on the host; this repository owns
  # only DAV service behavior.
  system.stateVersion = "26.05";
}
