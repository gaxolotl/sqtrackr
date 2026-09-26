import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import User from "../schema/user.js";
import Invite from "../schema/invite.js";
import Progress from "../schema/progress.js";
import Snatch from "../schema/snatch.js";
import { getTorrentsPage } from "./torrent.js";
import { getUserRatio } from "../utils/ratio.js";
import { getUserHitNRuns } from "../utils/hitnrun.js";
import { BYTES_GB } from "../tracker/announce.js";
import { envFlag } from "../utils/env.js";
import { isAdmin, VALID_ROLES } from "../utils/roles.js";
import { getContentLimits } from "../utils/contentLimits.js";

export const sendVerificationEmail = async (mail, address, token) => {
  await mail.sendMail({
    from: `"${process.env.SQ_SITE_NAME}" <${process.env.SQ_MAIL_FROM_ADDRESS}>`,
    to: address,
    subject: "Verify your email address",
    text: `Thank you for joining ${process.env.SQ_SITE_NAME}. Please follow the link below to verify your email address.
        
${process.env.SQ_BASE_URL}/verify-email?token=${token}`,
  });
};

export const register = (mail) => async (req, res, next) => {
  if (
    process.env.SQ_ALLOW_REGISTER !== "open" &&
    process.env.SQ_ALLOW_REGISTER !== "invite"
  ) {
    res.status(403).send("Registration is currently closed");
    return;
  }

  if (req.body.username && req.body.email && req.body.password) {
    let invite;
    let inviter;

    if (process.env.SQ_ALLOW_REGISTER === "invite") {
      if (!req.body.invite) {
        res
          .status(403)
          .send(
            "Registration is currently invite only. Please provide a valid invitation token",
          );
        return;
      }
    }

    if (req.body.invite) {
      try {
        const decoded = jwt.verify(req.body.invite, process.env.SQ_JWT_SECRET);
        const { id } = decoded;

        invite = await Invite.findOne({ _id: id }).lean();
        if (!invite) {
          res.status(403).send("Invitation does not exist");
          return;
        }
        const { claimed, validUntil, invitingUser, email } = invite;

        if (claimed) {
          res.status(403).send("Invitation has already been claimed");
          return;
        }

        if (validUntil < Date.now()) {
          res.status(403).send("Invitation has expired");
          return;
        }

        if (email !== req.body.email) {
          res
            .status(403)
            .send("Email address does not match invited email address");
          return;
        }

        inviter = await User.findOne({ _id: invitingUser }).lean();
        if (!inviter || inviter.banned) {
          res
            .status(403)
            .send("Inviting user doesn’t exist or has been banned");
          return;
        }
      } catch (err) {
        console.error("[sq] error verifying invitation:", err.message);
        res.status(500).send("Error verifying invitation");
        return;
      }
    }

    const normalizedUsername = req.body.username.toLowerCase();
    const created = Date.now();
    let inviteClaimed = false;
    let legacyInviteDebited = false;
    let accountCreated = false;

    try {
      const user = await User.findOne({
        $or: [{ email: req.body.email }, { username: normalizedUsername }],
      });

      if (!user) {
        if (!/^[a-z0-9.]+$/i.test(normalizedUsername)) {
          res
            .status(400)
            .send("Username can only consist of letters, numbers, and “.”");
          return;
        }

        const hash = await bcrypt.hash(req.body.password, 10);
        if (invite) {
          const claimedInvite = await Invite.findOneAndUpdate(
            { _id: invite._id, claimed: false },
            { $set: { claimed: true } },
            { new: true },
          ).lean();
          if (!claimedInvite) {
            res.status(403).send("Invitation has already been claimed");
            return;
          }
          inviteClaimed = true;

          if (invite.reserved !== true) {
            const debitedInviter = await User.findOneAndUpdate(
              {
                _id: invite.invitingUser,
                remainingInvites: { $gte: 1 },
              },
              { $inc: { remainingInvites: -1 } },
            ).lean();
            if (!debitedInviter) {
              await Invite.updateOne(
                { _id: invite._id },
                { $set: { claimed: false } },
              );
              inviteClaimed = false;
              res.status(403).send("Inviting user has no remaining invites");
              return;
            }
            legacyInviteDebited = true;
          }
        }

        const requestedRole = VALID_ROLES.includes(invite?.role)
          ? invite.role
          : "user";
        const role =
          requestedRole !== "user" && inviter?.role !== "admin"
            ? "user"
            : requestedRole;

        const newUser = new User({
          username: normalizedUsername,
          email: req.body.email,
          password: hash,
          torrents: {},
          created,
          role,
          invitedBy: invite?.invitingUser,
          remainingInvites: 0,
          emailVerified: envFlag("SQ_DISABLE_EMAIL"),
          bonusPoints: 0,
          totp: {
            enabled: false,
          },
        });

        newUser.uid = crypto
          .createHash("sha256")
          .update(newUser._id.toString())
          .digest("hex")
          .slice(0, 10);

        const createdUser = await newUser.save();
        accountCreated = true;

        if (!envFlag("SQ_DISABLE_EMAIL")) {
          const emailVerificationValidUntil = created + 48 * 60 * 60 * 1000;
          const emailVerificationToken = jwt.sign(
            {
              user: req.body.email,
              validUntil: emailVerificationValidUntil,
            },
            process.env.SQ_JWT_SECRET,
          );
          await sendVerificationEmail(
            mail,
            req.body.email,
            emailVerificationToken,
          );
        }

        if (createdUser) {
          res.send({
            token: jwt.sign(
              {
                id: newUser._id,
                username: newUser.username,
                created,
                role,
              },
              process.env.SQ_JWT_SECRET,
            ),
            id: createdUser._id,
            uid: createdUser.uid,
            username: createdUser.username,
          });
        } else {
          res.status(500).send("User could not be created");
        }
      } else {
        res
          .status(409)
          .send(
            "An account with that email address or username already exists",
          );
      }
    } catch (e) {
      if (inviteClaimed && !accountCreated) {
        await Invite.updateOne(
          { _id: invite._id },
          { $set: { claimed: false } },
        ).catch(() => {});
        if (legacyInviteDebited) {
          await User.updateOne(
            { _id: invite.invitingUser },
            { $inc: { remainingInvites: 1 } },
          ).catch(() => {});
        }
      }
      next(e);
    }
  } else {
    res.status(400).send("Request must include email, username and password");
  }
};

export const login = async (req, res, next) => {
  if (req.body.username && req.body.password) {
    try {
      if (
        typeof req.body.username !== "string" ||
        typeof req.body.password !== "string"
      ) {
        res.status(400).send("Request must include username and password");
        return;
      }

      const requestedUsername = req.body.username;
      // ensure older case sensitive usernames can login still
      let user = await User.findOne({ username: requestedUsername }).lean();

      if (!user) {
        user = await User.findOne({
          username: requestedUsername.toLowerCase(),
        }).lean();
      }

      if (user) {
        if (user.banned) {
          const reason = user.banReason || "none";
          res.status(403).send(`User is banned. Reason: ${reason}`);
          return;
        }

        if (user.totp.enabled && !req.body.totp) {
          res.status(401).send("One-time code required");
          return;
        }

        const matches = await bcrypt.compare(req.body.password, user.password);

        if (user.totp.enabled) {
          const validToken = speakeasy.totp.verify({
            secret: user.totp.secret,
            encoding: "base32",
            token: req.body.totp,
            window: 1,
          });

          if (!validToken) {
            if (!user.totp.backup.includes(req.body.totp)) {
              res.status(401).send("Invalid one-time code");
              return;
            } else {
              await User.findOneAndUpdate(
                { username: user.username },
                { $pull: { "totp.backup": req.body.totp } },
              );
            }
          }
        }

        if (matches) {
          res.send({
            token: jwt.sign(
              {
                id: user._id,
                username: user.username,
                created: user.created,
                role: user.role,
              },
              process.env.SQ_JWT_SECRET,
            ),
            id: user._id,
            uid: user.uid,
            username: user.username,
          });
        } else {
          res.status(401).send("Incorrect login details");
        }
      } else {
        res.status(404).send("Incorrect login details");
      }
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include username and password");
  }
};

export const generateInvite = (mail) => async (req, res, next) => {
  if (process.env.SQ_ALLOW_REGISTER !== "invite" && !isAdmin(req.userRole)) {
    res
      .status(403)
      .send("Can only send invites when tracker is in invite only mode");
    return;
  }

  if (!req.body.email || !req.body.role) {
    res.status(400).send("Request must include email, role");
    return;
  }

  const requestedRole = req.body.role;
  if (!VALID_ROLES.includes(requestedRole)) {
    res.status(400).send("Role must be one of user, staff, admin");
    return;
  }

  const admin = isAdmin(req.userRole);
  let inviteReserved = false;
  let inviteSaved = false;

  try {
    if (!admin) {
      const reservingUser = await User.findOneAndUpdate(
        { _id: req.userId, remainingInvites: { $gte: 1 } },
        { $inc: { remainingInvites: -1 } },
      ).lean();
      if (!reservingUser) {
        res.status(403).send("You do not have any remaining invites");
        return;
      }
      inviteReserved = true;
    }

    const created = Date.now();
    const validUntil = created + 48 * 60 * 60 * 1000;
    const invite = new Invite({
      invitingUser: req.userId,
      created,
      validUntil,
      claimed: false,
      reserved: true,
      email: req.body.email,
      role: admin ? requestedRole : "user",
    });

    invite.token = jwt.sign(
      { id: invite._id, validUntil },
      process.env.SQ_JWT_SECRET,
    );

    const createdInvite = await invite.save();
    inviteSaved = true;

    if (!envFlag("SQ_DISABLE_EMAIL")) {
      await mail.sendMail({
        from: `"${process.env.SQ_SITE_NAME}" <${process.env.SQ_MAIL_FROM_ADDRESS}>`,
        to: req.body.email,
        subject: "Invite",
        text: `You have been invited to join ${process.env.SQ_SITE_NAME}. Please follow the link below to register.
        
${process.env.SQ_BASE_URL}/register?token=${createdInvite.token}`,
      });
    }
    res.send(createdInvite);
  } catch (e) {
    if (inviteReserved && !inviteSaved) {
      await User.updateOne(
        { _id: req.userId },
        { $inc: { remainingInvites: 1 } },
      ).catch(() => {});
    }
    next(e);
  }
};

export const fetchInvites = async (req, res, next) => {
  try {
    const invites = await Invite.find({ invitingUser: req.userId }, null, {
      sort: { created: -1 },
    }).lean();
    res.json(invites);
  } catch (e) {
    next(e);
  }
};

export const changePassword = (mail) => async (req, res, next) => {
  if (req.body.password && req.body.newPassword) {
    try {
      const user = await User.findOne({ _id: req.userId }).lean();

      if (!user) {
        res.status(404).send("User does not exist");
        return;
      }

      const matches = await bcrypt.compare(req.body.password, user.password);

      if (!matches) {
        res.status(401).send("Incorrect password");
        return;
      }

      const hash = await bcrypt.hash(req.body.newPassword, 10);

      await User.findOneAndUpdate(
        { _id: req.userId },
        {
          $set: {
            password: hash,
            pwdVersion: crypto.randomBytes(24).toString("hex"),
          },
        },
      );

      if (!envFlag("SQ_DISABLE_EMAIL")) {
        await mail.sendMail({
          from: `"${process.env.SQ_SITE_NAME}" <${process.env.SQ_MAIL_FROM_ADDRESS}>`,
          to: user.email,
          subject: "Your password was changed",
          text: `Your password was updated successfully at ${new Date().toISOString()} from ${
            req.ip
          }.
        
If you did not perform this action, follow the link below immediately to reset your password. If this was you, no action is required. 
        
${process.env.SQ_BASE_URL}/reset-password/initiate`,
        });
      }

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include password and newPassword");
  }
};

export const initiatePasswordReset = (mail) => async (req, res, next) => {
  if (req.body.email) {
    try {
      if (typeof req.body.email !== "string") {
        res.status(400).send("Request must include email");
        return;
      }

      const user = await User.findOne({ email: req.body.email }).lean();

      if (!user) {
        res.sendStatus(200);
        return;
      }

      const token = jwt.sign(
        {
          user: req.body.email,
          validUntil: Date.now() + 24 * 60 * 60 * 1000,
          key: user.pwdVersion,
        },
        process.env.SQ_JWT_SECRET,
      );

      if (!envFlag("SQ_DISABLE_EMAIL")) {
        await mail.sendMail({
          from: `"${process.env.SQ_SITE_NAME}" <${process.env.SQ_MAIL_FROM_ADDRESS}>`,
          to: user.email,
          subject: "Password reset",
          text: `Please follow the link below to reset your password.
        
${process.env.SQ_BASE_URL}/reset-password/finalise?token=${token}`,
        });
      }

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include email");
  }
};

export const finalisePasswordReset = async (req, res, next) => {
  if (req.body.email && req.body.newPassword && req.body.token) {
    try {
      const { email, newPassword, token } = req.body;

      if (
        typeof email !== "string" ||
        typeof newPassword !== "string" ||
        typeof token !== "string"
      ) {
        res
          .status(400)
          .send("Request must include email, newPassword and token");
        return;
      }

      const user = await User.findOne({ email }).lean();

      if (!user) {
        res.status(404).send("User does not exist");
        return;
      }

      const {
        user: tokenEmail,
        validUntil,
        key,
      } = jwt.verify(token, process.env.SQ_JWT_SECRET);

      if (tokenEmail !== email) {
        res.status(403).send("Token is invalid");
        return;
      }

      if (key !== user.pwdVersion) {
        res.status(403).send("Token has already been used");
        return;
      }

      if (validUntil < Date.now()) {
        res.status(403).send("Token has expired");
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 10);

      await User.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            password: newHash,
            pwdVersion: crypto.randomBytes(24).toString("hex"),
          },
        },
      );

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include email, newPassword and token");
  }
};

export const fetchUser = (tracker) => async (req, res, next) => {
  try {
    const { username } = req.params;

    const [user] = await User.aggregate([
      {
        $match: { username },
      },
      {
        $project: {
          _id: 1,
          username: 1,
          created: 1,
          role: 1,
          bio: 1,
          location: 1,
          website: 1,
          avatarUpdated: 1,
          ...(req.userRole === "admin"
            ? { email: 1, emailVerified: 1, invitedBy: 1 }
            : {}),
          ...(req.userRole === "admin"
            ? {
                remainingInvites: 1,
                banned: 1,
                banReason: 1,
                bonusPoints: 1,
                "totp.enabled": 1,
              }
            : {}),
        },
      },
      {
        $lookup: {
          from: "comments",
          as: "comments",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$userId", "$$userId"] },
              },
            },
            {
              $facet: {
                torrent: [
                  {
                    $match: {
                      type: "torrent",
                    },
                  },
                  {
                    $lookup: {
                      from: "torrents",
                      as: "torrent",
                      let: { torrentId: "$parentId" },
                      pipeline: [
                        {
                          $match: {
                            $expr: { $eq: ["$_id", "$$torrentId"] },
                          },
                        },
                        { $project: { name: 1, infoHash: 1 } },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: "$torrent",
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                ],
                announcement: [
                  {
                    $match: {
                      type: "announcement",
                    },
                  },
                  {
                    $lookup: {
                      from: "announcements",
                      as: "announcement",
                      let: { announcementId: "$parentId" },
                      pipeline: [
                        {
                          $match: {
                            $expr: { $eq: ["$_id", "$$announcementId"] },
                          },
                        },
                        { $project: { title: 1, slug: 1 } },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: "$announcement",
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                ],
                request: [
                  {
                    $match: {
                      type: "request",
                    },
                  },
                  {
                    $lookup: {
                      from: "requests",
                      as: "request",
                      let: { requestId: "$parentId" },
                      pipeline: [
                        {
                          $match: {
                            $expr: { $eq: ["$_id", "$$requestId"] },
                          },
                        },
                        { $project: { title: 1, index: 1 } },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: "$request",
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$comments",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          comments: {
            $concatArrays: [
              "$comments.torrent",
              "$comments.announcement",
              "$comments.request",
            ],
          },
        },
      },
      {
        $addFields: {
          comments: {
            $sortArray: { input: "$comments", sortBy: { created: -1 } },
          },
        },
      },
      {
        $lookup: {
          from: "progresses",
          as: "downloaded",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$userId", "$$userId"] },
                "downloaded.total": { $gt: 0 },
              },
            },
            {
              $group: {
                _id: "downloaded",
                bytes: { $sum: "$downloaded.total" },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "progresses",
          as: "uploaded",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$userId", "$$userId"] },
                "uploaded.total": { $gt: 0 },
              },
            },
            {
              $group: {
                _id: "uploaded",
                bytes: { $sum: "$uploaded.total" },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          as: "invitedBy",
          let: { invitingUserId: "$invitedBy" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$invitingUserId"] },
              },
            },
            {
              $project: {
                username: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: "$downloaded", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$uploaded", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$invitedBy", preserveNullAndEmptyArrays: true } },
    ]);

    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }

    const { ratio } = await getUserRatio(user._id);
    user.ratio = ratio;

    user.hitnruns = await getUserHitNRuns(user._id);
    user.snatches = await Snatch.countDocuments({ userId: user._id });

    const { torrents } = await getTorrentsPage({
      uploadedBy: user._id,
      userId: req.userId,
      tracker,
    });
    user.torrents = torrents;

    res.json(user);
  } catch (e) {
    next(e);
  }
};

export const getUserStats = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.userId }).lean();

    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }

    const ratioStats = await getUserRatio(user._id);
    const hitnruns = await getUserHitNRuns(user._id);
    const snatches = await Snatch.countDocuments({ userId: user._id });

    res.json({
      ...ratioStats,
      bp: Number(user.bonusPoints ?? 0),
      hitnruns,
      snatches,
    });
  } catch (e) {
    next(e);
  }
};

export const getUserRole = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.userId }).lean();
    res.send(user.role);
  } catch (e) {
    next(e);
  }
};

export const getUserVerifiedEmailStatus = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.userId }).lean();
    res.send(!!user.emailVerified);
  } catch (e) {
    next(e);
  }
};

export const verifyUserEmail = async (req, res, next) => {
  if (req.body.token) {
    try {
      const { user: email, validUntil } = jwt.verify(
        req.body.token,
        process.env.SQ_JWT_SECRET,
      );

      if (validUntil < Date.now()) {
        res.status(403).send("Token has expired");
        return;
      }

      const user = await User.findOne({ email }).lean();

      if (!user) {
        res.status(404).send("User does not exist");
        return;
      }

      if (user.emailVerified) {
        res.status(400).send("Email address is already verified");
        return;
      }

      await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } });

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include token");
  }
};

export const banUser = async (req, res, next) => {
  try {
    if (req.userRole !== "admin") {
      res.status(401).send("You do not have permission to ban a user");
      return;
    }

    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }

    // Extract the optional reason from the request body
    // If it's empty, null, or undefined, fall back to "none"
    if (
      req.body.reason !== undefined &&
      (typeof req.body.reason !== "string" ||
        req.body.reason.length > getContentLimits().comment)
    ) {
      res
        .status(400)
        .send(
          `Ban reason cannot exceed ${getContentLimits().comment} characters`,
        );
      return;
    }
    const banReason = req.body.reason?.trim() || "none";

    await User.findOneAndUpdate(
      { username: req.params.username },
      {
        $set: {
          banned: true,
          banReason: banReason, // Save the reason to the database
        },
      },
    );

    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const buyItems = async (req, res, next) => {
  if (req.body.type && req.body.amount !== undefined) {
    try {
      const amount = Number(req.body.amount);

      if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
        res.status(400).send("Amount must be an integer between 1 and 1000");
        return;
      }

      const user = await User.findOne({ _id: req.userId }).lean();
      if (!user) {
        res.status(404).send("User does not exist");
        return;
      }
      const balance = Number(user.bonusPoints ?? 0);

      if (req.body.type === "invite") {
        const unitCost = Number(process.env.SQ_BP_COST_PER_INVITE ?? 0);
        if (!Number.isFinite(unitCost) || unitCost <= 0) {
          res.status(403).send("Not available to buy");
          return;
        }

        const cost = amount * unitCost;
        if (cost > balance) {
          res.status(403).send("Not enough points for transaction");
          return;
        }

        const updated = await User.findOneAndUpdate(
          { _id: req.userId, bonusPoints: { $gte: cost } },
          {
            $inc: {
              remainingInvites: amount,
              bonusPoints: cost * -1,
            },
          },
          { new: true },
        ).lean();
        if (!updated) {
          res.status(403).send("Not enough points for transaction");
          return;
        }

        res.status(200).send(Number(updated.bonusPoints ?? 0).toString());
      } else if (req.body.type === "upload") {
        const unitCost = Number(process.env.SQ_BP_COST_PER_GB ?? 0);
        if (!Number.isFinite(unitCost) || unitCost <= 0) {
          res.status(403).send("Not available to buy");
          return;
        }

        const cost = amount * unitCost;
        if (cost > balance) {
          res.status(403).send("Not enough points for transaction");
          return;
        }

        const updated = await User.findOneAndUpdate(
          { _id: req.userId, bonusPoints: { $gte: cost } },
          {
            $inc: {
              bonusPoints: cost * -1,
            },
          },
          { new: true },
        ).lean();
        if (!updated) {
          res.status(403).send("Not enough points for transaction");
          return;
        }

        try {
          const progressRecord = new Progress({
            infoHash: `purchase-${Date.now()}`,
            userId: req.userId,
            uploaded: {
              session: BYTES_GB * amount,
              total: BYTES_GB * amount,
            },
            downloaded: {
              session: 0,
              total: 0,
            },
            left: 0,
          });

          await progressRecord.save();
        } catch (progressError) {
          await User.findOneAndUpdate(
            { _id: req.userId },
            { $inc: { bonusPoints: cost } },
          ).catch(() => {});
          throw progressError;
        }

        res.status(200).send(Number(updated.bonusPoints ?? 0).toString());
      } else {
        res.status(400).send("Type must be one of invite, upload");
        return;
      }
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include type, amount");
  }
};

export const unbanUser = async (req, res, next) => {
  try {
    if (req.userRole !== "admin") {
      res.status(401).send("You do not have permission to unban a user");
      return;
    }

    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }

    await User.findOneAndUpdate(
      { username: req.params.username },
      { $set: { banned: false } },
    );

    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const setUserRole = async (req, res, next) => {
  try {
    if (!isAdmin(req.userRole)) {
      res.status(401).send("You do not have permission to change user roles");
      return;
    }

    const role = typeof req.body.role === "string" ? req.body.role : "";
    if (!VALID_ROLES.includes(role)) {
      res.status(400).send("Role must be one of user, staff, admin");
      return;
    }

    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }

    if (user.username === "admin" && role !== "admin") {
      res.status(403).send("Primary admin account must remain an admin");
      return;
    }

    if (user._id.toString() === req.userId.toString() && role !== "admin") {
      res.status(403).send("You cannot remove your own admin role");
      return;
    }

    await User.findOneAndUpdate({ _id: user._id }, { $set: { role } });
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const generateTotpSecret = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.userId }).lean();
    if (user.totp.enabled) {
      res.status(409).send("TOTP already enabled");
      return;
    }

    const secret = speakeasy.generateSecret({ length: 20 });
    const url = speakeasy.otpauthURL({
      secret: secret.ascii,
      label: `${process.env.SQ_SITE_NAME}: ${user.username}`,
    });
    const imageDataUrl = await qrcode.toDataURL(url);

    await User.findOneAndUpdate(
      { _id: req.userId },
      {
        $set: {
          "totp.secret": secret.base32,
          "totp.qr": imageDataUrl,
        },
      },
    );

    res.json({ qr: imageDataUrl, secret: secret.base32 });
  } catch (e) {
    next(e);
  }
};

export const enableTotp = async (req, res, next) => {
  if (req.body.token) {
    try {
      const user = await User.findOne({ _id: req.userId }).lean();
      if (user.totp.enabled) {
        res.status(409).send("TOTP already enabled");
        return;
      }

      const validToken = speakeasy.totp.verify({
        secret: user.totp.secret,
        encoding: "base32",
        token: req.body.token,
        window: 1,
      });

      if (!validToken) {
        res.status(400).send("Invalid TOTP code");
        return;
      }

      const backupCodes = [...Array(10)].map(() =>
        crypto.randomBytes(32).toString("hex").slice(0, 10),
      );

      await User.findOneAndUpdate(
        { _id: req.userId },
        {
          $set: {
            "totp.enabled": true,
            "totp.backup": backupCodes,
          },
        },
      );

      res.send(backupCodes.join(","));
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include token");
  }
};

export const disableTotp = async (req, res, next) => {
  if (req.body.token) {
    try {
      const user = await User.findOne({ _id: req.userId }).lean();

      const validToken = speakeasy.totp.verify({
        secret: user.totp.secret,
        encoding: "base32",
        token: req.body.token,
        window: 1,
      });

      if (!validToken) {
        res.status(400).send("Invalid TOTP code");
        return;
      }

      await User.findOneAndUpdate(
        { _id: req.userId },
        {
          $set: {
            "totp.enabled": false,
            "totp.secret": "",
            "totp.qr": "",
            "totp.backup": [],
          },
        },
      );

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include token");
  }
};

export const deleteAccount = async (req, res, next) => {
  if (req.body.password) {
    try {
      const user = await User.findOne({ _id: req.userId }).lean();

      if (!user) {
        res.status(404).send("User does not exist");
        return;
      }

      if (user.username === "admin") {
        res.status(403).send("Primary admin account cannot be deleted");
        return;
      }

      const matches = await bcrypt.compare(req.body.password, user.password);

      if (!matches) {
        res.status(401).send("Incorrect password");
        return;
      }

      await User.deleteOne({ _id: req.userId });

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include password");
  }
};

export const getUserBookmarks = (tracker) => async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.userId }).lean();
    const bookmarks = await getTorrentsPage({
      ids: user.bookmarks,
      userId: req.userId,
      tracker,
    });
    res.json(bookmarks);
  } catch (e) {
    next(e);
  }
};
