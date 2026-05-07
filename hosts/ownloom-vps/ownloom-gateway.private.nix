# nixpi-gateway.private.nix — WhatsApp transport owner allowlist.
#
# This file is TRACKED with placeholder values. After cloning, replace
# the owner numbers with your real E.164 phone numbers, then run:
#
#   git update-index --skip-worktree hosts/nixpi-vps/nixpi-gateway.private.nix
#
# to keep your local edits out of commits.
#
# Phone numbers must use E.164 format (e.g. +15550001234).
_: {
  services.nixpi-gateway.settings.transports.whatsapp = {
    enable = false;
    ownerNumbers = ["+15550001234"];
    directMessagesOnly = true;
  };
}
