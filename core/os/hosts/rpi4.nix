# core/os/hosts/rpi4.nix
# NixPI profile for Raspberry Pi 4 (BCM2711, aarch64-linux).
# The nixos-hardware module (raspberry-pi-4) is imported in flake.nix.
_: {
  imports = [ ./rpi-common.nix ];
}
