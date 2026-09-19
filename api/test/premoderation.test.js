import assert from "node:assert/strict";
import test from "node:test";
import Torrent from "../src/schema/torrent.js";
import TorrentSubmission from "../src/schema/torrentSubmission.js";
import Conversation from "../src/schema/conversation.js";
import Message from "../src/schema/message.js";
import {
  approveTorrentSubmission,
  rejectTorrentSubmission,
} from "../src/controllers/uploadModeration.js";
import {
  getRuntimeSettings,
  runtimeSettingsSchema,
} from "../src/utils/runtimeSettings.js";
import { shouldPremoderateUpload } from "../src/utils/premoderation.js";

test("premoderation queues only ordinary user uploads when enabled", () => {
  assert.equal(
    shouldPremoderateUpload({ enabled: false, role: "user" }),
    false,
  );
  assert.equal(shouldPremoderateUpload({ enabled: true, role: "user" }), true);
  assert.equal(
    shouldPremoderateUpload({ enabled: true, role: "staff" }),
    false,
  );
  assert.equal(
    shouldPremoderateUpload({ enabled: true, role: "admin" }),
    false,
  );
  assert.equal(
    shouldPremoderateUpload({ enabled: true, role: undefined }),
    true,
  );
});

test("runtime settings require a boolean premoderation value", async () => {
  const field = runtimeSettingsSchema.fields.SQ_TORRENT_PREMODERATION;
  assert.equal(await field.validate(true), true);
  await assert.rejects(() => field.validate("true", { strict: true }));
  const previous = process.env.SQ_TORRENT_PREMODERATION;
  delete process.env.SQ_TORRENT_PREMODERATION;
  assert.equal(getRuntimeSettings().SQ_TORRENT_PREMODERATION, false);
  if (previous === undefined) delete process.env.SQ_TORRENT_PREMODERATION;
  else process.env.SQ_TORRENT_PREMODERATION = previous;
});

test("unpublished submissions use a collection separate from torrents", () => {
  assert.notEqual(Torrent.collection.name, TorrentSubmission.collection.name);
  assert.deepEqual(TorrentSubmission.schema.path("status").enumValues, [
    "pending",
    "approving",
    "approved",
    "rejected",
  ]);
  assert.equal(TorrentSubmission.schema.path("status").defaultValue, "pending");
  const infoHashIndexes = TorrentSubmission.schema
    .indexes()
    .filter(([fields]) => fields.infoHash === 1);
  assert.equal(infoHashIndexes.length, 1);
  assert.equal(
    infoHashIndexes[0][1].name,
    "pending_torrent_submission_info_hash",
  );
  assert.equal(infoHashIndexes[0][1].unique, true);
});

test("approval publishes a pending submission and notifies its uploader", async () => {
  const originals = {
    submissionFindById: TorrentSubmission.findById,
    submissionFindOneAndUpdate: TorrentSubmission.findOneAndUpdate,
    submissionUpdateOne: TorrentSubmission.updateOne,
    torrentFindOne: Torrent.findOne,
    torrentCreate: Torrent.create,
    conversationFindOneAndUpdate: Conversation.findOneAndUpdate,
    conversationUpdateOne: Conversation.updateOne,
    messageCreate: Message.create,
    messageFindOne: Message.findOne,
  };
  const submission = {
    _id: "507f191e810c19729de860ea",
    infoHash: "0123456789abcdef0123456789abcdef01234567",
    binary: "torrent-data",
    uploadedBy: "507f191e810c19729de860eb",
    name: "Example release",
    status: "pending",
    submittedAt: 1,
    files: [],
    tags: [],
  };
  let published;
  let sentMessage;

  try {
    TorrentSubmission.findById = async () => ({ ...submission });
    TorrentSubmission.findOneAndUpdate = async (filter, update) => ({
      ...submission,
      status: update.$set.status ?? "approving",
      reviewedBy: "507f191e810c19729de860ec",
      torrent: update.$set.torrent,
    });
    TorrentSubmission.updateOne = async () => ({ acknowledged: true });
    Torrent.findOne = (filter) => {
      if (filter.submission) return Promise.resolve(null);
      return { select: () => ({ lean: async () => null }) };
    };
    Torrent.create = async (values) => {
      published = values;
      return {
        ...values,
        _id: "507f191e810c19729de860ed",
        save: async () => {},
      };
    };
    Conversation.findOneAndUpdate = async () => ({
      _id: "507f191e810c19729de860ee",
    });
    Conversation.updateOne = async () => ({ acknowledged: true });
    Message.create = async (values) => {
      sentMessage = values;
      return values;
    };

    const response = {
      body: null,
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(body) {
        this.body = body;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    let nextError;
    await approveTorrentSubmission(
      {
        userId: "507f191e810c19729de860ec",
        userRole: "staff",
        params: { submissionId: submission._id },
      },
      response,
      (error) => {
        nextError = error;
      },
    );

    assert.equal(nextError, undefined);
    assert.deepEqual(response.body, {
      infoHash: submission.infoHash,
      status: "approved",
    });
    assert.equal(published.submission, submission._id);
    assert.equal(published.infoHash, submission.infoHash);
    assert.equal(sentMessage.sender, undefined);
    assert.equal(sentMessage.system, true);
    assert.equal(sentMessage.body.includes("was approved"), true);
  } finally {
    TorrentSubmission.findById = originals.submissionFindById;
    TorrentSubmission.findOneAndUpdate = originals.submissionFindOneAndUpdate;
    TorrentSubmission.updateOne = originals.submissionUpdateOne;
    Torrent.findOne = originals.torrentFindOne;
    Torrent.create = originals.torrentCreate;
    Conversation.findOneAndUpdate = originals.conversationFindOneAndUpdate;
    Conversation.updateOne = originals.conversationUpdateOne;
    Message.create = originals.messageCreate;
    Message.findOne = originals.messageFindOne;
  }
});

test("rejection retains the decision and sends the reason", async () => {
  const originals = {
    submissionFindById: TorrentSubmission.findById,
    submissionFindOneAndUpdate: TorrentSubmission.findOneAndUpdate,
    submissionUpdateOne: TorrentSubmission.updateOne,
    conversationFindOneAndUpdate: Conversation.findOneAndUpdate,
    conversationUpdateOne: Conversation.updateOne,
    messageCreate: Message.create,
    messageFindOne: Message.findOne,
  };
  const submission = {
    _id: "507f191e810c19729de860ea",
    infoHash: "0123456789abcdef0123456789abcdef01234567",
    uploadedBy: "507f191e810c19729de860eb",
    name: "Example release",
    status: "pending",
  };
  let decisionUpdate;
  let sentMessage;

  try {
    TorrentSubmission.findById = async () => ({ ...submission });
    TorrentSubmission.findOneAndUpdate = async (filter, update) => {
      decisionUpdate = update;
      return {
        ...submission,
        status: "rejected",
        reviewedBy: "507f191e810c19729de860ec",
        rejectionReason: update.$set.rejectionReason,
      };
    };
    TorrentSubmission.updateOne = async () => ({ acknowledged: true });
    Conversation.findOneAndUpdate = async () => ({
      _id: "507f191e810c19729de860ee",
    });
    Conversation.updateOne = async () => ({ acknowledged: true });
    Message.create = async (values) => {
      sentMessage = values;
      return values;
    };

    const response = {
      body: null,
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(body) {
        this.body = body;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    let nextError;
    await rejectTorrentSubmission(
      {
        body: { reason: "Missing source information" },
        userId: "507f191e810c19729de860ec",
        userRole: "staff",
        params: { submissionId: submission._id },
      },
      response,
      (error) => {
        nextError = error;
      },
    );

    assert.equal(nextError, undefined);
    assert.equal(response.body.status, "rejected");
    assert.equal(
      decisionUpdate.$set.rejectionReason,
      "Missing source information",
    );
    assert.equal(decisionUpdate.$unset.binary, 1);
    assert.equal(sentMessage.body.includes("Missing source information"), true);
  } finally {
    TorrentSubmission.findById = originals.submissionFindById;
    TorrentSubmission.findOneAndUpdate = originals.submissionFindOneAndUpdate;
    TorrentSubmission.updateOne = originals.submissionUpdateOne;
    Conversation.findOneAndUpdate = originals.conversationFindOneAndUpdate;
    Conversation.updateOne = originals.conversationUpdateOne;
    Message.create = originals.messageCreate;
    Message.findOne = originals.messageFindOne;
  }
});
