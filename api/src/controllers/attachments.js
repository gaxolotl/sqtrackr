import mongoose from "mongoose";
import Attachment from "../schema/attachment.js";
import { canModerate } from "../utils/roles.js";

const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
]);

const sanitizeFilename = (value) => {
  const base = String(value ?? "")
    .split("/")
    .pop()
    .split("\\")
    .pop()
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 200);
  return base || "file";
};

export const uploadAttachment = async (req, res, next) => {
  try {
    if (process.env.SQ_ATTACHMENTS_ENABLED === "false") {
      res.status(403).send("Attachments are disabled");
      return;
    }
    const { filename, contentType, data } = req.body ?? {};
    const extension = ALLOWED_TYPES.get(contentType);
    if (!extension || typeof data !== "string") {
      res.status(400).send("Unsupported file type");
      return;
    }
    let buffer;
    try {
      buffer = Buffer.from(data, "base64");
    } catch {
      res.status(400).send("Invalid file data");
      return;
    }
    const maxBytes =
      Number(process.env.SQ_ATTACHMENT_MAX_SIZE_KB || 2048) * 1024;
    if (buffer.length === 0 || buffer.length > maxBytes) {
      res.status(400).send("File is empty or too large");
      return;
    }
    const clean = sanitizeFilename(filename);
    const attachment = await new Attachment({
      filename: clean,
      contentType,
      size: buffer.length,
      data: buffer,
      uploadedBy: req.userId,
      created: Date.now(),
    }).save();
    res.status(200).json({
      id: attachment._id,
      url: `/attachments/file/${attachment._id}`,
      filename: clean,
      size: buffer.length,
    });
  } catch (e) {
    next(e);
  }
};

export const serveAttachment = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) {
      res.status(404).send("Attachment does not exist");
      return;
    }
    const attachment = await Attachment.findOne({ _id: fileId }).lean();
    if (!attachment?.data) {
      res.status(404).send("Attachment does not exist");
      return;
    }
    res.set("Content-Type", attachment.contentType);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Length", String(attachment.size));
    res.send(attachment.data);
  } catch (e) {
    next(e);
  }
};

export const deleteAttachment = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) {
      res.status(404).send("Attachment does not exist");
      return;
    }
    const attachment = await Attachment.findOne({ _id: fileId }).lean();
    if (!attachment) {
      res.status(404).send("Attachment does not exist");
      return;
    }
    if (
      String(attachment.uploadedBy) !== String(req.userId) &&
      !canModerate(req.userRole)
    ) {
      res.status(403).send("You do not have permission to delete this file");
      return;
    }
    await Attachment.deleteOne({ _id: fileId });
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};
