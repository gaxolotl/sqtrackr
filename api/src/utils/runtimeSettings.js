import * as yup from "yup";
import SiteSettings from "../schema/siteSettings.js";

const hexColor = /^#[a-f0-9]{6}$/i;

export const runtimeSettingsSchema = yup
  .object({
    SQ_SITE_NAME: yup.string().trim().min(1).max(20).required(),
    SQ_SITE_DESCRIPTION: yup.string().trim().min(1).max(80).required(),
    SQ_SHOW_PAGE_IN_TITLE: yup.boolean().required(),
    SQ_CONTENT_CENTERED: yup.boolean().required(),
    SQ_CONTENT_MAX_WIDTH: yup.number().integer().min(640).max(2560).required(),
    SQ_SHORTEN_MATCHED_TORRENT_NAMES: yup.boolean().required(),
    SQ_TORRENT_NAME_MAX_LENGTH: yup.number().integer().min(20).max(1000).required(),
    SQ_CONTENT_TITLE_MAX_LENGTH: yup.number().integer().min(20).max(500).required(),
    SQ_CONTENT_BODY_MAX_LENGTH: yup.number().integer().min(500).max(200000).required(),
    SQ_COMMENT_MAX_LENGTH: yup.number().integer().min(100).max(50000).required(),
    SQ_MESSAGE_MAX_LENGTH: yup.number().integer().min(500).max(100000).required(),
    SQ_PROFILE_BIO_MAX_LENGTH: yup.number().integer().min(50).max(5000).required(),
    SQ_PROFILE_LOCATION_MAX_LENGTH: yup.number().integer().min(20).max(300).required(),
    SQ_MEDIA_INFO_MAX_LENGTH: yup.number().integer().min(1000).max(500000).required(),
    SQ_TORRENT_TAGS_MAX_LENGTH: yup.number().integer().min(50).max(5000).required(),
    SQ_TORRENT_FILE_MAX_SIZE_KB: yup.number().integer().min(64).max(10240).required(),
    SQ_ALLOW_REGISTER: yup
      .string()
      .oneOf(["open", "invite", "closed"])
      .required(),
    SQ_ALLOW_ANONYMOUS_UPLOADS: yup.boolean().required(),
    SQ_TORRENT_PREMODERATION: yup.boolean().required(),
    SQ_MINIMUM_RATIO: yup.number().min(-1).max(100).required(),
    SQ_MAXIMUM_HIT_N_RUNS: yup.number().integer().min(-1).max(10000).required(),
    SQ_MIN_SEEDTIME_HOURS: yup.number().min(0).max(8760).required(),
    SQ_HNR_GRACE_HOURS: yup.number().min(0).max(8760).required(),
    SQ_TORRENT_CATEGORIES: yup.object().required(),
    SQ_BP_EARNED_PER_GB: yup.number().min(0).max(100000).required(),
    SQ_BP_EARNED_PER_FILLED_REQUEST: yup.number().min(0).max(100000).required(),
    SQ_BP_COST_PER_INVITE: yup.number().min(0).max(100000).required(),
    SQ_BP_COST_PER_GB: yup.number().min(0).max(100000).required(),
    SQ_SITE_WIDE_FREELEECH: yup.boolean().required(),
    SQ_ALLOW_UNREGISTERED_VIEW: yup.boolean().required(),
    SQ_EXTENSION_BLACKLIST: yup
      .array()
      .of(yup.string().trim().max(20))
      .required(),
    SQ_CLIENT_BLACKLIST: yup
      .array()
      .of(yup.string().trim().max(20))
      .required(),
    SQ_SITE_DEFAULT_LOCALE: yup
      .string()
      .oneOf(["en", "bg", "es", "it", "ru", "de", "zh", "eo", "fr"])
      .required(),
    SQ_CUSTOM_THEME: yup
      .object({
        primary: yup.string().matches(hexColor).required(),
        background: yup.string().matches(hexColor).optional(),
        sidebar: yup.string().matches(hexColor).optional(),
        border: yup.string().matches(hexColor).optional(),
        text: yup.string().matches(hexColor).optional(),
        grey: yup.string().matches(hexColor).optional(),
      })
      .required(),
    SQ_AVATAR_MAX_RESOLUTION: yup
      .number()
      .integer()
      .min(64)
      .max(2048)
      .required(),
    SQ_AVATAR_MAX_SIZE_KB: yup.number().integer().min(32).max(5120).required(),
    SQ_ALLOW_GIF_AVATARS: yup.boolean().required(),
    SQ_ENABLE_RSS_READERS: yup.boolean().required(),
    SQ_TORRENT_ACTION_ORDER: yup
      .array()
      .of(yup.string().trim().min(1).max(64))
      .max(50)
      .required(),
  })
  .strict()
  .noUnknown()
  .required();

const jsonKeys = new Set([
  "SQ_TORRENT_CATEGORIES",
  "SQ_TORRENT_ACTION_ORDER",
  "SQ_EXTENSION_BLACKLIST",
  "SQ_CLIENT_BLACKLIST",
  "SQ_CUSTOM_THEME",
]);
const booleanKeys = new Set([
  "SQ_SHOW_PAGE_IN_TITLE",
  "SQ_CONTENT_CENTERED",
  "SQ_SHORTEN_MATCHED_TORRENT_NAMES",
  "SQ_ALLOW_ANONYMOUS_UPLOADS",
  "SQ_TORRENT_PREMODERATION",
  "SQ_SITE_WIDE_FREELEECH",
  "SQ_ALLOW_UNREGISTERED_VIEW",
  "SQ_ALLOW_GIF_AVATARS",
  "SQ_ENABLE_RSS_READERS",
]);
const numberKeys = new Set([
  "SQ_MINIMUM_RATIO",
  "SQ_MAXIMUM_HIT_N_RUNS",
  "SQ_MIN_SEEDTIME_HOURS",
  "SQ_HNR_GRACE_HOURS",
  "SQ_BP_EARNED_PER_GB",
  "SQ_BP_EARNED_PER_FILLED_REQUEST",
  "SQ_BP_COST_PER_INVITE",
  "SQ_BP_COST_PER_GB",
  "SQ_AVATAR_MAX_RESOLUTION",
  "SQ_AVATAR_MAX_SIZE_KB",
  "SQ_CONTENT_MAX_WIDTH",
  "SQ_TORRENT_NAME_MAX_LENGTH",
  "SQ_CONTENT_TITLE_MAX_LENGTH",
  "SQ_CONTENT_BODY_MAX_LENGTH",
  "SQ_COMMENT_MAX_LENGTH",
  "SQ_MESSAGE_MAX_LENGTH",
  "SQ_PROFILE_BIO_MAX_LENGTH",
  "SQ_PROFILE_LOCATION_MAX_LENGTH",
  "SQ_MEDIA_INFO_MAX_LENGTH",
  "SQ_TORRENT_TAGS_MAX_LENGTH",
  "SQ_TORRENT_FILE_MAX_SIZE_KB",
]);

const fallbackValues = {
  SQ_MIN_SEEDTIME_HOURS: "72",
  SQ_HNR_GRACE_HOURS: "24",
  SQ_AVATAR_MAX_RESOLUTION: "512",
  SQ_AVATAR_MAX_SIZE_KB: "512",
  SQ_ALLOW_GIF_AVATARS: "true",
  SQ_ENABLE_RSS_READERS: "true",
  SQ_SHOW_PAGE_IN_TITLE: "true",
  SQ_CONTENT_CENTERED: "false",
  SQ_CONTENT_MAX_WIDTH: "1040",
  SQ_SHORTEN_MATCHED_TORRENT_NAMES: "true",
  SQ_TORRENT_NAME_MAX_LENGTH: "500",
  SQ_CONTENT_TITLE_MAX_LENGTH: "200",
  SQ_CONTENT_BODY_MAX_LENGTH: "50000",
  SQ_COMMENT_MAX_LENGTH: "10000",
  SQ_MESSAGE_MAX_LENGTH: "50000",
  SQ_PROFILE_BIO_MAX_LENGTH: "500",
  SQ_PROFILE_LOCATION_MAX_LENGTH: "80",
  SQ_MEDIA_INFO_MAX_LENGTH: "100000",
  SQ_TORRENT_TAGS_MAX_LENGTH: "500",
  SQ_TORRENT_FILE_MAX_SIZE_KB: "1024",
  SQ_TORRENT_PREMODERATION: "false",
  SQ_TORRENT_ACTION_ORDER:
    '["upvote","downvote","bookmark","freeleech","delete"]',
};

const parseEnvironmentValue = (key, value) => {
  if (jsonKeys.has(key)) {
    try {
      return JSON.parse(
        value ||
          (key === "SQ_TORRENT_CATEGORIES"
            ? "{}"
            : key === "SQ_CUSTOM_THEME"
              ? '{"primary":"#f45d48"}'
              : "[]"),
      );
    } catch {
      return key === "SQ_TORRENT_CATEGORIES"
        ? {}
        : key === "SQ_CUSTOM_THEME"
          ? { primary: "#f45d48" }
          : [];
    }
  }
  if (booleanKeys.has(key)) return value === "true";
  if (numberKeys.has(key)) return Number(value);
  return value;
};

export const getRuntimeSettings = () => {
  const settings = {};
  for (const key of Object.keys(runtimeSettingsSchema.fields)) {
    const fallback = fallbackValues[key] ?? "";
    settings[key] = parseEnvironmentValue(key, process.env[key] ?? fallback);
  }
  return settings;
};

export const applyRuntimeSettings = (settings) => {
  for (const [key, value] of Object.entries(settings)) {
    process.env[key] =
      value !== null && typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  }
};

export const loadRuntimeSettings = async () => {
  const saved = await SiteSettings.findById("runtime").lean();
  if (saved?.values) applyRuntimeSettings(saved.values);
};
