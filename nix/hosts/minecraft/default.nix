{ pkgs, ... }:
{
  imports = [
    ../../modules/minecraft-papermc.nix
    ../../modules/minecraft-web.nix
  ];

  # VM 110 is deployed from the generated qcow2 image on a single legacy-BIOS
  # VirtIO disk. Keep the normal rebuild target aligned with that installed
  # shape so `nixos-rebuild switch --target-host ...` remains reproducible.
  boot.loader.grub = {
    enable = true;
    device = "/dev/vda";
  };
  boot.growPartition = true;
  boot.kernelParams = [ "console=ttyS0" ];
  boot.initrd.availableKernelModules = [
    "virtio_pci"
    "virtio_blk"
    "virtio_scsi"
    "sd_mod"
    "sr_mod"
  ];

  fileSystems."/" = {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
    options = [
      "x-systemd.growfs"
      "x-initrd.mount"
    ];
  };

  swapDevices = [ ];

  services.qemuGuest.enable = true;
  services.fstrim.enable = true;

  environment.systemPackages = [
    pkgs.nodejs
  ];

  system.stateVersion = "26.05";
}
