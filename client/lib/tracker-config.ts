import type { TrackerConfig } from "@/lib/types";

export const FALLBACK_TRACKER_CONFIG: TrackerConfig = {
  siteName: "sqtracker demo",
  siteDescription: "A focused, private BitTorrent tracker.",
  showPageInTitle: true,
  contentCentered: false,
  contentMaxWidth: 1040,
  shortenMatchedTorrentNames: true,
  contentLimits: {
    torrentName: 500,
    title: 200,
    body: 50000,
    comment: 10000,
    message: 50000,
    profileBio: 500,
    profileLocation: 80,
    mediaInfo: 100000,
    torrentTags: 500,
    torrentFileSizeKb: 1024,
  },
  allowRegister: "open",
  allowAnonymousUploads: false,
  torrentPremoderation: false,
  categories: {
    Movies: ["BluRay", "WebDL", "HDRip", "WebRip", "DVD", "Cam"],
    TV: [],
    Books: [],
    Music: [],
    Games: [],
    Software: [],
  },
  siteWideFreeleech: false,
  allowUnregisteredView: false,
  defaultLocale: "en",
  avatarMaxResolution: 512,
  avatarMaxSizeKb: 512,
  allowGifAvatars: true,
  rssReadersEnabled: true,
  forumEnabled: true,
  announcementsEnabled: true,
  rssEnabled: true,
  trackerUrl: "",
};

export function mergeTrackerConfig(config?: Partial<TrackerConfig>) {
  return {
    ...FALLBACK_TRACKER_CONFIG,
    ...config,
    contentLimits: {
      ...FALLBACK_TRACKER_CONFIG.contentLimits,
      ...config?.contentLimits,
    },
  };
}
