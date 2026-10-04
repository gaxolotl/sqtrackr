import * as yup from "yup";

const httpRegex = /http(s)?:\/\/.*/;
const mongoRegex = /mongodb:\/\/.*/;
const hexRegex = /#([a-f0-9]){6}/i;

const configSchema = yup
  .object({
    envs: yup
      .object({
        SQ_SITE_NAME: yup.string().min(1).max(20).required(),
        SQ_SITE_DESCRIPTION: yup.string().min(1).max(80).required(),
        SQ_SHOW_PAGE_IN_TITLE: yup.boolean(),
        SQ_CONTENT_CENTERED: yup.boolean(),
        SQ_CONTENT_MAX_WIDTH: yup.number().integer().min(640).max(2560),
        SQ_SHORTEN_MATCHED_TORRENT_NAMES: yup.boolean(),
        SQ_TORRENT_NAME_MAX_LENGTH: yup.number().integer().min(20).max(1000),
        SQ_CONTENT_TITLE_MAX_LENGTH: yup.number().integer().min(20).max(500),
        SQ_CONTENT_BODY_MAX_LENGTH: yup.number().integer().min(500).max(200000),
        SQ_COMMENT_MAX_LENGTH: yup.number().integer().min(100).max(50000),
        SQ_MESSAGE_MAX_LENGTH: yup.number().integer().min(500).max(100000),
        SQ_PROFILE_BIO_MAX_LENGTH: yup.number().integer().min(50).max(5000),
        SQ_PROFILE_LOCATION_MAX_LENGTH: yup.number().integer().min(20).max(300),
        SQ_MEDIA_INFO_MAX_LENGTH: yup.number().integer().min(1000).max(500000),
        SQ_TORRENT_TAGS_MAX_LENGTH: yup.number().integer().min(50).max(5000),
        SQ_TORRENT_FILE_MAX_SIZE_KB: yup.number().integer().min(64).max(10240),
        SQ_ALLOW_REGISTER: yup
          .string()
          .oneOf(["open", "invite", "closed"])
          .required(),
        SQ_ALLOW_ANONYMOUS_UPLOADS: yup.boolean().required(),
        SQ_TORRENT_PREMODERATION: yup.boolean(),
        SQ_MINIMUM_RATIO: yup.number().min(-1).required(),
        SQ_MAXIMUM_HIT_N_RUNS: yup.number().integer().min(-1).required(),
        SQ_MIN_SEEDTIME_HOURS: yup.number().min(0).max(8760),
        SQ_HNR_GRACE_HOURS: yup.number().min(0).max(8760),
        SQ_BP_EARNED_PER_GB: yup.number().min(0).required(),
        SQ_BP_EARNED_PER_FILLED_REQUEST: yup.number().min(0).required(),
        SQ_BP_COST_PER_INVITE: yup.number().min(0).required(),
        SQ_BP_COST_PER_GB: yup.number().min(0).required(),
        SQ_SITE_WIDE_FREELEECH: yup.boolean().required(),
        SQ_TORRENT_CATEGORIES: yup.lazy((value) => {
          const entries = Object.keys(value).reduce((obj, key) => {
            obj[key] = yup
              .array()
              .of(yup.string())
              .min(0)
              .test(
                `${key}-items-unique`,
                `Sources in category "${key}" must be unique`,
                (value) =>
                  value.every(
                    (source) => value.filter((c) => c === source).length === 1,
                  ),
              );
            return obj;
          }, {});
          return yup.object(entries).required();
        }),
        SQ_ALLOW_UNREGISTERED_VIEW: yup.boolean().required(),
        SQ_CUSTOM_THEME: yup.object({
          primary: yup.string().matches(hexRegex),
          background: yup.string().matches(hexRegex),
          sidebar: yup.string().matches(hexRegex),
          border: yup.string().matches(hexRegex),
          text: yup.string().matches(hexRegex),
          grey: yup.string().matches(hexRegex),
        }),
        SQ_EXTENSION_BLACKLIST: yup.array().of(yup.string()).min(0),
        SQ_CLIENT_BLACKLIST: yup.array().of(yup.string()).min(0),
        SQ_SITE_DEFAULT_LOCALE: yup
          .string()
          .oneOf(["en", "bg", "es", "it", "ru", "de", "zh", "eo", "fr"]),
        SQ_AVATAR_MAX_RESOLUTION: yup.number().integer().min(64).max(2048),
        SQ_AVATAR_MAX_SIZE_KB: yup.number().integer().min(32).max(5120),
        SQ_ALLOW_GIF_AVATARS: yup.boolean(),
        SQ_ENABLE_RSS_READERS: yup.boolean(),
        SQ_ENABLE_FORUM: yup.boolean(),
        SQ_ENABLE_ANNOUNCEMENTS: yup.boolean(),
        SQ_ENABLE_RSS: yup.boolean(),
        SQ_BASE_URL: yup.string().matches(httpRegex).required(),
        SQ_API_URL: yup.string().matches(httpRegex).required(),
        SQ_ANNOUNCE_URL: yup.string().matches(httpRegex),
        SQ_MONGO_URL: yup.string().matches(mongoRegex).required(),
        SQ_DISABLE_EMAIL: yup.boolean(),
        SQ_MAIL_FROM_ADDRESS: yup
          .string()
          .email()
          .when("SQ_DISABLE_EMAIL", {
            is: (val) => val !== true,
            then: (schema) => schema.required(),
          }),
        SQ_SMTP_HOST: yup.string().when("SQ_DISABLE_EMAIL", {
          is: (val) => val !== true,
          then: (schema) => schema.required(),
        }),
        SQ_SMTP_PORT: yup
          .number()
          .integer()
          .min(1)
          .max(65535)
          .when("SQ_DISABLE_EMAIL", {
            is: (val) => val !== true,
            then: (schema) => schema.required(),
          }),
        SQ_SMTP_SECURE: yup.boolean().when("SQ_DISABLE_EMAIL", {
          is: (val) => val !== true,
          then: (schema) => schema.required(),
        }),
      })
      .strict()
      .noUnknown()
      .required(),
    secrets: yup
      .object({
        SQ_JWT_SECRET: yup.string().required(),
        SQ_SERVER_SECRET: yup.string().required(),
        SQ_ADMIN_EMAIL: yup.string().email().required(),
        SQ_SMTP_USER: yup.string(),
        SQ_SMTP_PASS: yup.string(),
        SQ_TMDB_READ_TOKEN: yup
          .string()
          .test(
            "tmdb-token-length",
            "SQ_TMDB_READ_TOKEN must be empty or at least 20 characters",
            (value) => !value || value.trim().length >= 20,
          ),
        SQ_TMDB_API_KEY: yup
          .string()
          .test(
            "tmdb-api-key",
            "SQ_TMDB_API_KEY must be empty or a 32-character hexadecimal key",
            (value) => !value || /^[a-f0-9]{32}$/i.test(value.trim()),
          ),
      })
      .when("envs.SQ_DISABLE_EMAIL", {
        is: (val) => val !== true,
        then: (schema) => {
          schema.fields.SQ_SMTP_USER = yup.string().required();
          schema.fields.SQ_SMTP_PASS = yup.string().required();
          return schema;
        },
      })
      .strict()
      .noUnknown()
      .required(),
  })
  .strict()
  .noUnknown()
  .required();

const warnWeakSecrets = (config) => {
  const jwt = config?.secrets?.SQ_JWT_SECRET;
  const server = config?.secrets?.SQ_SERVER_SECRET;
  if (typeof jwt === "string" && jwt.length < 32) {
    console.warn(
      "[sq] SECURITY: SQ_JWT_SECRET is shorter than 32 characters - use a long random value",
    );
  }
  if (typeof server === "string" && server.length < 32) {
    console.warn(
      "[sq] SECURITY: SQ_SERVER_SECRET is shorter than 32 characters - use a long random value",
    );
  }
  if (
    jwt === "long_random_string" ||
    server === "another_long_random_string"
  ) {
    console.warn(
      "[sq] SECURITY: secrets still use the example defaults - change them immediately",
    );
  }
  if (jwt && server && jwt === server) {
    console.warn(
      "[sq] SECURITY: SQ_JWT_SECRET and SQ_SERVER_SECRET must differ",
    );
  }
};

const validateConfig = async (config) => {
  try {
    const serializedConfig = Object.fromEntries(
      Object.entries({ ...config.envs, ...config.secrets }).map(
        ([key, value]) => [
          key,
          value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : String(value),
        ],
      ),
    );
    process.env = {
      ...process.env,
      ...serializedConfig,
    };
    await configSchema.validate(config);
    console.log("[sq] configuration is valid");
    warnWeakSecrets(config);
  } catch (e) {
    console.error("[sq] ERROR: invalid configuration:", e.message);
    process.exit(1);
  }
};

export default validateConfig;
