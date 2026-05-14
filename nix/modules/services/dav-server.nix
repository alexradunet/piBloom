{
  lib,
  pkgs,
  vm,
  ...
}:
let
  cfg = vm.davServer;
  stateDir = cfg.stateDir;
  webdavRoot = cfg.webdavRoot;
  radicaleStateDir = cfg.radicaleStateDir;
  radicalePort = cfg.radicalePort;
  httpPort = cfg.httpPort;
  auth = cfg.auth or { };
  authEnable = auth.enable or false;
  authRealm = auth.realm or "Nazar DAV";
  htpasswdFile = auth.htpasswdFile or "${stateDir}/secrets/dav-server-htpasswd";
  authBasicConfig = lib.optionalString authEnable ''
    auth_basic "${authRealm}";
    auth_basic_user_file ${htpasswdFile};
  '';
in
{
  fileSystems."/" = {
    device = lib.mkDefault "tmpfs";
    fsType = lib.mkDefault "tmpfs";
    options = lib.mkDefault [
      "size=2G"
      "mode=755"
    ];
  };

  environment.systemPackages = with pkgs; [
    curl
    jq
    rsync
  ];

  services.radicale = {
    enable = true;
    settings = {
      server.hosts = [ "127.0.0.1:${toString radicalePort}" ];
      auth.type = if authEnable then "http_x_remote_user" else "none";
      rights.type = "owner_only";
      storage.filesystem_folder = radicaleStateDir;
      web.type = "internal";
    };
  };

  services.nginx = {
    enable = true;
    package = pkgs.nginxStable.override { modules = [ pkgs.nginxModules.dav ]; };
    recommendedOptimisation = true;
    recommendedProxySettings = true;

    virtualHosts.${vm.dns} = {
      default = true;
      listen = [
        {
          addr = "0.0.0.0";
          port = httpPort;
        }
      ];

      locations."/".return = "200 'Nazar DAV VM: private endpoints are /radicale/ and /files/.\n'";

      locations."/radicale/" = {
        proxyPass = "http://127.0.0.1:${toString radicalePort}/";
        extraConfig = ''
          ${authBasicConfig}
          proxy_set_header X-Script-Name /radicale;
          proxy_set_header X-Remote-User $remote_user;
          client_max_body_size 128m;
        '';
      };

      locations."/files/" = {
        alias = "${webdavRoot}/";
        extraConfig = ''
          ${authBasicConfig}
          dav_methods PUT DELETE MKCOL COPY MOVE;
          dav_ext_methods PROPFIND OPTIONS LOCK UNLOCK;
          create_full_put_path on;
          dav_access user:rw group:rw all:rw;
          autoindex on;
          client_max_body_size 512m;
          client_body_temp_path ${stateDir}/nginx-client-body;
        '';
      };
    };
  };

  systemd.tmpfiles.rules = [
    "d ${stateDir} 0750 nginx nginx - -"
    "d ${stateDir}/secrets 0750 root nginx - -"
    "d ${stateDir}/nginx-client-body 0750 nginx nginx - -"
    "d ${webdavRoot} 0750 nginx nginx - -"
    "d ${webdavRoot}/wiki 0750 nginx nginx - -"
    "d ${radicaleStateDir} 0750 radicale radicale - -"
  ];

  # dav-server-auth-gate removed — was a no-op oneshot that only printed a
  # boot message to stdout. Radicale and WebDAV are reachable through the
  # private Nazar network; auth status is visible in the NixOS config.
  # Git backup removed — SSH-for-Git is no longer used on this private network.
  # VM repos are available via virtiofs shares from the host.

  networking.firewall.allowedTCPPorts = [ httpPort ];

  assertions = [
    {
      assertion = vm.service == "dav-server";
      message = "The DAV server module should only be imported by the dav-server VM.";
    }
    {
      assertion = httpPort == 80;
      message = "DAV server currently expects HTTP port 80 behind private Nazar routing.";
    }
  ];

  system.stateVersion = "26.05";
}
