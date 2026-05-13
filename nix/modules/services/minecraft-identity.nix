{ ... }:
{
  # Keep the PaperMC service account stable across ephemeral MicroVM roots and
  # host-side virtiofs state. Host ownership appears as numeric 999:999; inside
  # the guest that is minecraft:minecraft.
  users.users.minecraft.uid = 999;
  users.groups.minecraft.gid = 999;
}
