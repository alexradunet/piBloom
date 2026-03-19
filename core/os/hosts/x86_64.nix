# core/os/hosts/x86_64.nix
{ lib, ... }:

{
  imports = [
    ../modules/app.nix
    ../modules/broker.nix
    ../modules/firstboot.nix
    ../modules/llm.nix
    ../modules/matrix.nix
    ../modules/network.nix
    ../modules/shell.nix
    ../modules/update.nix
  ];

  system.stateVersion = "25.05";
  nixpkgs.hostPlatform = "x86_64-linux";

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.kernelParams = [ "console=tty0" "console=ttyS0,115200" ];

  # VM dev share: mount host's ~/.nixpi into /mnt/host-nixpi via 9p virtfs.
  # Requires QEMU -virtfs flag (see justfile). nofail means this is ignored on real hardware.
  fileSystems."/mnt/host-nixpi" = {
    device = "host-nixpi";
    fsType = "9p";
    options = [ "trans=virtio" "ro" "nofail" ];
  };

  nixpkgs.config.allowUnfree = true;

  time.timeZone   = "UTC";
  i18n.defaultLocale = "en_US.UTF-8";

  virtualisation.vmVariant = {
    nixpi.primaryUser = lib.mkDefault "pi";
    nixpi.install.mode = lib.mkDefault "managed-user";
    nixpi.createPrimaryUser = lib.mkDefault true;
  };
}
