import mongoose from "mongoose";
import Conversation from "../schema/conversation.js";
import Message from "../schema/message.js";
import User from "../schema/user.js";
import { getContentLimits } from "../utils/contentLimits.js";
import { sendDirectMessage } from "../utils/directMessage.js";
import pushNotification from "../utils/notify.js";

const parsePage = (value) => Math.max(parseInt(value, 10) || 0, 0);

const viewerJoinedAt = (userId) => ({
  $ifNull: [
    {
      $arrayElemAt: [
        {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: ["$participantSince", []] },
                as: "membership",
                cond: { $eq: ["$$membership.userId", userId] },
              },
            },
            as: "membership",
            in: "$$membership.created",
          },
        },
        0,
      ],
    },
    "$created",
  ],
});

const validateBody = (body, res) => {
  if (typeof body !== "string" || body.trim().length === 0) {
    res.status(400).send("Message body is required");
    return false;
  }
  const maxLength = getContentLimits().message;
  if (body.length > maxLength) {
    res
      .status(400)
      .send(`Message body cannot exceed ${maxLength} characters`);
    return false;
  }
  return true;
};

const validateConversationId = (conversationId, res) => {
  if (!mongoose.isValidObjectId(conversationId)) {
    res.status(400).send("Invalid conversation ID");
    return false;
  }
  return true;
};

const findConversationForUser = async (conversationId, userId) =>
  Conversation.findOne({
    _id: conversationId,
    participants: userId,
    archivedBy: { $ne: userId },
  });

const getJoinedAt = (conversation, userId) =>
  conversation.participantSince?.find(
    (entry) => entry.userId.toString() === userId.toString(),
  )?.created ?? conversation.created;

const normalizeUsernames = (participants, res) => {
  if (!Array.isArray(participants)) {
    res.status(400).send("Participants must be an array of usernames");
    return null;
  }

  if (participants.some((username) => typeof username !== "string")) {
    res.status(400).send("Participants must be an array of usernames");
    return null;
  }

  const usernames = participants.map((username) => username.trim());
  if (usernames.some((username) => !username)) {
    res.status(400).send("Participant usernames cannot be empty");
    return null;
  }
  if (usernames.some((username) => username.length > 32)) {
    res.status(400).send("Participant usernames cannot exceed 32 characters");
    return null;
  }
  return usernames;
};

export const getUnreadCount = async (req, res, next) => {
  try {
    const [{ count = 0 } = {}] = await Conversation.aggregate([
      { $match: { participants: req.userId, archivedBy: { $ne: req.userId } } },
      {
        $lookup: {
          from: Message.collection.name,
          let: {
            conversationId: "$_id",
            joinedAt: viewerJoinedAt(req.userId),
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$conversation", "$$conversationId"] },
                    { $gte: ["$created", "$$joinedAt"] },
                    { $ne: ["$sender", req.userId] },
                    { $not: [{ $in: [req.userId, "$readBy"] }] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "unread",
        },
      },
      {
        $group: {
          _id: null,
          count: {
            $sum: { $ifNull: [{ $first: "$unread.count" }, 0] },
          },
        },
      },
    ]);

    res.send({ count });
  } catch (e) {
    next(e);
  }
};

export const getInbox = async (req, res, next) => {
  const pageSize = 25;
  const page = parsePage(req.params.page);

  try {
    const [{ metadata, conversations }] = await Conversation.aggregate([
      { $match: { participants: req.userId, archivedBy: { $ne: req.userId } } },
      { $sort: { "lastMessage.created": -1, _id: -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          conversations: [
            { $skip: page * pageSize },
            { $limit: pageSize },
            { $set: { viewerJoinedAt: viewerJoinedAt(req.userId) } },
            {
              $lookup: {
                from: User.collection.name,
                let: { participantIds: "$participants" },
                pipeline: [
                  { $match: { $expr: { $in: ["$_id", "$$participantIds"] } } },
                  { $project: { username: 1, avatarUpdated: 1 } },
                ],
                as: "participants",
              },
            },
            {
              $lookup: {
                from: User.collection.name,
                let: { senderId: "$lastMessage.userId" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$senderId"] } } },
                  { $project: { username: 1, avatarUpdated: 1 } },
                ],
                as: "lastMessageSender",
              },
            },
            {
              $lookup: {
                from: Message.collection.name,
                let: {
                  conversationId: "$_id",
                  joinedAt: viewerJoinedAt(req.userId),
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$conversation", "$$conversationId"] },
                          { $gte: ["$created", "$$joinedAt"] },
                          { $ne: ["$sender", req.userId] },
                          { $not: [{ $in: [req.userId, "$readBy"] }] },
                        ],
                      },
                    },
                  },
                  { $count: "count" },
                ],
                as: "unread",
              },
            },
            {
              $set: {
                lastMessage: {
                  $cond: [
                    { $gte: ["$lastMessage.created", "$viewerJoinedAt"] },
                    {
                      userId: { $first: "$lastMessageSender" },
                      body: "$lastMessage.body",
                      created: "$lastMessage.created",
                    },
                    null,
                  ],
                },
                unreadCount: { $ifNull: [{ $first: "$unread.count" }, 0] },
              },
            },
            {
              $project: {
                lastMessageSender: 0,
                unread: 0,
                participantSince: 0,
                directKey: 0,
                archivedBy: 0,
                viewerJoinedAt: 0,
                __v: 0,
              },
            },
          ],
        },
      },
    ]);

    res.send({
      total: metadata[0]?.total || 0,
      page,
      pageSize,
      conversations,
    });
  } catch (e) {
    next(e);
  }
};

export const createConversation = async (req, res, next) => {
  const body = req.body?.body;
  if (!validateBody(body, res)) return;

  const usernames = normalizeUsernames(req.body?.participants, res);
  if (!usernames) return;

  const requestedSubject = req.body?.subject;
  if (requestedSubject !== undefined && typeof requestedSubject !== "string") {
    res.status(400).send("Subject must be a string");
    return;
  }
  const subjectLimit = Math.min(getContentLimits().title, 120);
  if (requestedSubject?.length > subjectLimit) {
    res
      .status(400)
      .send(`Subject cannot exceed ${subjectLimit} characters`);
    return;
  }
  const subject = requestedSubject?.trim();

  try {
    const sender = await User.findById(req.userId, { username: 1 }).lean();
    if (!sender) {
      res.status(404).send("Current user does not exist");
      return;
    }

    const otherUsernames = usernames.filter(
      (username) => username !== sender.username,
    );
    if (new Set(otherUsernames).size !== otherUsernames.length) {
      res.status(400).send("Participant usernames must be unique");
      return;
    }
    if (otherUsernames.length < 1 || otherUsernames.length > 7) {
      res.status(400).send("Conversation must include 1 to 7 other users");
      return;
    }

    const users = await User.find(
      { username: { $in: otherUsernames } },
      { username: 1, banned: 1 },
    ).lean();
    if (
      users.length !== otherUsernames.length ||
      users.some((user) => user.banned)
    ) {
      res.status(400).send("One or more users do not exist or are banned");
      return;
    }

    const created = Date.now();
    const participantIds = [req.userId, ...users.map((user) => user._id)];
    if (participantIds.length === 2) {
      const conversationId = await sendDirectMessage({
        senderId: req.userId,
        recipientId: users[0]._id,
        body,
      });
      res.send({ conversationId });
      return;
    }
    const participantSince = participantIds.map((userId) => ({
      userId,
      created,
    }));
    const conversation = new Conversation({
      participants: participantIds,
      participantSince,
      createdBy: req.userId,
      created,
      archivedBy: [],
      ...(subject ? { subject } : {}),
    });

    const message = new Message({
      conversation: conversation._id,
      sender: req.userId,
      body,
      created,
      readBy: [req.userId],
    });
    conversation.lastMessage = {
      userId: req.userId,
      body,
      created,
    };
    conversation.archivedBy = [];

    await conversation.save();
    await message.save();
    res.send({ conversationId: conversation._id });
  } catch (e) {
    next(e);
  }
};

export const getConversation = async (req, res, next) => {
  const { conversationId } = req.params;
  if (!validateConversationId(conversationId, res)) return;

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.userId,
      archivedBy: { $ne: req.userId },
    })
      .select("participants createdBy created subject system readOnly")
      .populate({
        path: "participants",
        select: "username avatarUpdated",
        model: User,
      })
      .lean();
    if (!conversation) {
      res.status(404).send("Conversation does not exist");
      return;
    }
    res.send(conversation);
  } catch (e) {
    next(e);
  }
};

export const getMessages = async (req, res, next) => {
  const { conversationId } = req.params;
  if (!validateConversationId(conversationId, res)) return;

  const pageSize = 50;

  try {
    const conversation = await findConversationForUser(
      conversationId,
      req.userId,
    );
    if (!conversation) {
      res.status(404).send("Conversation does not exist");
      return;
    }

    const joinedAt = getJoinedAt(conversation, req.userId);
    const filter = {
      conversation: conversationId,
      created: { $gte: joinedAt },
    };
    const total = await Message.countDocuments(filter);
    const page =
      req.params.page === "latest"
        ? Math.max(Math.ceil(total / pageSize) - 1, 0)
        : parsePage(req.params.page);
    const messages = await Message.find(filter)
      .sort({ created: 1, _id: 1 })
      .skip(page * pageSize)
      .limit(pageSize)
      .select("sender body created readBy system")
      .populate({
        path: "sender",
        select: "username avatarUpdated",
        model: User,
      })
      .lean();

    res.send({ total, page, pageSize, messages });
  } catch (e) {
    next(e);
  }
};

export const sendMessage = async (req, res, next) => {
  const { conversationId } = req.params;
  if (!validateConversationId(conversationId, res)) return;
  const body = req.body?.body;
  if (!validateBody(body, res)) return;

  try {
    const conversation = await findConversationForUser(
      conversationId,
      req.userId,
    );
    if (!conversation) {
      res.status(404).send("Conversation does not exist");
      return;
    }
    if (conversation.system || conversation.readOnly) {
      res.status(403).send("System messages cannot be replied to");
      return;
    }

    const created = Date.now();
    const message = new Message({
      conversation: conversation._id,
      sender: req.userId,
      body,
      created,
      readBy: [req.userId],
    });
    conversation.lastMessage = {
      userId: req.userId,
      body,
      created,
    };
    conversation.archivedBy = [];

    await message.save();
    await conversation.save();
    const sender = await User.findOne({ _id: req.userId })
      .select("username")
      .lean();
    for (const participant of conversation.participants ?? []) {
      if (String(participant) === String(req.userId)) continue;
      await pushNotification(participant, {
        type: "message",
        title: `New message from ${sender?.username ?? "Unknown"}`,
        link: `/messages/${conversation._id}`,
      });
    }
    res.send({ _id: message._id });
  } catch (e) {
    next(e);
  }
};

export const markConversationRead = async (req, res, next) => {
  const { conversationId } = req.params;
  if (!validateConversationId(conversationId, res)) return;
  const through = Number(req.body?.through);
  if (!Number.isFinite(through)) {
    res.status(400).send("Read timestamp is required");
    return;
  }

  try {
    const conversation = await findConversationForUser(
      conversationId,
      req.userId,
    );
    if (!conversation) {
      res.status(404).send("Conversation does not exist");
      return;
    }

    const joinedAt = getJoinedAt(conversation, req.userId);
    await Message.updateMany(
      {
        conversation: conversation._id,
        created: { $gte: joinedAt, $lte: through },
        sender: { $ne: req.userId },
      },
      { $addToSet: { readBy: req.userId } },
    );
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const addParticipants = async (req, res, next) => {
  const { conversationId } = req.params;
  if (!validateConversationId(conversationId, res)) return;

  const usernames = normalizeUsernames(req.body?.participants, res);
  if (!usernames) return;
  if (usernames.length < 1) {
    res.status(400).send("At least one participant is required");
    return;
  }
  if (new Set(usernames).size !== usernames.length) {
    res.status(400).send("Participant usernames must be unique");
    return;
  }

  try {
    const membership = await Conversation.findOne(
      { _id: conversationId, participants: req.userId },
      { _id: 1, createdBy: 1, participants: 1, system: 1, readOnly: 1 },
    ).lean();
    if (!membership) {
      res.status(404).send("Conversation does not exist");
      return;
    }
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      res.status(404).send("Conversation does not exist");
      return;
    }
    if (conversation.system || conversation.readOnly) {
      res.status(403).send("System conversations cannot be modified");
      return;
    }
    if (conversation.createdBy?.toString() !== req.userId.toString()) {
      res.status(403).send("You do not have permission to add participants");
      return;
    }
    if (conversation.participants.length + usernames.length > 8) {
      res
        .status(400)
        .send("Conversations cannot have more than 8 participants");
      return;
    }

    const users = await User.find(
      { username: { $in: usernames } },
      { username: 1, banned: 1 },
    ).lean();
    if (
      users.length !== usernames.length ||
      users.some((user) => user.banned)
    ) {
      res.status(400).send("One or more users do not exist or are banned");
      return;
    }

    const participantSet = new Set(
      conversation.participants.map((participant) => participant.toString()),
    );
    if (users.some((user) => participantSet.has(user._id.toString()))) {
      res.status(409).send("One or more users are already participants");
      return;
    }

    const joinedAt = Date.now();
    conversation.participants.push(...users.map((user) => user._id));
    conversation.participantSince ??= [];
    conversation.participantSince.push(
      ...users.map((user) => ({ userId: user._id, created: joinedAt })),
    );
    conversation.directKey = undefined;
    await conversation.save();
    await conversation.populate({
      path: "participants",
      select: "username",
      model: User,
    });
    res.send({ participants: conversation.participants });
  } catch (e) {
    next(e);
  }
};

export const archiveConversation = async (req, res, next) => {
  const { conversationId } = req.params;
  if (!validateConversationId(conversationId, res)) return;

  try {
    const conversation = await findConversationForUser(
      conversationId,
      req.userId,
    );
    if (!conversation) {
      res.status(404).send("Conversation does not exist");
      return;
    }

    await Conversation.updateOne(
      { _id: conversation._id },
      { $addToSet: { archivedBy: req.userId } },
    );
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const leaveConversation = async (req, res, next) => {
  const { conversationId } = req.params;
  if (!validateConversationId(conversationId, res)) return;

  try {
    const conversation = await findConversationForUser(
      conversationId,
      req.userId,
    );
    if (!conversation) {
      res.status(404).send("Conversation does not exist");
      return;
    }
    if (conversation.participants.length <= 2) {
      res
        .status(400)
        .send("One-to-one conversations can be archived, not left");
      return;
    }

    conversation.participants = conversation.participants.filter(
      (participant) => participant.toString() !== req.userId.toString(),
    );
    conversation.archivedBy = conversation.archivedBy.filter(
      (participant) => participant.toString() !== req.userId.toString(),
    );
    conversation.participantSince = conversation.participantSince.filter(
      (membership) => membership.userId.toString() !== req.userId.toString(),
    );
    if (conversation.createdBy.toString() === req.userId.toString()) {
      conversation.createdBy = conversation.participants[0];
    }
    await conversation.save();
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};
