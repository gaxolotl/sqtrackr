import slugify from "slugify";
import mongoose from "mongoose";
import Wiki from "../schema/wiki.js";
import { envFlag } from "../utils/env.js";
import {
  getContentLimits,
  validateContentText,
} from "../utils/contentLimits.js";

const slugRegex = /^\/[a-z0-9-_/]*$/i;

const formatSlug = (slug) => {
  if (!slug.startsWith("/")) slug = `/${slug}`;
  if (slug.endsWith("/") && slug !== "/") slug = slug.slice(0, -1);
  const split = slug.split("/");
  const slugified = split.map((token) => slugify(token, { lower: true }));
  return slugified.join("/");
};

export const createWiki = async (req, res, next) => {
  if (req.body.slug && req.body.title && req.body.body) {
    try {
      if (req.userRole !== "admin") {
        res
          .status(403)
          .send("You do not have permission to create a wiki page");
        return;
      }

      const limits = getContentLimits();
      const slugInput = validateContentText(
        req.body.slug,
        "Path",
        200,
        res,
      );
      if (slugInput === null) return;
      const title = validateContentText(
        req.body.title,
        "Title",
        limits.title,
        res,
      );
      if (title === null) return;
      const body = validateContentText(
        req.body.body,
        "Body",
        limits.body,
        res,
        { trim: false },
      );
      if (body === null) return;

      let slug = slugInput;
      slug = formatSlug(slug);

      const validSlug = slugRegex.test(slug);

      if (!validSlug) {
        res.status(400).send("That is not a valid path");
        return;
      }

      const existing = await Wiki.findOne({ slug }).lean();

      if (existing) {
        res
          .status(409)
          .send(
            "Wiki page with this slug already exists. Please choose something unique."
          );
        return;
      }

      const wiki = new Wiki({
        slug,
        title,
        body,
        createdBy: req.userId,
        public: !!req.body.public,
        created: Date.now(),
      });

      await wiki.save();
      res.send(slug);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include slug, title and body");
  }
};

export const getWiki = async (req, res, next) => {
  try {
    let slug = req.params[0];
    if (!slug || slug === "") {
      slug = "/";
    }

    let [page] = await Wiki.aggregate([
      {
        $match: { slug },
      },
      {
        $lookup: {
          from: "users",
          as: "createdBy",
          let: { userId: "$createdBy" },
          pipeline: [
            {
              $match: { $expr: { $eq: ["$_id", "$$userId"] } },
            },
            {
              $project: {
                username: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$createdBy",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const anonymous = envFlag("SQ_ALLOW_UNREGISTERED_VIEW") && !req.userId;

    if (page && anonymous && !page.public) {
      page = null;
    }

    const query = anonymous ? { public: true } : {};
    const allPages = await Wiki.find(query, { slug: 1, title: 1 }).lean();

    if (!page) {
      // The main page does not have to exist yet - the client offers an
      // editor to create it. Any other missing page is a plain 404.
      if (slug === "/") {
        res.json({ page: null, allPages });
        return;
      }
      res.status(404).send("Wiki page does not exist");
      return;
    }

    res.json({ page, allPages });
  } catch (e) {
    next(e);
  }
};
export const deleteWiki = async (req, res, next) => {
  try {
    if (req.userRole !== "admin") {
      res.status(403).send("You do not have permission to delete a wiki page");
      return;
    }

    const slug = req.params[0];

    await Wiki.deleteOne({ slug });
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const updateWiki = async (req, res, next) => {
  if (req.body.slug && req.body.title && req.body.body) {
    try {
      if (req.userRole !== "admin") {
        res
          .status(403)
          .send("You do not have permission to create a wiki page");
        return;
      }

      if (!mongoose.isValidObjectId(req.params.wikiId)) {
        res.status(404).send("That wiki page does not exist");
        return;
      }

      const existing = await Wiki.findOne({ _id: req.params.wikiId }).lean();

      if (!existing) {
        res.status(404).send("That wiki page does not exist");
        return;
      }

      if (existing.slug === "/" && req.body.slug !== "/") {
        res.status(400).send("Root page cannot be moved to a different path");
        return;
      }

      const limits = getContentLimits();
      const slugInput = validateContentText(
        req.body.slug,
        "Path",
        200,
        res,
      );
      if (slugInput === null) return;
      const title = validateContentText(
        req.body.title,
        "Title",
        limits.title,
        res,
      );
      if (title === null) return;
      const body = validateContentText(
        req.body.body,
        "Body",
        limits.body,
        res,
        { trim: false },
      );
      if (body === null) return;

      let slug = slugInput;
      slug = formatSlug(slug);

      const validSlug = slugRegex.test(slug);

      if (!validSlug) {
        res.status(400).send("That is not a valid path");
        return;
      }

      if (slug !== existing.slug) {
        const existingSlug = await Wiki.findOne({ slug }).lean();

        if (existingSlug) {
          res
            .status(409)
            .send(
              "Wiki page with this slug already exists. Please choose something unique."
            );
          return;
        }
      }

      await Wiki.findOneAndUpdate(
        { _id: req.params.wikiId },
        {
          $set: {
            slug,
            title,
            body,
            public: !!req.body.public,
            updated: Date.now(),
          },
        }
      );

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Request must include slug, title and body");
  }
};
