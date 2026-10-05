// This is an example configuration file.
// Copy it to config.js and change each value according to your desired setup.

module.exports = {
  envs: {
    // The name of your tracker site. Maximum 20 characters.
    SQ_SITE_NAME: "sqtracker demo",

    // A short description of your tracker site. Maximum 80 characters.
    SQ_SITE_DESCRIPTION: "A short description for your tracker site",

    // Whether browser tab titles include the localized current page name.
    SQ_SHOW_PAGE_IN_TITLE: true,

    // Optionally center page content and control its maximum desktop width.
    SQ_CONTENT_CENTERED: false,
    SQ_CONTENT_MAX_WIDTH: 1040,

    // Show matched movie and TV titles instead of full torrent release names.
    SQ_SHORTEN_MATCHED_TORRENT_NAMES: true,

    // Runtime limits for user-created content and uploaded .torrent metadata files.
    SQ_TORRENT_NAME_MAX_LENGTH: 500,
    SQ_CONTENT_TITLE_MAX_LENGTH: 200,
    SQ_CONTENT_BODY_MAX_LENGTH: 50000,
    SQ_COMMENT_MAX_LENGTH: 10000,
    SQ_MESSAGE_MAX_LENGTH: 50000,
    SQ_PROFILE_BIO_MAX_LENGTH: 500,
    SQ_PROFILE_LOCATION_MAX_LENGTH: 80,
    SQ_MEDIA_INFO_MAX_LENGTH: 100000,
    SQ_TORRENT_TAGS_MAX_LENGTH: 500,
    SQ_TORRENT_FILE_MAX_SIZE_KB: 1024,

    // A map of custom hex colours to use as the theme of your site.
    // If not specified, the default light and dark themes will be used.
    // If only "primary" is specified, the default light and dark themes will be used but with your main brand colour.
    // If the other values are specified, the fully custom theme will be used and not the default light/dark.
    SQ_CUSTOM_THEME: {
      primary: "#f45d48",
      // background: "#1f2023", // Page background colour
      // sidebar: "#27282b",    // A secondary background colour, used for sidebar, infoboxes etc.
      // border: "#303236",     // Border colour
      // text: "#f8f8f8",       // Text colour. Should be readable against background and sidebar
      // grey: "#aaa",          // Secondary text colour, used for less important text
    },

    // Registration mode. Either "open", "invite" or "closed".
    // Open: anyone can register.
    // Invite: must be invited by existing user.
    // Closed: no one can register.
    SQ_ALLOW_REGISTER: "invite",

    // A boolean value determining whether users can choose to upload anonymously.
    // Admins can still see who uploaded anonymously, but other users cannot.
    SQ_ALLOW_ANONYMOUS_UPLOADS: false,

    // Require ordinary user uploads to be approved by staff before publication.
    // Staff and admin uploads are published immediately.
    SQ_TORRENT_PREMODERATION: false,

    // Minimum allowed ratio. Below this users will not be able to download. Set to -1 to disable.
    SQ_MINIMUM_RATIO: 0.75,

    // Maximum allowed hit'n'runs. Above this users will not be allowed to download. Set to -1 to disable.
    // A user has committed a hit'n'run when a torrent is fully downloaded and not seeded to a 1:1 ratio.
    SQ_MAXIMUM_HIT_N_RUNS: 1,

    // Minimum seeding time in hours to avoid a hit'n'run (reaching 1:1 ratio also clears it).
    SQ_MIN_SEEDTIME_HOURS: 72,

    // Hours after snatching before an unseeded torrent counts as a hit'n'run.
    SQ_HNR_GRACE_HOURS: 24,

    // A map of torrent categories that can be selected when uploading.
    // Each has an array of zero or more sources available within that category.
    SQ_TORRENT_CATEGORIES: {
      Movies: ["BluRay", "WebDL", "HDRip", "WebRip", "DVD", "Cam"],
      TV: [],
      Music: [],
      Books: [],
    },

    // Number of bonus points awarded to a user for each GB they upload. Minimum 0.
    SQ_BP_EARNED_PER_GB: 1,

    // Number of bonus points awarded to a user if they suggest a torrent to fill a request and it gets accepted
    // They get double if they also the uploader of the accepted torrent
    SQ_BP_EARNED_PER_FILLED_REQUEST: 1,

    // Number of bonus points it costs a user to buy 1 invite (set to 0 to disable buying invites).
    SQ_BP_COST_PER_INVITE: 3,

    // Number of bonus points it costs a user to buy 1 GB of upload (set to 0 to disable buying upload).
    SQ_BP_COST_PER_GB: 3,

    // Whether to enable freeleech on all torrents.
    SQ_SITE_WIDE_FREELEECH: false,

    // Whether torrent pages can be viewed by unregistered users.
    // If true, only logged-in users will be able to download/interact, but anyone (search engines included) will be able to view/read torrent info.
    // Non-logged-in users will also be able to browse category/tag pages and wiki pages that have been set to public.
    // Enable if you want torrents to be indexed to help search traffic.
    SQ_ALLOW_UNREGISTERED_VIEW: false,

    // An array of blacklisted file extensions. Torrents containing files with these extensions will fail to upload.
    SQ_EXTENSION_BLACKLIST: ["exe"],

    // An array of banned BitTorrent client peer-ID prefixes (e.g. "-AZ3020-").
    // Announces from matching clients are denied. Empty array disables.
    SQ_CLIENT_BLACKLIST: [],

    // Default site locale. See `client/locales/index.js` for available options.
    SQ_SITE_DEFAULT_LOCALE: "en",

    // Profile images are always converted to WebP and compressed to fit these limits.
    SQ_AVATAR_MAX_RESOLUTION: 512,
    SQ_AVATAR_MAX_SIZE_KB: 512,
    SQ_ALLOW_GIF_AVATARS: true,

    // Set any of these to false to disable the section without deleting
    // its data. Disabled sections return 403 and hide from navigation.
    SQ_ENABLE_FORUM: true,
    SQ_ENABLE_ANNOUNCEMENTS: true,
    SQ_ENABLE_RSS: true,

    // Show the "Add to a feed reader" shortcuts on the RSS page.
    // Also editable at runtime in site settings.
    SQ_ENABLE_RSS_READERS: true,

    // Button order for the torrent actions row, as an array of action keys.
    // Built-ins: upvote, downvote, bookmark, freeleech, delete.
    // Plugin buttons use "plugin:<pluginId>" keys and are appended when missing.
    // Also editable at runtime in site settings.
    SQ_TORRENT_ACTION_ORDER: [
      "upvote",
      "downvote",
      "bookmark",
      "freeleech",
      "delete",
    ],

    // The URL of your tracker site.
    // For local development, this should be `http://127.0.0.1:3000`.
    SQ_BASE_URL: "https://sqtracker.dev",

    // The URL of your API. Under the recommended setup, it should be `${SQ_BASE_URL}/api`.
    // For local development, this should be `http://127.0.0.1:3001`.
    SQ_API_URL: "https://sqtracker.dev/api",

    // Optional public tracker address embedded in downloaded torrents and magnet links.
    // Only needed when the tracker announce endpoint is not reachable at `SQ_API_URL`
    // without its `/api` suffix. For local development, leave this unset so it is
    // derived as `http://127.0.0.1:3001`.
    // SQ_ANNOUNCE_URL: "https://tracker.sqtracker.dev",

    // The URL of your MongoDB server. Under the recommended setup, it should be `mongodb://sq_mongodb/sqtracker`.
    // For local development, this should be `mongodb://127.0.0.1/sqtracker`.
    SQ_MONGO_URL: "mongodb://sq_mongodb/sqtracker",

    // Disables sending of any emails and removes the need for an SMTP server.
    // Fine for testing, not recommended in production as users will not be able to reset their passwords.
    SQ_DISABLE_EMAIL: false,

    // The email address that mail will be sent from.
    // Not required if SQ_DISABLE_EMAIL=true.
    SQ_MAIL_FROM_ADDRESS: "mail@sqtracker.dev",

    // The hostname of your SMTP server.
    // Not required if SQ_DISABLE_EMAIL=true.
    SQ_SMTP_HOST: "smtp.example.com",

    // The port of your SMTP server.
    // Not required if SQ_DISABLE_EMAIL=true.
    SQ_SMTP_PORT: 587,

    // Whether to force SMTP TLS: if true the connection will use TLS when connecting to server.
    // If false (the default) then TLS is used if server supports the STARTTLS extension.
    // In most cases set this value to true if you are connecting to port 465. For port 587 or 25 keep it false.
    // Not required if SQ_DISABLE_EMAIL=true.
    SQ_SMTP_SECURE: false,
  },
  secrets: {
    // A secret value to sign tokens with. Should be long and random.
    SQ_JWT_SECRET: "long_random_string",

    // A secret value to verify server requests with. Should be long and random, and different to the JWT secret.
    SQ_SERVER_SECRET: "another_long_random_string",

    // The email address to use for the initial admin user.
    // Must be valid, you will need to verify.
    SQ_ADMIN_EMAIL: "admin@example.com",

    // The username to authenticate with your SMTP server with.
    // Not required if SQ_DISABLE_EMAIL=true.
    SQ_SMTP_USER: "smtp_username",

    // The password to authenticate with your SMTP server with.
    // Not required if SQ_DISABLE_EMAIL=true.
    SQ_SMTP_PASS: "smtp_password",

    // Optional TMDB API Read Access Token used for server-side movie and TV matching.
    // Keep this secret. It is never sent to the browser.
    SQ_TMDB_READ_TOKEN: "",

    // Optional v3 API key fallback when an API Read Access Token is unavailable.
    SQ_TMDB_API_KEY: "",
  },
};
