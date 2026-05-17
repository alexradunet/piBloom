{
  config,
  fleet,
  inputs,
  lib,
  ...
}:
let
  hostIdentity = import ../../fleet/host.nix;
  davVm = {
    hostname = "nazar";
    service = "dav-server";
    dns = "dav.nazar.studio";
    aliases = [ ];
    davServer = {
      listenAddress = hostIdentity.private.ip;
      nginxDefault = false;
      radicalePort = 5232;
      httpPort = 80;
      auth = {
        enable = true;
        realm = "Nazar DAV";
        htpasswdFile = "/persist/microvms/dav-server/data/secrets/dav-server-htpasswd";
      };
      stateDir = "/persist/microvms/dav-server/data";
      webdavRoot = "/persist/microvms/dav-server/data/webdav";
      radicaleStateDir = "/persist/microvms/dav-server/radicale";
    };
  };
in
{
  imports = [ inputs.dav-server.nixosModules.dav-server-service ];

  _module.args.vm = davVm;

  # DAV is now a host service. The old MicroVM state roots are reused directly
  # to avoid a data migration; do not recreate a dav-server MicroVM just to
  # serve the private DAV endpoints.
  systemd.tmpfiles.rules = [
    "d /persist/microvms/dav-server 0755 root root - -"
  ];

  system.activationScripts.nazar-dav-host-state = lib.stringAfter [ "users" ] ''
    set -euo pipefail

    state_dir=/persist/microvms/dav-server/data
    webdav_root=$state_dir/webdav
    secrets_dir=$state_dir/secrets
    htpasswd_file=$secrets_dir/dav-server-htpasswd
    radicale_dir=/persist/microvms/dav-server/radicale

    install -d -m 0750 -o nginx -g nginx "$state_dir" "$webdav_root" "$webdav_root/wiki" "$state_dir/nginx-client-body"
    install -d -m 0750 -o root -g nginx "$secrets_dir"
    install -d -m 0750 -o radicale -g radicale "$radicale_dir"

    if [ -d "$webdav_root" ]; then
      chown -R nginx:nginx "$webdav_root" "$state_dir/nginx-client-body"
      chmod 0750 "$webdav_root" "$state_dir/nginx-client-body"
    fi

    if [ -d "$radicale_dir" ]; then
      chown -R radicale:radicale "$radicale_dir"
      chmod 0750 "$radicale_dir"
    fi

    if [ -e "$htpasswd_file" ]; then
      chown root:nginx "$htpasswd_file"
      chmod 0640 "$htpasswd_file"
    else
      echo "warning: DAV auth file missing: $htpasswd_file" >&2
    fi
  '';

  assertions = [
    {
      assertion = !(builtins.hasAttr "dav-server" fleet.vms);
      message = "DAV is a host service; remove dav-server from nix/fleet/vms.nix instead of running a DAV MicroVM.";
    }
    {
      assertion = lib.any (listen: listen.addr == hostIdentity.private.ip && listen.port == 80) (
        config.services.nginx.virtualHosts."dav.nazar.studio".listen or [ ]
      );
      message = "DAV host service must listen on the Nazar private address only.";
    }
  ];
}
