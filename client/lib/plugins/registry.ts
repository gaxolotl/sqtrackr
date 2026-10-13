import collages from "@sqtrackr/plugin-collages/client";
import memberRanks from "@sqtrackr/plugin-member-ranks/client";
import reseedRadar from "@sqtrackr/plugin-reseed-radar/client";
import uploadSubscriptions from "@sqtrackr/plugin-upload-subscriptions/client";
import type { ClientPlugin } from "@sqtrackr/plugin-sdk/client";

const staticPlugins = [
  collages,
  reseedRadar,
  memberRanks,
  uploadSubscriptions,
] satisfies readonly ClientPlugin[];

export const clientPluginRegistry = Object.fromEntries(
  staticPlugins.map((plugin) => [plugin.manifest.id, plugin]),
) as Readonly<Record<string, ClientPlugin>>;
