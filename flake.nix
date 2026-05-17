{
  description = "DAV server service module for Nazar";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems f;
    in
    {
      nixosModules = rec {
        dav-server-service = ./nix/modules/dav-server.nix;
        dav-server-microvm = ./nix/hosts/dav-server/default.nix;
        dav-server = dav-server-microvm;
        davServer = dav-server-microvm;
        default = dav-server-microvm;
      };

      packages = forAllSystems (_system: { });
      checks = forAllSystems (_system: { });
    };
}
