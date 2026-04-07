# core/os/hosts/rpi5.nix
# NixPI profile for Raspberry Pi 5 (BCM2712, aarch64-linux).
# The nixos-hardware module (raspberry-pi-5) is imported in flake.nix.
_: {
  imports = [ ./rpi-common.nix ];
}
