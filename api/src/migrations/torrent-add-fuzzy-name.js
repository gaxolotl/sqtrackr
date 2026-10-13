import mongoose from "mongoose";
import { createNGrams } from "mongoose-fuzzy-searching/helpers/index.js";
import Torrent from "../schema/torrent.js";
import config from "../../../config.js";

(async () => {
  await mongoose.connect(config.envs.SQ_MONGO_URL);

  console.log("[sq] connected to mongodb successfully");

  for await (const doc of Torrent.find()) {
    if (!doc.name_fuzzy?.some((n) => n !== "")) {
      createNGrams(doc, ["name"]);
      await Torrent.findByIdAndUpdate(doc._id, {
        $set: {
          name_fuzzy: doc.name_fuzzy,
        },
      });
    }
  }

  process.exit(0);
})();
