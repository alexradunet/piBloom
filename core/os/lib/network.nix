# core/os/lib/network.nix — CIDR validation utilities
{ lib }:

let
  isDigits = value: builtins.match "^[0-9]+$" value != null;
  parseInt = value: builtins.fromJSON value;
  hasValidPrefix =
    max: prefix:
    if isDigits prefix then
      let prefixInt = parseInt prefix;
      in prefixInt >= 0 && prefixInt <= max
    else
      false;
  isValidIPv4CIDR =
    cidr:
    let
      parts = lib.splitString "/" cidr;
    in
    builtins.length parts == 2
    && (
      let
        address = builtins.elemAt parts 0;
        prefix = builtins.elemAt parts 1;
        octets = lib.splitString "." address;
      in
      builtins.length octets == 4
      && hasValidPrefix 32 prefix
      && builtins.all (
        octet:
        if isDigits octet then
          let octetInt = parseInt octet;
          in octetInt >= 0 && octetInt <= 255
        else
          false
      ) octets
    );
  ipv6Segments = part: if part == "" then [ ] else lib.splitString ":" part;
  isValidIPv6Hextet = hextet: builtins.match "^[0-9A-Fa-f]{1,4}$" hextet != null;
  isValidIPv6CIDR =
    cidr:
    let
      parts = lib.splitString "/" cidr;
    in
    builtins.length parts == 2
    && (
      let
        address = builtins.elemAt parts 0;
        prefix = builtins.elemAt parts 1;
        compressionParts = lib.splitString "::" address;
        compressionCount = builtins.length compressionParts - 1;
        segments = builtins.concatLists (map ipv6Segments compressionParts);
      in
      lib.hasInfix ":" address
      && compressionCount <= 1
      && hasValidPrefix 128 prefix
      && builtins.all isValidIPv6Hextet segments
      && (if compressionCount == 0 then builtins.length segments == 8 else builtins.length segments < 8)
    );
in
{
  isValidSourceCIDR = cidr: isValidIPv4CIDR cidr || isValidIPv6CIDR cidr;
}
