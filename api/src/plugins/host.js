import express from "express";
import ratelimit from "express-rate-limit";
import mongoose from "mongoose";
import PluginSettings from "../schema/pluginSettings.js";
import Progress from "../schema/progress.js";
import Snatch from "../schema/snatch.js";
import Torrent from "../schema/torrent.js";
import User from "../schema/user.js";
import { getUserHitNRuns } from "../utils/hitnrun.js";
import { countSwarmPeers } from "../tracker/swarm-stats.js";
import pluginEvents from "./eventBus.js";
import {
  getDefaultSettings,
  getPublicSettings,
  validatePluginSettings,
  validateSettingsDescriptors,
} from "./settings.js";
import { getSafeManifest, orderPluginRegistry } from "./validation.js";

const ROUTE_PHASES = ["public", "user", "staff", "admin"];
const LOCAL_MODEL_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,62}$/;

const managementLimiter = ratelimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.userId?.toString() ?? req.ip,
  skip: (req) => req.method === "OPTIONS",
});

const wrapHandler = (handler) => {
  if (typeof handler !== "function") return handler;
  if (handler.length === 4) {
    return (error, req, res, next) => {
      Promise.resolve()
        .then(() => handler(error, req, res, next))
        .catch(next);
    };
  }
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
};

const wrapHandlers = (handlers) =>
  handlers.map((handler) =>
    Array.isArray(handler) ? wrapHandlers(handler) : wrapHandler(handler),
  );

export const createAsyncRouter = () => {
  const router = express.Router();
  for (const method of [
    "all",
    "delete",
    "get",
    "patch",
    "post",
    "put",
    "use",
  ]) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => {
      if (method === "use" && typeof path === "function") {
        return register(wrapHandler(path), ...wrapHandlers(handlers));
      }
      return register(path, ...wrapHandlers(handlers));
    };
  }
  return router;
};

const routePermissionGranted = (permissions, phase) =>
  permissions.has("routes") || permissions.has(`routes:${phase}`);

const requireRole = (minimumRole) => (req, res, next) => {
  const roleLevel = { user: 1, staff: 2, admin: 3 };
  if ((roleLevel[req.userRole] ?? 0) < roleLevel[minimumRole]) {
    res.status(403).send(`Plugin route requires ${minimumRole} role`);
    return;
  }
  next();
};

const toSafeTorrent = (torrent) =>
  torrent
    ? {
        id: torrent._id.toString(),
        infoHash: torrent.infoHash,
        name: torrent.name,
        created: torrent.created,
      }
    : null;

const humanizeSettingKey = (key) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());

const getSettingsDescriptorsDto = (descriptors) =>
  Object.entries(descriptors).map(([key, descriptor]) => ({
    key,
    label: humanizeSettingKey(key),
    ...structuredClone(descriptor),
    type: descriptor.type === "integer" ? "number" : descriptor.type,
    required: true,
  }));

export const createPluginHost = ({
  registry,
  tracker,
  eventBus = pluginEvents,
  settingsModel = PluginSettings,
  logger = console,
} = {}) => {
  const orderedEntries = orderPluginRegistry(registry ?? []);
  const states = new Map();
  const phaseRoots = Object.fromEntries(
    ROUTE_PHASES.map((phase) => [phase, createAsyncRouter()]),
  );
  const managementRouter = createAsyncRouter();
  let registered = false;
  let initialized = false;

  const services = Object.freeze({
    torrents: Object.freeze({
      findByInfoHash: async (infoHash) => {
        const torrent = await Torrent.findOne(
          { infoHash: String(infoHash).toLowerCase() },
          { infoHash: 1, name: 1, created: 1 },
        ).lean();
        return toSafeTorrent(torrent);
      },
      findMany: async (infoHashes) => {
        const hashes = [...new Set((infoHashes ?? []).map((infoHash) =>
          String(infoHash).toLowerCase(),
        ))];
        if (!hashes.length) return [];
        const torrents = await Torrent.find(
          { infoHash: { $in: hashes } },
          { infoHash: 1, name: 1, created: 1 },
        ).lean();
        return torrents.map(toSafeTorrent);
      },
    }),
    progress: Object.freeze({
      hasCompleted: async (userId, infoHash) =>
        Boolean(
          await Progress.exists({
            userId,
            infoHash: String(infoHash).toLowerCase(),
            left: 0,
          }),
        ),
      findSeeded: async (userId, infoHashes) => {
        const hashes = [...new Set((infoHashes ?? []).map((infoHash) =>
          String(infoHash).toLowerCase(),
        ))];
        if (!hashes.length) return [];
        const records = await Progress.find(
          {
            userId,
            infoHash: { $in: hashes },
            $or: [{ left: 0 }, { "uploaded.total": { $gt: 0 } }],
          },
          { infoHash: 1, _id: 0 },
        ).lean();
        return [...new Set(records.map((record) => record.infoHash))];
      },
    }),
    tracker: Object.freeze({
      getSwarmStats: (infoHash) =>
        countSwarmPeers(tracker?.torrents?.[String(infoHash).toLowerCase()]),
    }),
    users: Object.freeze({
      // Limited per-user activity stats for rank/progress style plugins.
      // Never includes email, security state or moderation details.
      getStats: async (userIds) => {
        const ids = [
          ...new Set((userIds ?? []).map((id) => String(id))),
        ].filter((id) => mongoose.isValidObjectId(id)).slice(0, 50);
        if (!ids.length) return [];
        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        const [users, uploaded, downloaded, snatches, uploads] =
          await Promise.all([
            User.find(
              { _id: { $in: objectIds } },
              { username: 1, role: 1, created: 1, banned: 1 },
            ).lean(),
            Progress.aggregate([
              { $match: { userId: { $in: objectIds } } },
              {
                $group: {
                  _id: "$userId",
                  bytes: { $sum: { $ifNull: ["$uploaded.total", 0] } },
                },
              },
            ]),
            Progress.aggregate([
              { $match: { userId: { $in: objectIds } } },
              {
                $group: {
                  _id: "$userId",
                  bytes: { $sum: { $ifNull: ["$downloaded.total", 0] } },
                },
              },
            ]),
            Snatch.aggregate([
              { $match: { userId: { $in: objectIds } } },
              { $group: { _id: "$userId", count: { $sum: 1 } } },
            ]),
            Torrent.aggregate([
              { $match: { uploadedBy: { $in: objectIds } } },
              { $group: { _id: "$uploadedBy", count: { $sum: 1 } } },
            ]),
          ]);
        const byId = (rows, key = "bytes") =>
          new Map(rows.map((row) => [String(row._id), Number(row[key] ?? 0)]));
        const uploadedById = byId(uploaded);
        const downloadedById = byId(downloaded);
        const snatchesById = byId(snatches, "count");
        const uploadsById = byId(uploads, "count");
        return Promise.all(
          users.map(async (user) => {
            const key = String(user._id);
            const up = uploadedById.get(key) ?? 0;
            const down = downloadedById.get(key) ?? 0;
            return {
              userId: key,
              username: user.username,
              role: user.role,
              created: user.created,
              banned: Boolean(user.banned),
              uploadBytes: up,
              downloadBytes: down,
              ratio: down === 0 ? -1 : Number((up / down).toFixed(2)),
              hitnruns: await getUserHitNRuns(user._id),
              snatchCount: snatchesById.get(key) ?? 0,
              uploadCount: uploadsById.get(key) ?? 0,
            };
          }),
        );
      },
    }),
  });

  const getSummary = (state, { admin = false } = {}) => ({
    ...getSafeManifest(state.manifest),
    enabled: state.enabled && state.installed,
    installed: state.installed,
    health: state.health,
    settings: admin
      ? {
          values: structuredClone(state.settingsValues),
          descriptors: getSettingsDescriptorsDto(state.settingsDescriptors),
        }
      : getPublicSettings(state.settingsDescriptors, state.settingsValues),
    ...(admin
      ? {
          descriptors: getSettingsDescriptorsDto(state.settingsDescriptors),
          values: structuredClone(state.settingsValues),
        }
      : {}),
  });

  const getState = (pluginId) => states.get(pluginId);

  managementRouter.get("/", managementLimiter, (req, res) => {
    if (req.userRole !== "admin") {
      res.status(403).send("Only admins can view plugins");
      return;
    }
    res.json({
      plugins: orderedEntries.map(({ manifest }) =>
        getSummary(getState(manifest.id), { admin: true }),
      ),
    });
  });

  managementRouter.put(
    "/:pluginId/settings",
    managementLimiter,
    async (req, res, next) => {
    if (req.userRole !== "admin") {
      res.status(403).send("Only admins can change plugin settings");
      return;
    }
    const state = getState(req.params.pluginId);
    if (!state) {
      res.status(404).send("Plugin does not exist");
      return;
    }

    let settings;
    try {
      settings = validatePluginSettings(state.settingsDescriptors, req.body, {
        requireAll: true,
      });
    } catch (error) {
      res.status(400).send(error.message);
      return;
    }

    try {
      await settingsModel.findByIdAndUpdate(
        state.manifest.id,
        {
          $set: {
            values: structuredClone(settings),
            updated: Date.now(),
            updatedBy: req.userId,
          },
        },
        { upsert: true },
      );
      state.settingsValues = settings;
      res.json(getSummary(state, { admin: true }));
    } catch (error) {
      next(error);
    }
  });

  const requireAdminRole = (req, res, next) => {
    if (req.userRole !== "admin") {
      res.status(403).send("Only admins can manage plugins");
      return;
    }
    next();
  };

  const findManagedState = (req, res) => {
    const state = getState(req.params.pluginId);
    if (!state) {
      res.status(404).send("Plugin does not exist");
      return null;
    }
    return state;
  };

  const persistState = (pluginId, update) =>
    settingsModel.findByIdAndUpdate(
      pluginId,
      { $set: { ...update, updated: Date.now() } },
      { upsert: true },
    );

  const dropPluginCollections = async (state) => {
    for (const localName of state.modelNames) {
      const collectionName = `plugin_${state.manifest.id}_${localName}`;
      try {
        await mongoose.connection.dropCollection(collectionName);
      } catch {
        // the collection may not have been created yet
      }
    }
  };

  const reinstallPlugin = async (state, userId) => {
    state.installed = true;
    state.enabled = true;
    if (Object.keys(state.settingsDescriptors).length) {
      state.settingsValues = validatePluginSettings(
        state.settingsDescriptors,
        state.settingsValues ?? {},
        { requireAll: false },
      );
    }
    await persistState(state.manifest.id, {
      enabled: true,
      installed: true,
      installedAt: Date.now(),
      removedAt: null,
      values: structuredClone(state.settingsValues),
      updatedBy: userId,
    });
    if (typeof state.server.initialize === "function") {
      await state.server.initialize(state.context);
    }
    state.health = "healthy";
  };

  managementRouter.put(
    "/:pluginId/enabled",
    managementLimiter,
    requireAdminRole,
    async (req, res, next) => {
      const state = findManagedState(req, res);
      if (!state) return;
      if (typeof req.body?.enabled !== "boolean") {
        res.status(400).send("enabled must be a boolean");
        return;
      }
      try {
        if (req.body.enabled && !state.installed) {
          await reinstallPlugin(state, req.userId);
        } else {
          state.enabled = req.body.enabled;
          state.health = req.body.enabled ? "healthy" : "disabled";
          await persistState(state.manifest.id, {
            enabled: req.body.enabled,
          });
        }
        res.json(getSummary(state, { admin: true }));
      } catch (error) {
        next(error);
      }
    },
  );

  managementRouter.post(
    "/:pluginId/install",
    managementLimiter,
    requireAdminRole,
    async (req, res, next) => {
      const state = findManagedState(req, res);
      if (!state) return;
      try {
        await reinstallPlugin(state, req.userId);
        res.json(getSummary(state, { admin: true }));
      } catch (error) {
        next(error);
      }
    },
  );

  managementRouter.delete(
    "/:pluginId",
    managementLimiter,
    requireAdminRole,
    async (req, res, next) => {
      const state = findManagedState(req, res);
      if (!state) return;
      try {
        state.enabled = false;
        state.installed = false;
        state.health = "removed";
        await dropPluginCollections(state);
        await settingsModel.findByIdAndDelete(state.manifest.id);
        res.json(getSummary(state, { admin: true }));
      } catch (error) {
        next(error);
      }
    },
  );

  phaseRoots.public.get("/", (req, res) => {
    res.json({
      plugins: orderedEntries
        .map(({ manifest }) => getSummary(getState(manifest.id)))
        .filter((plugin) => plugin.installed && plugin.enabled),
    });
  });

  const register = async () => {
    if (registered)
      throw new Error("Plugin host has already registered plugins");

    for (const entry of orderedEntries) {
      const { manifest, server } = entry;
      const permissions = new Set(manifest.permissions);
      const routers = Object.fromEntries(
        ROUTE_PHASES.map((phase) => [phase, createAsyncRouter()]),
      );
      const state = {
        manifest,
        server,
        routers,
        settingsDescriptors: Object.freeze({}),
        settingsValues: Object.freeze({}),
        settingsRegistered: false,
        modelNames: new Set(),
        subscriptions: [],
        health: "registering",
        registrationOpen: true,
        enabled: true,
        installed: true,
        usedPhases: new Set(),
      };
      states.set(manifest.id, state);

      const assertRegistrationOpen = (capability) => {
        if (!state.registrationOpen) {
          throw new Error(
            `Plugin ${manifest.id} must register ${capability} during register()`,
          );
        }
      };
      const assertPermission = (permission) => {
        if (!permissions.has(permission)) {
          throw new Error(
            `Plugin ${manifest.id} did not declare ${permission} permission`,
          );
        }
      };

      const routeApi = {};
      for (const phase of ROUTE_PHASES) {
        Object.defineProperty(routeApi, phase, {
          enumerable: true,
          get: () => {
            assertRegistrationOpen(`${phase} routes`);
            if (!routePermissionGranted(permissions, phase)) {
              throw new Error(
                `Plugin ${manifest.id} did not declare routes:${phase} permission`,
              );
            }
            state.usedPhases.add(phase);
            return routers[phase];
          },
        });
      }

      const context = Object.freeze({
        plugin: getSafeManifest(manifest),
        routes: Object.freeze(routeApi),
        settings: Object.freeze({
          register: (descriptors) => {
            assertRegistrationOpen("settings");
            assertPermission("settings");
            if (state.settingsRegistered) {
              throw new Error(
                `Plugin ${manifest.id} settings are already registered`,
              );
            }
            state.settingsDescriptors =
              validateSettingsDescriptors(descriptors);
            state.settingsValues = getDefaultSettings(
              state.settingsDescriptors,
            );
            state.settingsRegistered = true;
            return state.settingsValues;
          },
          get: () => state.settingsValues,
        }),
        storage: Object.freeze({
          registerModel: (localName, schemaDefinition, schemaOptions = {}) => {
            assertRegistrationOpen("models");
            assertPermission("storage");
            if (!LOCAL_MODEL_PATTERN.test(localName || "")) {
              throw new TypeError(`Invalid plugin model name: ${localName}`);
            }
            const normalizedName = localName.toLowerCase();
            if (state.modelNames.has(normalizedName)) {
              throw new Error(
                `Plugin ${manifest.id} model ${localName} is already registered`,
              );
            }
            state.modelNames.add(normalizedName);

            const pluginNamespace = manifest.id.replaceAll("-", "_");
            const modelName = `Plugin_${pluginNamespace}_${localName}`;
            const collectionName = `plugin_${manifest.id}_${normalizedName}`;
            if (mongoose.models[modelName]) {
              throw new Error(
                `Mongoose model ${modelName} is already registered`,
              );
            }
            const schema =
              schemaDefinition instanceof mongoose.Schema
                ? schemaDefinition
                : new mongoose.Schema(schemaDefinition, schemaOptions);
            return mongoose.model(modelName, schema, collectionName);
          },
        }),
        events: Object.freeze({
          on: (type, handler) => {
            assertRegistrationOpen("event subscriptions");
            assertPermission("events");
            const guarded = (envelope) => {
              if (!state.enabled || !state.installed) return undefined;
              return handler(envelope);
            };
            const unsubscribe = eventBus.subscribe(manifest.id, type, guarded);
            state.subscriptions.push(unsubscribe);
            return unsubscribe;
          },
          emit: (type, data, actor = null) => {
            assertPermission("events");
            return eventBus.emit(type, data, actor);
          },
          emitDetached: (type, data, actor = null) => {
            assertPermission("events");
            eventBus.emitDetached(type, data, actor);
          },
        }),
        services,
      });
      state.context = context;

      try {
        await server.register(context);
        state.registrationOpen = false;
        const available = (req, res, next) => {
          if (!state.enabled || !state.installed) {
            res.status(404).send("Plugin is not available");
            return;
          }
          next();
        };
        for (const phase of ROUTE_PHASES.filter((candidate) =>
          state.usedPhases.has(candidate),
        )) {
          const middleware =
            phase === "public"
              ? [
                  (req, res, next) =>
                    req.headers.authorization ? next("router") : next(),
                ]
              : [requireRole(phase === "user" ? "user" : phase)];
          phaseRoots[phase].use(
            `/${manifest.id}`,
            available,
            ...middleware,
            routers[phase],
          );
        }
        state.health = "registered";
      } catch (error) {
        state.registrationOpen = false;
        state.health = "failed";
        throw error;
      }
    }
    registered = true;
  };

  const initialize = async () => {
    if (!registered)
      throw new Error("Plugin host must register before initialize");
    if (initialized) throw new Error("Plugin host has already initialized");

    for (const { manifest } of orderedEntries) {
      const state = getState(manifest.id);
      state.health = "initializing";
      try {
        const saved = await settingsModel.findById(manifest.id).lean();
        state.enabled = saved?.enabled !== false;
        state.installed = saved?.installed !== false;
        if (Object.keys(state.settingsDescriptors).length) {
          state.settingsValues = validatePluginSettings(
            state.settingsDescriptors,
            saved?.values ?? {},
            { requireAll: false },
          );
          await settingsModel.findByIdAndUpdate(
            manifest.id,
            { $set: { values: structuredClone(state.settingsValues) } },
            { upsert: true },
          );
        }
        if (!state.enabled || !state.installed) {
          state.health = state.installed ? "disabled" : "removed";
          continue;
        }
        if (typeof state.server.initialize === "function") {
          await state.server.initialize(state.context);
        }
        state.health = "initialized";
      } catch (error) {
        state.health = "failed";
        throw new Error(
          `Plugin ${manifest.id} failed to initialize: ${error.message}`,
        );
      }
    }
    initialized = true;
  };

  const ready = async () => {
    if (!initialized)
      throw new Error("Plugin host must initialize before ready");
    for (const { manifest } of orderedEntries) {
      const state = getState(manifest.id);
      if (!state.enabled || !state.installed) continue;
      try {
        if (typeof state.server.ready === "function") {
          await state.server.ready(state.context);
        }
        state.health = "healthy";
      } catch (error) {
        state.health = "failed";
        throw new Error(
          `Plugin ${manifest.id} failed readiness: ${error.message}`,
        );
      }
    }
  };

  const stop = async () => {
    for (const { manifest } of [...orderedEntries].reverse()) {
      const state = getState(manifest.id);
      try {
        if (typeof state.server.stop === "function") {
          await state.server.stop(state.context);
        }
      } catch (error) {
        logger.error(
          `[sq] plugin ${manifest.id} failed to stop: ${error.message}`,
        );
      } finally {
        for (const unsubscribe of state.subscriptions) unsubscribe();
        state.health = "stopped";
      }
    }
  };

  return Object.freeze({
    publicRouter: phaseRoots.public,
    userRouter: phaseRoots.user,
    staffRouter: phaseRoots.staff,
    adminRouter: phaseRoots.admin,
    managementRouter,
    register,
    initialize,
    ready,
    stop,
  });
};
