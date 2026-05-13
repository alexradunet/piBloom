{
  description = "NixPi web interface for Pi Coding Agent";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems f;
    in
    {
      overlays.default = final: _prev: {
        nixpi = final.callPackage ./nix/packages/nixpi { };
      };

      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ self.overlays.default ];
          };
        in
        {
          inherit (pkgs) nixpi;
          default = pkgs.nixpi;
        });

      nixosModules = rec {
        nixpi = ./nix/modules/nixpi.nix;
        default = nixpi;
      };

      checks = forAllSystems (system: {
        inherit (self.packages.${system}) nixpi;
      });
    };
}
