import jwt from "jsonwebtoken";
import User from "../schema/user.js";

const auth = async (req, res, next) => {
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    const token =
      parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : "";
    if (!token) {
      res.status(401).send("Invalid authentication token");
      return;
    }
    try {
      const decoded = jwt.verify(token, process.env.SQ_JWT_SECRET);
      if (decoded) {
        const user = await User.findOne(
          { _id: decoded.id },
          { role: 1, banned: 1, banReason: 1, pwdVersion: 1 },
        ).lean();
        if (user) {
          if (user.banned) {
            const reason = user.banReason || "none";
            res.status(403).send(`User is banned. Reason: ${reason}`);
            return;
          }
          if (
            decoded.pwdVersion &&
            user.pwdVersion &&
            decoded.pwdVersion !== user.pwdVersion
          ) {
            res.status(401).send("Invalid authentication token");
            return;
          }
          req.userId = user._id;
          req.userRole = user.role;
          next();
        } else {
          res.status(401).send("Invalid authentication token");
        }
      } else {
        res.status(401).send("Invalid authentication token");
      }
    } catch (err) {
      console.error("[sq] authentication error:", err.message);
      res.status(401).send("Invalid authentication token");
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
