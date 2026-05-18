{ fleet, lib }:
let
  hostIdentity = import ./host.nix;
  exposure = import ./exposure.nix;

  isPrivateAccess =
    route:
    (route.enable or false)
    && lib.elem (route.access or "private") [
      "private"
      "public"
    ];

  domainsFor = vm: [ vm.dns ] ++ (vm.aliases or [ ]);

  privateServiceDomains = lib.concatMap (
    name:
    let
      vm = fleet.vms.${name};
    in
    if vm.privateAccess or false then domainsFor vm else [ ]
  ) (lib.attrNames fleet.vms);

  hostSite = exposure.host.site or { };
  hostNixpi = exposure.host.nixpi or { };
  hostCode = exposure.host.code or { };
  hostDav = exposure.host.dav or { };

  hostSiteDomains = lib.optional (isPrivateAccess hostSite && hostSite ? domain) hostSite.domain;

  hostNixpiDomains = lib.optionals (isPrivateAccess hostNixpi) (
    lib.optional (hostNixpi ? domain) hostNixpi.domain ++ (hostNixpi.pathDomains or [ ])
  );

  hostCodeDomains = lib.optional (isPrivateAccess hostCode && hostCode ? domain) hostCode.domain;

  hostDavDomains = lib.optional (isPrivateAccess hostDav && hostDav ? domain) hostDav.domain;

  privateDomainExclusions = exposure.privateDomainExclusions or [ ];
in
lib.subtractLists privateDomainExclusions (
  lib.unique (
    hostIdentity.git.domains
    ++ privateServiceDomains
    ++ hostSiteDomains
    ++ hostNixpiDomains
    ++ hostCodeDomains
    ++ hostDavDomains
  )
)
