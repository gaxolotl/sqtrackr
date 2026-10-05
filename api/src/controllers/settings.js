import SiteSettings from "../schema/siteSettings.js";
import { isAdmin } from "../utils/roles.js";
import logAudit from "../utils/audit.js";
import {
  applyRuntimeSettings,
  getRuntimeSettings,
  runtimeSettingsSchema,
} from "../utils/runtimeSettings.js";

export const fetchSettings = async (req, res, next) => {
  try {
    if (!isAdmin(req.userRole)) {
      res.status(403).send("Only admins can view site settings");
      return;
    }
    res.json(getRuntimeSettings());
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
    if (!isAdmin(req.userRole)) {
      res.status(403).send("Only admins can change site settings");
      return;
    }

    const settings = await runtimeSettingsSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: false,
    });

    await SiteSettings.findByIdAndUpdate(
      "runtime",
      {
        $set: { values: settings, updated: Date.now(), updatedBy: req.userId },
      },
      { upsert: true },
    );
    applyRuntimeSettings(settings);
    await logAudit(req.userId, "settings.updated", "runtime");
    res.json(settings);
  } catch (error) {
    if (error.name === "ValidationError") {
      const message = Array.isArray(error.errors)
        ? error.errors.join("; ")
        : error.message;
      res.status(400).json({ message });
      return;
    }
    next(error);
  }
};
