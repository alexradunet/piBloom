{ pkgs, ... }:
let
  humanAdminKeys = import ../../users/admin-keys.nix;
  nazarMicrovmAdminKeys = import ../../users/nazar-microvm-admin-keys.nix;
  adminKeys = humanAdminKeys ++ nazarMicrovmAdminKeys;
in
{
  # VM users are declarative and immutable. `alex` is the canonical human
  # administrator on every NixOS VM; root remains key-only for current
  # compatibility and break-glass administration.
  users.mutableUsers = false;

  users.users.root = {
    openssh.authorizedKeys.keys = adminKeys;
    hashedPassword = "!";  # Root is key-only, no password
  };

  users.users.alex = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = adminKeys;
    # Normal VM access is key-only. Future console break-glass passwords, if
    # ever needed, must be unique per VM and delivered through encrypted secret
    # material, not plaintext Nix or git.
    hashedPassword = "!";
  };

  security.sudo.wheelNeedsPassword = false;

  systemd.tmpfiles.rules = [
    # Keep the VM admin home owned by alex even when child virtiofs mounts
    # are created early. OpenSSH StrictModes checks the home directory before
    # accepting declarative /etc/ssh/authorized_keys.d keys.
    "d /home/alex 0750 alex users - -"
    "d /var/lib/nazar 0755 root root -"
  ];

  assertions = [
    {
      assertion = nazarMicrovmAdminKeys != [ ];
      message = "MicroVMs must trust at least one Nazar-host-only SSH key for one-way host -> VM administration.";
    }
  ];
}
