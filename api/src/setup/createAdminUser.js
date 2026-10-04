import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../schema/user.js";
import { envFlag } from "../utils/env.js";
import { sendVerificationEmail } from "../controllers/user.js";

const createAdminUser = async (mail) => {
  const existingAdmin = await User.findOne({ username: "admin" }).lean();
  if (!existingAdmin) {
    const created = Date.now();

    const hash = await bcrypt.hash("admin", 10);

    const adminUser = new User({
      username: "admin",
      email: process.env.SQ_ADMIN_EMAIL,
      role: "admin",
      password: hash,
      created,
      remainingInvites: Number.MAX_SAFE_INTEGER,
      emailVerified: envFlag("SQ_DISABLE_EMAIL"),
    });
    adminUser.uid = crypto
      .createHash("sha256")
      .update(adminUser._id.toString())
      .digest("hex")
      .slice(0, 10);
    adminUser.token = jwt.sign(
      {
        id: adminUser._id,
        created,
        role: "admin",
      },
      process.env.SQ_JWT_SECRET
    );

    await adminUser.save();

    if (!envFlag("SQ_DISABLE_EMAIL")) {
      const emailVerificationValidUntil = created + 48 * 60 * 60 * 1000;
      const emailVerificationToken = jwt.sign(
        {
          user: process.env.SQ_ADMIN_EMAIL,
          validUntil: emailVerificationValidUntil,
        },
        process.env.SQ_JWT_SECRET
      );
      await sendVerificationEmail(
        mail,
        process.env.SQ_ADMIN_EMAIL,
        emailVerificationToken
      );
    }

    console.log("[sq] created initial admin user");
    console.warn(
      "[sq] SECURITY: initial admin uses default password 'admin' - change it immediately",
    );
  } else {
    try {
      const full = await User.findOne({ username: "admin" }).lean();
      if (full && (await bcrypt.compare("admin", full.password))) {
        console.warn(
          "[sq] SECURITY: admin user still uses default password 'admin' - change it immediately",
        );
      }
    } catch {
      // ignore - startup should not fail on warning check
    }
  }
};

export default createAdminUser;
