{
  fleet,
  inputs,
  lib,
  pkgs,
  ...
}:
let
  commonGuestModules = [
    inputs.microvm.nixosModules.microvm
    inputs.sops-nix.nixosModules.sops
    ../common/base.nix
    ../common/users.nix
    ../common/security.nix
    ../common/development.nix
    ../common/sops.nix
    ../common/nazar-context.nix
    ../common/git-ssh.nix
    ./microvm-guest.nix
  ];

  # Pi agent is now opt-in per VM via vm.piAgent.enable.
  # Removed ../common/nixpi.nix — NixPi runs centrally on the host.
  commonPiAgentModule = ../common/pi-agent.nix;

  serviceModules = {
    git = [
      ../services/forgejo.nix
      ../services/forgejo-bootstrap.nix
    ];
    minecraft = [
      ../services/minecraft-identity.nix
      inputs.minecraft.nixosModules.minecraft-service
    ];
    dav-server = [ ../services/dav-server.nix ];
  };

  fleetGitKeyShares =
    map (vm: {
      tag = "fleet-git-key-${vm.hostname}";
      source = "/persist/microvms/${vm.hostname}/git-ssh";
      mountPoint = "/var/lib/nazar/fleet-git-keys/${vm.hostname}";
      proto = "virtiofs";
      readOnly = true;
    }) (lib.attrValues fleet.vms);

  hostMicrovmSshConfig = lib.concatStringsSep "\n" (
    lib.mapAttrsToList (_name: vm: ''
      Host ${vm.hostname} ${vm.hostname}.${fleet.defaults.domain} ${vm.ip}
        HostName ${vm.ip}
        User alex
        IdentityFile /home/alex/.ssh/id_ed25519
        IdentitiesOnly yes
        UserKnownHostsFile /home/alex/.ssh/nazar_microvm_known_hosts
        StrictHostKeyChecking accept-new
    '') fleet.vms
  );

  mkMicrovm = name: vm: {
    inherit pkgs;
    autostart = false;
    restartIfChanged = false;
    specialArgs = {
      inherit inputs fleet vm;
    };
    config = {
      imports = commonGuestModules
        ++ lib.optional (vm.piAgent.enable or false) commonPiAgentModule
        ++ serviceModules.${name};
    }
    // lib.optionalAttrs (name == "git") {
      microvm.shares = fleetGitKeyShares;
    };
  };

  tmpfileForShare =
    share:
    "d ${share.source} ${share.mode or "0755"} ${share.owner or "root"} ${share.group or "root"} - -";
  guestShareTmpfiles = lib.concatMap (vm: map tmpfileForShare (vm.microvm.shares or [ ])) (
    lib.attrValues fleet.vms
  );
  sshHostKeyShareTmpfiles = map (vm: "d /persist/microvms/${vm.hostname}/ssh 0700 root root - -") (
    lib.attrValues fleet.vms
  );
  gitSshKeyShareTmpfiles = map (vm: "d /persist/microvms/${vm.hostname}/git-ssh 0700 alex users - -") (
    lib.attrValues fleet.vms
  );
in
{
  imports = [ inputs.microvm.nixosModules.host ];

  microvm = {
    stateDir = "/persist/microvms-runtime";
    # Bring persistent services back automatically. DAV remains deliberately
    # started only when its data/secrets are restored and validated.
    autostart = [
      "git"
      "minecraft"
      "dav-server"
    ];
    vms = lib.mapAttrs mkMicrovm fleet.vms;
  };

  systemd.tmpfiles.rules = [
    "d /persist/microvms 0755 root root - -"
    "d /persist/microvms-runtime 0775 microvm kvm - -"
    "d /home/alex/.ssh 0700 alex users - -"
    "f /home/alex/.ssh/nazar_microvm_known_hosts 0600 alex users - -"
  ]
  ++ guestShareTmpfiles
  ++ sshHostKeyShareTmpfiles
  ++ gitSshKeyShareTmpfiles;

  programs.ssh.extraConfig = hostMicrovmSshConfig;

  environment.systemPackages = [
    pkgs.cloud-hypervisor
    pkgs.virtiofsd
  ];

  assertions = [
    {
      assertion = lib.all (name: builtins.hasAttr name serviceModules) (lib.attrNames fleet.vms);
      message = "Every concrete fleet VM must have a MicroVM service module mapping.";
    }
  ];
}
