import Notification from "../schema/notification.js";

const MAX_PER_USER = 200;

const pushNotification = async (userId, { type, title, link }) => {
  try {
    if (!userId) return;
    await new Notification({
      userId,
      type,
      title,
      link,
      read: false,
      created: Date.now(),
    }).save();
    const count = await Notification.countDocuments({ userId });
    if (count > MAX_PER_USER) {
      const overflow = await Notification.find({ userId })
        .sort({ created: 1 })
        .limit(count - MAX_PER_USER)
        .select("_id")
        .lean();
      await Notification.deleteMany({
        _id: { $in: overflow.map((entry) => entry._id) },
      });
    }
  } catch (err) {
    console.error("[sq] failed to push notification:", err.message);
  }
};

export default pushNotification;
