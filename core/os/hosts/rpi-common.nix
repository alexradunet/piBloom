# core/os/hosts/rpi-common.nix
# Shared NixPI profile for Raspberry Pi hosts (aarch64-linux).
{
  lib,
  config,
  ...
}:

{
  imports = [ ../modules ];

  system.stateVersion = "25.05";

  # Pi hosts use generic-extlinux-compatible via nixos-hardware.
  # systemd-boot and EFI are not used on Pi.
  boot.loader = {
    grub.enable = false;
    generic-extlinux-compatible.enable = true;
  };

  # Serial console on UART0 for headless access.
  boot.kernelParams = [
    "console=tty1"
    "console=ttyAMA0,115200"
  ];
  systemd.services."serial-getty@ttyAMA0".enable = lib.mkDefault true;

  nixpi = {
    security.ssh.passwordAuthentication = lib.mkDefault true;
    bootstrap.keepSshAfterSetup = lib.mkDefault true;
    primaryUser = lib.mkDefault "pi";
  };

  time.timeZone = config.nixpi.timezone;
  i18n.defaultLocale = "en_US.UTF-8";
  networking.networkmanager.enable = true;
  services.xserver.xkb = {
    layout = config.nixpi.keyboard;
    variant = "";
  };
  console.keyMap = config.nixpi.keyboard;
  networking.hostName = lib.mkDefault "nixpi";

  fileSystems = {
    "/" = lib.mkDefault {
      device = "/dev/disk/by-label/nixos";
      fsType = "ext4";
    };
    "/boot" = lib.mkDefault {
      device = "/dev/disk/by-label/BOOT";
      fsType = "vfat";
    };
  };
}
