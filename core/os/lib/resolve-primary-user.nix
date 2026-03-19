{ lib, config }:

let
  detectedUsers = [];
  resolvedPrimaryUser =
    if config.nixpi.primaryUser != "" then
      config.nixpi.primaryUser
    else
      "";

  resolvedPrimaryHome =
    if config.nixpi.primaryHome != "" then
      config.nixpi.primaryHome
    else if resolvedPrimaryUser != "" then
      "/home/${resolvedPrimaryUser}"
    else
      "";
in
{
  inherit detectedUsers resolvedPrimaryUser resolvedPrimaryHome;
}
