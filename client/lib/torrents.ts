import type { Torrent } from "@/lib/types";

export const DEFAULT_TORRENT_ACTION_ORDER = [
  "upvote",
  "downvote",
  "bookmark",
  "freeleech",
  "delete",
];

const BUILT_IN_TORRENT_ACTION_LABELS: Record<string, string> = {
  upvote: "Upvote",
  downvote: "Downvote",
  bookmark: "Bookmark",
  freeleech: "Freeleech toggle",
  delete: "Delete",
};

export function isPluginTorrentAction(key: string) {
  return key.startsWith("plugin:");
}

export function torrentActionLabel(key: string, pluginName?: string) {
  if (BUILT_IN_TORRENT_ACTION_LABELS[key]) {
    return BUILT_IN_TORRENT_ACTION_LABELS[key];
  }
  if (isPluginTorrentAction(key)) {
    return pluginName ? `Plugin: ${pluginName}` : `Plugin: ${key.slice(7)}`;
  }
  return key;
}

export function mergeTorrentActionOrder(
  saved: readonly string[],
  activePluginIds: readonly string[],
) {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const key of [
    ...saved,
    ...DEFAULT_TORRENT_ACTION_ORDER,
    ...activePluginIds.map((id) => `plugin:${id}`),
  ]) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

export function moveActionKey(
  order: readonly string[],
  index: number,
  direction: -1 | 1,
) {
  const next = [...order];
  const target = index + direction;
  if (
    index < 0 ||
    index >= next.length ||
    target < 0 ||
    target >= next.length
  ) {
    return next;
  }
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function sortTorrentActions<T extends { key: string }>(
  actions: readonly T[],
  order: readonly string[] | undefined,
) {
  const rank = new Map((order ?? []).map((key, index) => [key, index]));
  return actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.action.key) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.action.key) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.index - right.index;
    })
    .map((entry) => entry.action);
}

export function torrentDisplayName(torrent: Torrent, shorten = true) {
  return shorten ? torrent.tmdb?.title?.trim() || torrent.name : torrent.name;
}

export function torrentReleaseDetail(torrent: Torrent) {
  const metadata = torrent.tmdb;
  if (metadata?.mediaType !== "tv" || metadata.season === undefined) return "";

  const details = [`Season ${metadata.season}`];
  if (metadata.episodes?.length) {
    details.push(
      `${metadata.episodes.length === 1 ? "Episode" : "Episodes"} ${metadata.episodes.join(", ")}`,
    );
  }
  if (metadata.episodeTitle) details.push(metadata.episodeTitle);
  return details.join(" · ");
}
