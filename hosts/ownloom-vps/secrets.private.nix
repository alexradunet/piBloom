# secrets.private.nix — code-server password (argon2 hash).
#
# This file is TRACKED with a placeholder hash. After cloning, replace it
# with a real argon2 hash, then run:
#
#   git update-index --skip-worktree hosts/nixpi-vps/secrets.private.nix
#
# to keep your local edits out of commits.
#
# Generate a hash:
#   echo -n 'password' | nix run nixpkgs#libargon2 -- "$(head -c 20 /dev/random | base64)" -e
_: {
  services.nixpi-code-server.hashedPassword = "$argon2i$v=19$m=4096,t=3,p=1$REPLACE_WITH_REAL_SALT$REPLACE_WITH_REAL_HASH";
}
