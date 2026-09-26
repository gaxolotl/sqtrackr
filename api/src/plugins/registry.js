import collagesManifest from "@sqtrackr/plugin-collages/manifest";
import collagesServer from "@sqtrackr/plugin-collages/server";
import reseedRadarManifest from "@sqtrackr/plugin-reseed-radar/manifest";
import reseedRadarServer from "@sqtrackr/plugin-reseed-radar/server";

const pluginRegistry = Object.freeze([
  Object.freeze({
    manifest: collagesManifest,
    server: collagesServer,
  }),
  Object.freeze({
    manifest: reseedRadarManifest,
    server: reseedRadarServer,
  }),
]);

export default pluginRegistry;
