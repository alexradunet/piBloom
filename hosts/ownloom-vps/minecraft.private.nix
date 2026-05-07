# minecraft.private.nix — Minecraft whitelist (player names + UUIDs).
#
# This file is TRACKED with placeholder values. After cloning, replace
# the whitelist entries with your real players (from https://mcuuid.net),
# then run:
#
#   git update-index --skip-worktree hosts/nixpi-vps/minecraft.private.nix
#
# to keep your local edits out of commits.
_: {
  services.minecraft-server.whitelist = {
    # Example = "00000000-0000-0000-0000-000000000000";
  };
}
