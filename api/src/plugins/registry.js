import collagesManifest from "@sqtrackr/plugin-collages/manifest";
import collagesServer from "@sqtrackr/plugin-collages/server";
import memberRanksManifest from "@sqtrackr/plugin-member-ranks/manifest";
import memberRanksServer from "@sqtrackr/plugin-member-ranks/server";
import reseedRadarManifest from "@sqtrackr/plugin-reseed-radar/manifest";
import reseedRadarServer from "@sqtrackr/plugin-reseed-radar/server";
import uploadSubscriptionsManifest from "@sqtrackr/plugin-upload-subscriptions/manifest";
import uploadSubscriptionsServer from "@sqtrackr/plugin-upload-subscriptions/server";

const pluginRegistry = Object.freeze([
  Object.freeze({
    manifest: collagesManifest,
    server: collagesServer,
  }),
  Object.freeze({
    manifest: reseedRadarManifest,
    server: reseedRadarServer,
  }),
  Object.freeze({
    manifest: memberRanksManifest,
    server: memberRanksServer,
  }),
  Object.freeze({
    manifest: uploadSubscriptionsManifest,
    server: uploadSubscriptionsServer,
  }),
]);

export default pluginRegistry;
