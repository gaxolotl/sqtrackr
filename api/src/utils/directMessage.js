import Conversation from "../schema/conversation.js";
import Message from "../schema/message.js";

export const sendDirectMessage = async ({
  senderId,
  recipientId,
  body,
  notificationKey,
}) => {
  const created = Date.now();
  const participants = [senderId, recipientId];
  const directKey = participants
    .map((participant) => participant.toString())
    .sort()
    .join(":");
  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      { directKey },
      {
        $setOnInsert: {
          participants,
          participantSince: participants.map((userId) => ({ userId, created })),
          createdBy: senderId,
          created,
          directKey,
        },
      },
      { new: true, upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    conversation = await Conversation.findOne({ directKey });
    if (!conversation) throw error;
  }

  let message;
  try {
    message = await Message.create({
      conversation: conversation._id,
      sender: senderId,
      body,
      created,
      readBy: [senderId],
      notificationKey,
    });
  } catch (error) {
    if (error?.code !== 11000 || !notificationKey) throw error;
    message = await Message.findOne({ notificationKey }).lean();
    if (!message) throw error;
  }

  await Conversation.updateOne(
    {
      _id: conversation._id,
      $or: [
        { "lastMessage.created": { $exists: false } },
        { "lastMessage.created": { $lt: message.created } },
      ],
    },
    {
      $set: {
        archivedBy: [],
        lastMessage: {
          userId: message.sender,
          body: message.body,
          created: message.created,
        },
      },
    },
  );

  return conversation._id;
};
