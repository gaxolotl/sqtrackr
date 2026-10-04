import mongoose from "mongoose";
import Notification from "../schema/notification.js";

const pageSize = 25;

export const listNotifications = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.params.page, 10) || 0, 0);
    const [items, total] = await Promise.all([
      Notification.find({ userId: req.userId })
        .sort({ created: -1 })
        .skip(page * pageSize)
        .limit(pageSize)
        .lean(),
      Notification.countDocuments({ userId: req.userId }),
    ]);
    res.json({ items, total, page, pageSize });
  } catch (e) {
    next(e);
  }
};

export const getUnreadNotificationCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.userId,
      read: false,
    });
    res.json({ count });
  } catch (e) {
    next(e);
  }
};

export const markNotificationsRead = async (req, res, next) => {
  try {
    const query = { userId: req.userId, read: false };
    if (Array.isArray(req.body?.ids) && req.body.ids.length) {
      const ids = req.body.ids.filter((id) => mongoose.isValidObjectId(id));
      if (!ids.length) {
        res.status(400).send("No valid notification ids");
        return;
      }
      query._id = { $in: ids };
    }
    await Notification.updateMany(query, { $set: { read: true } });
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};
