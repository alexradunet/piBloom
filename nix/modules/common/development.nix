{ pkgs, ... }:
{
  # Global interactive/build tooling for Nazar-managed NixOS machines.
  # Keep this in the OS profile rather than only in flake devShells so admins
  # and VM-local agents have the same baseline tools after login/rebuild.
  environment.systemPackages = with pkgs; [
    cmake
    gcc
    gnumake
    nodejs # includes npm
    pkg-config
    python3
    unzip
  ];
}
