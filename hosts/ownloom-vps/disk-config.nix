{lib, ...}: {
  disko.devices = {
    disk = lib.genAttrs ["a" "b"] (name: {
      type = "disk";
      device =
        if name == "a"
        then "/dev/disk/by-id/nvme-SAMSUNG_MZVL2512HCJQ-00B00_S675NX0T505998"
        else "/dev/disk/by-id/nvme-SAMSUNG_MZVL2512HCJQ-00B00_S675NX0T505978";
      content = {
        type = "gpt";
        partitions = {
          boot = {
            size = "1M";
            type = "EF02";
          };
          md-boot = {
            size = "1G";
            content = {
              type = "mdraid";
              name = "boot";
            };
          };
          md-root = {
            size = "100%";
            content = {
              type = "mdraid";
              name = "root";
            };
          };
        };
      };
    });

    mdadm = {
      boot = {
        type = "mdadm";
        level = 1;
        metadata = "1.0";
        content = {
          type = "filesystem";
          format = "ext4";
          extraArgs = [
            "-L"
            "boot"
          ];
          mountpoint = "/boot";
        };
      };

      root = {
        type = "mdadm";
        level = 1;
        content = {
          type = "filesystem";
          format = "ext4";
          extraArgs = [
            "-L"
            "nixos"
          ];
          mountpoint = "/";
        };
      };
    };
  };
}
