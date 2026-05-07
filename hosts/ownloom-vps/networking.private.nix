# networking.private.nix — VPS WAN address and gateway.
#
# This file is TRACKED with placeholder values from RFC 5737 TEST-NET-3.
# After cloning, replace these with your VPS provider's real IPv4 address
# and gateway, then run:
#
#   git update-index --skip-worktree hosts/nixpi-vps/networking.private.nix
#
# to keep your local edits out of commits.
_: {
  systemd.network.networks."10-wan" = {
    address = ["203.0.113.10/26"];
    routes = [
      {
        Gateway = "203.0.113.1";
      }
    ];
  };
}
