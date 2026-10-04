import AuditLog from "../schema/auditLog.js";

const MAX_ENTRIES = 5000;

const logAudit = async (actorId, action, target, details) => {
  try {
    if (!actorId || !action) return;
    await new AuditLog({
      actorId,
      action,
      target: target ?? "",
      details: details ?? "",
      created: Date.now(),
    }).save();
    const count = await AuditLog.countDocuments();
    if (count > MAX_ENTRIES) {
      const overflow = await AuditLog.find({})
        .sort({ created: 1 })
        .limit(count - MAX_ENTRIES)
        .select("_id")
        .lean();
      await AuditLog.deleteMany({
        _id: { $in: overflow.map((entry) => entry._id) },
      });
    }
  } catch (err) {
    console.error("[sq] failed to write audit log:", err.message);
  }
};

export default logAudit;
