# core/os/hosts/x86_64-vm.nix
# Local VM/dev host that layers VM-specific mounts on top of the standard desktop profile.
{ ... }:

{
  imports = [ ./x86_64.nix ];

  # VM dev share: mount host's ~/.nixpi into /mnt/host-nixpi via 9p virtfs.
  # Requires QEMU -virtfs flag (see justfile). nofail means this is ignored on real hardware.
  fileSystems."/mnt/host-nixpi" = {
    device = "host-nixpi";
    fsType = "9p";
    options = [ "trans=virtio" "ro" "nofail" ];
  };
}
