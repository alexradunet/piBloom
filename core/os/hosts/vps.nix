# core/os/hosts/vps.nix
# Canonical NixPI headless VPS profile used for the default installed system shape.
{ lib, config, ... }:

{
  imports = [
    ../modules
  ];

  system.stateVersion = "25.05";

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.kernelParams = [ "console=ttyS0,115200" ];
  systemd.services."serial-getty@ttyS0".enable = lib.mkDefault true;

  nixpi.primaryUser = lib.mkDefault "human";
  nixpi.bootstrap.keepSshAfterSetup = lib.mkDefault true;
  nixpi.security.ssh.passwordAuthentication = lib.mkDefault false;

  networking.hostName = lib.mkDefault "nixpi";
  networking.networkmanager.enable = true;
  time.timeZone = config.nixpi.timezone;
  i18n.defaultLocale = "en_US.UTF-8";
  console.keyMap = config.nixpi.keyboard;

  fileSystems."/" = lib.mkDefault {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
  };

  fileSystems."/boot" = lib.mkDefault {
    device = "/dev/disk/by-label/boot";
    fsType = "vfat";
  };
}
