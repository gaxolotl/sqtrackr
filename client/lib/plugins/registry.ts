import collages from "@sqtrackr/plugin-collages/client";
import memberRanks from "@sqtrackr/plugin-member-ranks/client";
import reseedRadar from "@sqtrackr/plugin-reseed-radar/client";
import uploadSubscriptions from "@sqtrackr/plugin-upload-subscriptions/client";
import type { ClientPlugin } from "@sqtrackr/plugin-sdk/client";

// Trust boundary: only statically bundled first-party plugins are registered
// here — no dynamic remote code is loaded at runtime. Third-party plugin
// components still run with full DOM access (they can read localStorage and
// call the API as the user), so treat every registered plugin as trusted
// code, pin/review its dependencies, and do not pass raw session tokens in
// plugin context unless the plugin strictly requires them.
const staticPlugins = [
  collages,
  reseedRadar,
  memberRanks,
  uploadSubscriptions,
] satisfies readonly ClientPlugin[];

export const clientPluginRegistry = Object.fromEntries(
  staticPlugins.map((plugin) => [plugin.manifest.id, plugin]),
) as Readonly<Record<string, ClientPlugin>>;
