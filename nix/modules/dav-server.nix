{
  lib,
  pkgs,
  vm,
  ...
}:
let
  cfg = vm.davServer or { };
  stateDir = cfg.stateDir or "/var/lib/dav-server";
  webdavRoot = cfg.webdavRoot or "${stateDir}/webdav";
  radicaleStateDir = cfg.radicaleStateDir or "/var/lib/radicale/collections";
  radicalePort = cfg.radicalePort or 5232;
  httpPort = cfg.httpPort or 80;
  auth = cfg.auth or { };
  authEnable = auth.enable or false;
  authRealm = auth.realm or "DAV Server";
  htpasswdFile = auth.htpasswdFile or "/var/lib/dav-server/secrets/dav-server-htpasswd";
  authBasicConfig = lib.optionalString authEnable ''
    auth_basic "${authRealm}";
    auth_basic_user_file ${htpasswdFile};
  '';
in
{
  assertions = [
    {
      assertion = vm ? service && vm.service == "dav-server";
      message = "dav-server service module may only be enabled for fleet VMs with service = \"dav-server\".";
    }
  ];

  environment.systemPackages = with pkgs; [
    curl
    jq
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

      locations."/".return = "200 'DAV server: private DAV endpoints are /radicale/ and /files/.\n'";

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

  # Canonical access is through NetBird. Do not open DAV on the NAT bridge by
  # default; peers, including VM 120, should use the NetBird name/IP once both
  # VMs are enrolled.
  networking.firewall.interfaces.wt0.allowedTCPPorts = [ httpPort ];

  systemd.services.dav-server-auth-gate = {
    description = "Document DAV server bootstrap auth gate";
    wantedBy = [ "multi-user.target" ];
    after = [
      "nginx.service"
      "radicale.service"
    ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      cat <<'EOF'
      DAV server mode: Radicale and WebDAV are reachable through the NetBird interface only.
      Authentication enabled: ${if authEnable then "yes" else "no"}.
      If authentication is enabled, keep ${htpasswdFile} provisioned outside git with root:nginx 0640 permissions.
      EOF
    '';
  };

  system.stateVersion = "26.05";
}
