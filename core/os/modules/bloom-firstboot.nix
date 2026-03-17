# core/os/modules/bloom-firstboot.nix
{ config, pkgs, ... }:

{
  systemd.services.bloom-firstboot = {
    description = "Bloom First-Boot Setup";
    wantedBy = [ "multi-user.target" ];
    # getty.target blocks all console logins until this completes.
    # Individual getty@ttyN instances may not be in the transaction;
    # targeting getty.target is the reliable way to block all of them.
    before = [ "getty.target" ];
    after = [
      "network-online.target"
      "bloom-matrix.service"
      "netbird.service"
      "user@1000.service"
    ];
    wants = [
      "network-online.target"
      "bloom-matrix.service"
      "netbird.service"
      "user@1000.service"
    ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      User = "pi";
      ExecStart = "${pkgs.bash}/bin/bash ${./bloom-firstboot.sh}";
      StandardOutput = "journal+console";
      # systemctl --user needs XDG_RUNTIME_DIR to reach the user bus socket.
      # This env var is not set automatically for system services running as a
      # non-root user outside a PAM login session. UID 1000 is deterministic
      # for the first normal user in NixOS (same rationale as bloom_prefill).
      Environment = "XDG_RUNTIME_DIR=/run/user/1000";
      # Exit 1 = non-fatal partial failure; user can recover via bloom-wizard.sh.
      SuccessExitStatus = "0 1";
    };
    unitConfig.ConditionPathExists = "!/home/pi/.bloom/.setup-complete";
  };

  # Narrow sudo rules for commands bloom-firstboot.sh needs in a non-TTY context.
  # NOTE: bloom-shell.nix already grants pi full NOPASSWD sudo, making these rules
  # currently redundant. They are kept for future hardening documentation.
  security.sudo.extraRules = [
    {
      users = [ "pi" ];
      commands = [
        { command = "/run/current-system/sw/bin/cat /var/lib/continuwuity/registration_token"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/journalctl -u bloom-matrix --no-pager"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/netbird up --setup-key *"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl start netbird.service"; options = [ "NOPASSWD" ]; }
      ];
    }
  ];

  # Enable linger for pi via tmpfiles to avoid polkit dependency at runtime.
  # Writing /var/lib/systemd/linger/pi directly achieves the same effect as
  # `loginctl enable-linger pi` without requiring a PAM/polkit context.
  systemd.tmpfiles.rules = [ "f+ /var/lib/systemd/linger/pi - - - -" ];
}
