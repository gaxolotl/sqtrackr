import assert from "node:assert/strict";
import test from "node:test";
import User from "../src/schema/user.js";
import Conversation from "../src/schema/conversation.js";
import Message from "../src/schema/message.js";
import { buyItems } from "../src/controllers/user.js";
import { listMembers } from "../src/controllers/moderation.js";
import { sendMessage } from "../src/controllers/messages.js";
import { sendSystemMessage } from "../src/utils/directMessage.js";
import TorrentSubmission from "../src/schema/torrentSubmission.js";
import { listMyTorrentSubmissions } from "../src/controllers/uploadModeration.js";

const mockRes = () => {
  const res = {
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
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
};

test("bonus shop blocks purchases when balance is too low", async () => {
  const originalFindOne = User.findOne;
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  const previousCost = process.env.SQ_BP_COST_PER_INVITE;
  process.env.SQ_BP_COST_PER_INVITE = "3";
  try {
    User.findOne = () => ({ lean: async () => ({ _id: "u1", bonusPoints: 0 }) });
    let updated = false;
    User.findOneAndUpdate = async () => {
      updated = true;
      return null;
    };
    const res = mockRes();
    let nextError;
    await buyItems(
      { body: { type: "invite", amount: "1" }, userId: "u1" },
      res,
      (e) => {
        nextError = e;
      },
    );
    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 403);
    assert.equal(updated, false);
  } finally {
    User.findOne = originalFindOne;
    User.findOneAndUpdate = originalFindOneAndUpdate;
    if (previousCost === undefined) delete process.env.SQ_BP_COST_PER_INVITE;
    else process.env.SQ_BP_COST_PER_INVITE = previousCost;
  }
});

test("bonus shop blocks purchases when balance is missing", async () => {
  const originalFindOne = User.findOne;
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  const previousCost = process.env.SQ_BP_COST_PER_GB;
  process.env.SQ_BP_COST_PER_GB = "3";
  try {
    User.findOne = () => ({ lean: async () => ({ _id: "u1" }) });
    let updated = false;
    User.findOneAndUpdate = async () => {
      updated = true;
      return null;
    };
    const res = mockRes();
    let nextError;
    await buyItems(
      { body: { type: "upload", amount: 1 }, userId: "u1" },
      res,
      (e) => {
        nextError = e;
      },
    );
    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 403);
    assert.equal(updated, false);
  } finally {
    User.findOne = originalFindOne;
    User.findOneAndUpdate = originalFindOneAndUpdate;
    if (previousCost === undefined) delete process.env.SQ_BP_COST_PER_GB;
    else process.env.SQ_BP_COST_PER_GB = previousCost;
  }
});

test("bonus shop rejects non-integer amounts", async () => {
  const res = mockRes();
  let nextError;
  await buyItems(
    { body: { type: "invite", amount: "1.5" }, userId: "u1" },
    res,
    (e) => {
      nextError = e;
    },
  );
  assert.equal(nextError, undefined);
  assert.equal(res.statusCode, 400);
});

test("members list requires admin role", async () => {
  const res = mockRes();
  let nextError;
  await listMembers(
    { userRole: "staff", query: {} },
    res,
    (e) => {
      nextError = e;
    },
  );
  assert.equal(nextError, undefined);
  assert.equal(res.statusCode, 403);
});

test("system notifications use a conflict-free upsert", async () => {
  const originalFindOneAndUpdate = Conversation.findOneAndUpdate;
  const originalUpdateOne = Conversation.updateOne;
  const originalCreate = Message.create;
  try {
    let capturedUpdate;
    Conversation.findOneAndUpdate = async (filter, update, options) => {
      capturedUpdate = update;
      assert.equal(filter.directKey, "system:u1");
      assert.equal(options?.upsert, true);
      return { _id: "c1" };
    };
    Conversation.updateOne = async () => ({ acknowledged: true });
    Message.create = async (values) => ({
      _id: "m1",
      ...values,
      created: Date.now(),
    });
    await sendSystemMessage({
      recipientId: "u1",
      body: "hello",
      notificationKey: "test-key",
    });
    const operatorPaths = Object.entries(capturedUpdate ?? {}).flatMap(
      ([operator, paths]) =>
        Object.keys(paths ?? {}).map((path) => `${operator}:${path}`),
    );
    const topLevelPaths = Object.values(capturedUpdate ?? {}).flatMap(
      (paths) => Object.keys(paths ?? {}),
    );
    assert.equal(
      new Set(topLevelPaths).size,
      topLevelPaths.length,
      `conflicting update paths: ${operatorPaths.join(", ")}`,
    );
  } finally {
    Conversation.findOneAndUpdate = originalFindOneAndUpdate;
    Conversation.updateOne = originalUpdateOne;
    Message.create = originalCreate;
  }
});

test("my submissions are scoped to the requesting uploader", async () => {
  const originalFind = TorrentSubmission.find;
  const originalCount = TorrentSubmission.countDocuments;
  try {
    let capturedQuery;
    const chain = {
      select() {
        return chain;
      },
      sort() {
        return chain;
      },
      skip() {
        return chain;
      },
      limit() {
        return chain;
      },
      lean: async () => [],
    };
    TorrentSubmission.find = (query) => {
      capturedQuery = query;
      return chain;
    };
    TorrentSubmission.countDocuments = async () => 0;
    const res = mockRes();
    let nextError;
    await listMyTorrentSubmissions(
      { userId: "u1", query: {} },
      res,
      (e) => {
        nextError = e;
      },
    );
    assert.equal(nextError, undefined);
    assert.deepEqual(capturedQuery, { uploadedBy: "u1" });
    assert.equal(res.body.total, 0);
  } finally {
    TorrentSubmission.find = originalFind;
    TorrentSubmission.countDocuments = originalCount;
  }
});

test("system conversations cannot be replied to", async () => {
  const originalFindOne = Conversation.findOne;
  try {
    Conversation.findOne = async () => ({
      _id: "c1",
      system: true,
      readOnly: true,
    });
    const res = mockRes();
    let nextError;
    await sendMessage(
      {
        params: { conversationId: "507f191e810c19729de860ea" },
        body: { body: "hello" },
        userId: "u1",
      },
      res,
      (e) => {
        nextError = e;
      },
    );
    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 403);
  } finally {
    Conversation.findOne = originalFindOne;
  }
});
