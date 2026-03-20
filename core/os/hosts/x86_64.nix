# core/os/hosts/x86_64.nix
# Canonical NixPI desktop profile used for dev builds and the installed system shape.
{ lib, self, ... }:

{
  imports = [
    self.nixosModules.nixpi
    self.nixosModules.firstboot
  ];

  system.stateVersion = "25.05";
  nixpkgs.hostPlatform = "x86_64-linux";

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.kernelParams = [ "console=tty0" "console=ttyS0,115200" ];

  nixpkgs.config.allowUnfree = true;

  nixpi.primaryUser = lib.mkDefault "pi";
  nixpi.install.mode = lib.mkDefault "managed-user";
  nixpi.createPrimaryUser = lib.mkDefault true;

  time.timeZone = "UTC";
  i18n.defaultLocale = "en_US.UTF-8";
  networking.networkmanager.enable = true;
  services.xserver.xkb = { layout = "us"; variant = ""; };
  console.keyMap = "us";
  networking.hostName = lib.mkDefault "nixpi";
  fileSystems."/" = lib.mkDefault {
    device = "/dev/vda";
    fsType = "ext4";
  };
  fileSystems."/boot" = lib.mkDefault {
    device = "/dev/vda1";
    fsType = "vfat";
  };
}
