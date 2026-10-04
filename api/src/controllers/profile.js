import sharp from "sharp";
import User from "../schema/user.js";
import { getContentLimits } from "../utils/contentLimits.js";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const allowedInputTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const fetchOwnProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId, {
      username: 1,
      bio: 1,
      location: 1,
      website: 1,
      avatarUpdated: 1,
    }).lean();
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const updateOwnProfile = async (req, res, next) => {
  try {
    const limits = getContentLimits();
    const fields = [
      ["bio", limits.profileBio],
      ["location", limits.profileLocation],
      ["website", 200],
    ];
    for (const [field, maxLength] of fields) {
      if (
        typeof req.body[field] !== "string" ||
        req.body[field].length > maxLength
      ) {
        res
          .status(400)
          .send(`${field} must be a string of at most ${maxLength} characters`);
        return;
      }
    }
    const bio = req.body.bio.trim();
    const location = req.body.location.trim();
    const website = req.body.website.trim();
    if (website) {
      let parsed;
      try {
        parsed = new URL(website);
      } catch {
        res.status(400).send("Website must be a valid URL");
        return;
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        res.status(400).send("Website must use HTTP or HTTPS");
        return;
      }
    }
    await User.updateOne(
      { _id: req.userId },
      { $set: { bio, location, website } },
    );
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
};

async function compressAvatar(input, maxResolution, maxBytes, animated) {
  let dimensions = maxResolution;
  const qualities = [84, 74, 64, 54, 44, 34];
  while (dimensions >= 64) {
    for (const quality of qualities) {
      const output = await sharp(input, {
        animated,
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .resize({
          width: dimensions,
          height: dimensions,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality, effort: 5 })
        .toBuffer();
      if (output.length <= maxBytes) return output;
    }
    dimensions = Math.floor(dimensions * 0.75);
  }
  throw new Error(
    "Avatar could not be compressed below the configured size limit",
  );
}

export const uploadAvatar = async (req, res, next) => {
  try {
    const contentType =
      typeof req.body.contentType === "string" ? req.body.contentType : "";
    const encoded =
      typeof req.body.data === "string"
        ? req.body.data.replace(/^data:[^;]+;base64,/, "")
        : "";
    if (!allowedInputTypes.has(contentType) || !encoded) {
      res.status(400).send("Avatar must be a JPEG, PNG, WebP, or GIF image");
      return;
    }
    if (
      contentType === "image/gif" &&
      process.env.SQ_ALLOW_GIF_AVATARS !== "true"
    ) {
      res.status(400).send("GIF avatars are disabled");
      return;
    }

    const input = Buffer.from(encoded, "base64");
    if (!input.length || input.length > MAX_INPUT_BYTES) {
      res.status(413).send("Avatar source image must be 10 MB or smaller");
      return;
    }
    let metadata;
    try {
      metadata = await sharp(input, {
        animated: true,
        limitInputPixels: 40_000_000,
      }).metadata();
    } catch {
      res.status(400).send("Avatar image could not be decoded");
      return;
    }
    if (!allowedInputTypes.has(`image/${metadata.format}`)) {
      res.status(400).send("Avatar image format is not supported");
      return;
    }
    if (
      metadata.format === "gif" &&
      process.env.SQ_ALLOW_GIF_AVATARS !== "true"
    ) {
      res.status(400).send("GIF avatars are disabled");
      return;
    }

    const maxResolution = Number(process.env.SQ_AVATAR_MAX_RESOLUTION || 512);
    const maxBytes = Number(process.env.SQ_AVATAR_MAX_SIZE_KB || 512) * 1024;
    let avatar;
    try {
      avatar = await compressAvatar(
        input,
        maxResolution,
        maxBytes,
        metadata.pages > 1,
      );
    } catch (error) {
      res
        .status(error.message?.includes("configured size limit") ? 422 : 400)
        .send(
          error.message?.includes("configured size limit")
            ? error.message
            : "Avatar image could not be processed",
        );
      return;
    }
    const avatarUpdated = Date.now();
    await User.updateOne(
      { _id: req.userId },
      {
        $set: {
          avatar: { data: avatar, contentType: "image/webp" },
          avatarUpdated,
        },
      },
    );
    res.json({ avatarUpdated, size: avatar.length, contentType: "image/webp" });
  } catch (error) {
    next(error);
  }
};

export const deleteAvatar = async (req, res, next) => {
  try {
    await User.updateOne(
      { _id: req.userId },
      { $unset: { avatar: 1, avatarUpdated: 1 } },
    );
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
};

export const serveAvatar = async (req, res, next) => {
  try {
    const user = await User.findOne(
      { username: req.params.username },
      { avatar: 1, avatarUpdated: 1 },
    ).lean();
    if (!user?.avatar?.data) {
      res.sendStatus(404);
      return;
    }
    const avatar = Buffer.isBuffer(user.avatar.data)
      ? user.avatar.data
      : Buffer.from(user.avatar.data.buffer ?? user.avatar.data);
    const version = user.avatarUpdated ? String(user.avatarUpdated) : "0";
    const etag = `W/"${version}-${avatar.length}"`;
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Length", avatar.length);
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.sendStatus(304);
      return;
    }
    res.end(avatar);
  } catch (error) {
    next(error);
  }
};
