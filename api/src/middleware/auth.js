import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../schema/user.js";
import ApiToken from "../schema/apiToken.js";

const auth = async (req, res, next) => {
  if (req.headers.authorization) {
    const token = req.headers.authorization.replace("Bearer ", "");
    // Personal API tokens are random strings; JWTs are verified below.
    if (token.startsWith("sq_")) {
      try {
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");
        const apiToken = await ApiToken.findOne({
          tokenHash,
          revoked: false,
        });
        if (!apiToken) {
          res.status(500).send("Invalid authentication token");
          return;
        }
        const user = await User.findOne({ _id: apiToken.userId });
        if (!user) {
          res.sendStatus(404);
          return;
        }
        if (user.banned) {
          const reason = user.banReason || "none";
          res.status(403).send(`User is banned. Reason: ${reason}`);
          return;
        }
        req.userId = user._id;
        req.userRole = user.role;
        ApiToken.updateOne(
          { _id: apiToken._id },
          { $set: { lastUsedAt: Date.now() } },
        ).catch(() => {});
        next();
      } catch (err) {
        console.error("[sq] authentication error:", err.message);
        res.status(500).send("Invalid authentication token");
      }
      return;
    }
    try {
      const decoded = jwt.verify(token, process.env.SQ_JWT_SECRET);
      if (decoded) {
        const user = await User.findOne({ _id: decoded.id });
        if (user) {
          if (user.banned) {
            const reason = user.banReason || "none";
            res.status(403).send(`User is banned. Reason: ${reason}`);
            return;
          }
          // "Sign out everywhere" invalidates tokens issued before the bump,
          // with a small skew allowance for same-second re-logins.
          if (
            user.pwdVersionUpdatedAt &&
            (!decoded.iat ||
              decoded.iat * 1000 < user.pwdVersionUpdatedAt - 5000)
          ) {
            res.status(500).send("Invalid authentication token");
            return;
          }
          req.userId = user._id;
          req.userRole = user.role;
          next();
        } else {
          res.sendStatus(404);
        }
      } else {
        res.sendStatus(500);
      }
    } catch (err) {
      console.error("[sq] authentication error:", err.message);
      res.status(500).send("Invalid authentication token");
    }
  } else if (
    req.headers["x-sq-public-access"] === "true" &&
    req.headers["x-sq-server-secret"] === process.env.SQ_SERVER_SECRET
  ) {
    next();
  } else {
    res.sendStatus(401);
  }
};

export default auth;
