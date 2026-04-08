# core/os/hosts/ovh-vps.nix
# OVH-oriented VPS profile for destructive nixos-anywhere installs that land
# directly on the final host configuration.
{ lib, config, modulesPath, ... }:

{
  imports = [
    ./vps.nix
    (modulesPath + "/profiles/qemu-guest.nix")
  ];

  networking.hostName = lib.mkOverride 900 "ovh-vps";

  # Default operator user for fresh installs. Override with --bootstrap-user.
  nixpi.primaryUser = lib.mkDefault "human";
  # Allow password login so the operator can reach the box after nixos-anywhere.
  # Temporary password is "changeMe123#@!"; replace with SSH keys once in.
  nixpi.security.ssh.passwordAuthentication = lib.mkOverride 900 true;
  users.users.${config.nixpi.primaryUser}.initialHashedPassword = lib.mkDefault "$6$1EKv4qt2If9iwJSE$4bY8JTN0./tQz2pdeiPhEDixGncvqAkPQolMjWos3EN/6.pXoVuaRjc6.6QaaLN8zhsdi4rAaP9XJXps6b2rQ1";

  boot.loader = {
    systemd-boot.enable = lib.mkForce false;
    efi.canTouchEfiVariables = lib.mkForce false;
    grub = {
      enable = true;
      efiSupport = true;
      efiInstallAsRemovable = true;
      device = "nodev";
    };
  };

  services.qemuGuest.enable = lib.mkDefault true;
}
