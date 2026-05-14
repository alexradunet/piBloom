# Public SSH keys that exist only on the Nazar host and are trusted for
# one-way host -> MicroVM administration. These keys are imported by the
# common MicroVM user module, not by the Nazar host user module.
[
  # alex@nazar client key; used for direct VM SSH and simple nixos-rebuild switches from the host.
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGAUXo4tVZqoDmGi1M6oTuzcXiSh+icDMnr5/N4fh2yJ alex@nazar"

  # Nazar host key; lets root on the host perform emergency VM maintenance with
  # /etc/ssh/ssh_host_ed25519_key without granting any reciprocal VM access.
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHO8D1SwnjwFVj+bz/ITvENDLeskYUd8fUb+GIxW7Lay root@nazar"
]
