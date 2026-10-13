const manifest = Object.freeze({
  id: "upload-subscriptions",
  name: "Upload Subscriptions",
  version: "1.0.0",
  apiVersion: 1,
  sqtrackr: ">=2.1.0",
  permissions: Object.freeze(["routes:user", "settings", "storage", "events"]),
});

export default manifest;
