# sqtrackr plugin API

sqtrackr supports **trusted, build-time plugins** that can add API routes, storage, settings, domain-event handlers, navigation, pages and UI slots.

> [!IMPORTANT]
> Plugins are ordinary JavaScript that runs **inside the API process** and, on the client, inside the browser bundle. A plugin has the same privileges as core code. Only install plugins you have reviewed. There is intentionally **no runtime upload or execution**: installing or removing a plugin means editing the registries below and rebuilding/restarting the deployment.

## Workspace layout

```text
packages/plugin-sdk/     # @sqtrackr/plugin-sdk (shared types + helpers)
plugins/<plugin-name>/   # first-party example plugins
api/src/plugins/         # server host, registry, event bus, validation
client/lib/plugins/      # client registry
```

A plugin is a small workspace package with an `exports` map:

```json
{
  "name": "@sqtrackr/plugin-example",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./manifest": "./manifest.js",
    "./server": "./server.js",
    "./client": "./client.tsx"
  },
  "dependencies": {
    "@sqtrackr/plugin-sdk": "workspace:*"
  }
}
```

Client entry points that render React must also declare `react`, `next` and any UI dependency (for example `lucide-react`) as peer/dev dependencies so they resolve during the client build. Client plugin packages are compiled by Next.js via `transpilePackages` in `client/next.config.ts`.

## Manifest

Every plugin exports a manifest from its `./manifest` entry.

```js
const manifest = Object.freeze({
  id: "example",              // /^[a-z0-9][a-z0-9-]{1,62}$/
  name: "Example",
  version: "1.0.0",
  apiVersion: 1,              // must match PLUGIN_API_VERSION
  sqtrackr: ">=2.1.0",        // compatible sqtrackr range (validated as a string)
  permissions: Object.freeze(["routes:user", "settings", "storage", "events"]),
  dependencies: Object.freeze([]), // other plugin ids this plugin requires
});

export default manifest;
```

The registry validates every manifest at startup: id format, non-empty name/version, matching `apiVersion`, known and unique permissions, and existing dependencies. Duplicate ids and dependency cycles fail startup. Plugins are loaded in a deterministic topological order.

### Permissions

| Permission | Grants |
|---|---|
| `routes` | All route phases |
| `routes:public` | Unauthenticated routes |
| `routes:user` | Authenticated routes |
| `routes:staff` | Staff and admin routes |
| `routes:admin` | Admin-only routes |
| `settings` | Register plugin settings |
| `storage` | Register plugin-owned models |
| `events` | Subscribe to and emit events |

Accessing a capability without declaring its permission throws during registration.

## Server API

```js
import { defineServerPlugin } from "@sqtrackr/plugin-sdk/server";

export default defineServerPlugin({
  register(context) {
    // Declare routes, settings, models and event subscriptions here.
    // Must be synchronous and side-effect free.
  },
  async initialize(context) {
    // Runs after MongoDB is connected, before the API listens.
  },
  async ready(context) {
    // Runs after all plugins initialize, before the API listens.
  },
  async stop(context) {
    // Runs on shutdown, in reverse load order.
  },
});
```

### `register(context)`

Declare everything up front. The registration window closes once `register` returns.

#### `context.routes`

Fresh, namespaced Express routers. Each plugin's routes are mounted at `/plugins/<id>/...`.

```js
const { routes } = context;

routes.public.get("/status", (req, res) => res.json({ ok: true }));
routes.user.get("/items", listItems);
routes.user.post("/items", createItem);
routes.staff.delete("/items/:id", removeItem);
```

- Only the phases you actually use are mounted. A plugin that never touches `routes.staff` cannot trigger a staff check.
- Role enforcement uses the database-backed `req.userRole` on the server.
- Async handler rejections are forwarded to the API error middleware automatically.
- Do not build your own namespace prefix; the host adds `/plugins/<id>`.

#### `context.settings`

```js
const defaults = context.settings.register({
  minimumAgeDays: { type: "integer", default: 7, min: 0, max: 3650, public: true },
  enabled: { type: "boolean", default: true },
});
```

Descriptors support `type` (`boolean`, `integer`, `number`, `string`), a required `default`, optional `min`/`max` for numbers, `maxLength` for strings, `options` for an allowed set, and `public` to expose the value through the public `/plugins` response. Settings are stored per plugin, validated as a whole, and exposed to admins in **Settings → Plugins**. Use `context.settings.get()` for the current values.

Secrets are never accepted through plugin settings. Keep them in deployment configuration.

#### `context.storage`

```js
const Item = context.storage.registerModel("item", {
  name: { type: String, required: true },
  created: { type: Date, required: true },
});
```

`localName` must match `/^[A-Za-z][A-Za-z0-9_-]{0,62}$/` and be unique per plugin. Models are automatically namespaced: Mongoose model `Plugin_<id>_<LocalName>` and MongoDB collection `plugin_<id>_<localname>`. Core models are not exposed.

#### `context.events`

```js
context.events.on("torrent.deleted", async ({ data }) => {
  // data: { torrentId, infoHash }
});

context.events.emit("example.updated", { id: "123" }, { userId: req.userId });
context.events.emitDetached("example.updated", { id: "123" });
```

- `on` subscribes for the plugin lifetime; subscriptions are skipped while the plugin is disabled or removed.
- `emit` awaits delivery; `emitDetached` queues delivery off the request path.
- Subscriber failures are isolated and logged; they never break the emitting request.
- Event payloads are deep-frozen and must not contain secrets.

#### `context.services`

Read-only helpers over core data. These return deliberately limited DTOs.

| Service | Method | Returns |
|---|---|---|
| `torrents` | `findByInfoHash(infoHash)` | `{ id, infoHash, name, created }` or `null` |
| `torrents` | `findMany(infoHashes)` | array of the above |
| `progress` | `hasCompleted(userId, infoHash)` | boolean |
| `progress` | `findSeeded(userId, infoHashes)` | info hashes the user completed or uploaded to |
| `tracker` | `getSwarmStats(infoHash)` | `{ peers, seeders, leechers }` |
| `users` | `getStats(userIds)` | capped (50) array of `{ userId, username, role, created, banned, uploadBytes, downloadBytes, ratio, hitnruns, snatchCount, uploadCount }` (no email, security or moderation fields) |

### Lifecycle and availability

Plugins can be **enabled/disabled** and **installed/removed** from **Settings → Plugins**. Disabled or removed plugins are not initialized, their routes return `404`, their event handlers are ignored, and they are hidden from the public `/plugins` list. Removing a plugin deletes its settings and drops its namespaced collections.

## Events

Core emits these events:

| Event | Data |
|---|---|
| `torrent.created` | `{ torrentId, infoHash, name, tags, type, source, uploadedBy }` |
| `torrent.deleted` | `{ torrentId, infoHash }` |
| `tracker.announce.accepted` | `{ infoHash, event, left, seeders, leechers }` |

The envelope is:

```js
{
  id,               // uuid
  type,             // e.g. "torrent.deleted"
  apiVersion: 1,
  occurredAt,       // ISO timestamp
  actor,            // { userId, role } or null
  data,             // frozen, sanitized
}
```

Event type names must match `/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/`. Tracker events never include IP addresses, peer ids, passkeys, UIDs or raw query strings.

## Client API

```tsx
import {
  defineClientPlugin,
  type PluginPageProps,
  type PluginSlotProps,
  type PluginTabProps,
} from "@sqtrackr/plugin-sdk/client";

export const navigation = [
  { label: "Example", href: "/plugins/example", authenticated: true },
] as const;

function ExamplePage({ slug }: PluginPageProps) {
  return <main className="page">Hello</main>;
}

function ExampleSlot({ context }: PluginSlotProps) {
  return <span>Injected</span>;
}

function ExampleTab({ context }: PluginTabProps) {
  return <span>Tab content</span>;
}

export const pages = [
  { path: "/", title: "Example", component: ExamplePage },
  { path: "/details", title: "Example", component: ExamplePage },
] as const;

export const slots = [
  { name: "home.afterContent", component: ExampleSlot, authenticated: true },
] as const;

export const tabs = [
  { slot: "bookmarks", label: "Example", component: ExampleTab, authenticated: true },
] as const;

export default defineClientPlugin({ manifest, navigation, pages, slots, tabs });
```

### Contributions

- **`navigation`** — sidebar links. `{ label, href, icon?, authenticated?, roles? }`.
- **`pages`** — routed components. `path` is relative to `/plugins/<id>`, so `"/"` renders at `/plugins/<id>` and `"/details"` at `/plugins/<id>/details`. Each page receives `{ slug }`.
- **`slots`** — components rendered into named host locations. `{ name, component, authenticated?, roles? }`. Slot components receive `{ context }`.
- **`tabs`** — extra tabs inside existing core pages, so a plugin can extend a page without adding a route. `{ slot, label, component, authenticated?, roles? }`. Tab components receive `{ context }`. Omit `navigation`/`pages` entirely for tab-only plugins.

`authenticated` and `roles` only affect presentation; the API must still enforce permissions.

### Wired slots

| Slot | Location | Context |
|---|---|---|
| `home.afterHeader` | Top of the home page | `{}` |
| `home.afterContent` | Bottom of the home page | `{}` |
| `torrent.actions` | Torrent detail action row | torrent context |
| `torrent.afterDetails` | After the torrent detail card | torrent context |

The torrent context is `{ torrent: { _id, infoHash, name, seeders, created }, session: { id, role } | null, reload }`.

### Tab slots

| Slot | Location | Context |
|---|---|---|
| `bookmarks` | Extra tabs on the Bookmarks page | `{}` |
| `profile` | Extra tabs on a user's profile page | `{ userId, username }` |
| `moderation` | Extra tabs on the Moderation hub | `{}` |

Tab buttons render alongside the page's own tabs and disappear when the
plugin is disabled. Deep-link to a plugin tab with `?tab=<plugin-id>` (the
Bookmarks page selects the matching plugin tab on load).

The host renders each contribution inside a per-plugin error boundary, so a failing plugin cannot break the page.

## Adding a plugin

1. Create `plugins/<id>/` with `package.json`, `manifest.js`, `server.js` and `client.tsx`.
2. Add `@sqtrackr/plugin-sdk` (and any UI dependencies) to its dependencies.
3. Register the server side in `api/src/plugins/registry.js`:

   ```js
   import exampleManifest from "@sqtrackr/plugin-example/manifest";
   import exampleServer from "@sqtrackr/plugin-example/server";

   const pluginRegistry = Object.freeze([
     { manifest: exampleManifest, server: exampleServer },
   ]);
   ```

4. Register the client side in `client/lib/plugins/registry.ts`:

   ```ts
   import example from "@sqtrackr/plugin-example/client";

   const staticPlugins = [example] satisfies readonly ClientPlugin[];
   ```

5. Add the package as a dependency of the `api` and `client` workspaces, then run `bun install`.
6. Restart the API and rebuild the client.

Enable or disable it, configure it and remove it from **Settings → Plugins**.

## Example plugin

[`plugins/reseed-radar`](./plugins/reseed-radar) is a complete full-stack example. It lets members request reseeds for torrents with no seeders, tracks demand, auto-fulfills requests when a seeder announces, exposes open and completed views with fuzzy search, and adds home notices and torrent-detail UI. It demonstrates routes, settings, storage, events, services, navigation, pages and slots.

[`plugins/upload-subscriptions`](./plugins/upload-subscriptions) is a tab-only plugin with no routes of its own in the sidebar: it consumes `torrent.created`, matches tag/category/uploader subscriptions, and renders inside the Bookmarks page plus home and torrent-detail slots.

[`plugins/member-ranks`](./plugins/member-ranks) is a tab-only plugin that computes earned member classes from the `users.getStats` service and renders a Rank tab on profiles and a Ranks tab in the moderation hub.

## Testing

Plugin behavior is covered by `api/test/plugins.test.js`:

```sh
bun run --filter @sqtracker/api test
```

The suite checks manifest validation and ordering, settings validation and persistence, management actions, event isolation, route namespacing and role phases, and the Reseed plugin's domain helpers.
