"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Magnet,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { FormEvent, Fragment, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-context";
import { CommentThread } from "@/components/comment-thread";
import { PluginBoundary, PluginSlot, usePluginHost } from "@/components/plugin-host";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { TorrentPeers } from "@/components/torrent-peers";
import { apiFetch, apiOrigin } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import type { Torrent } from "@/lib/types";
import { sortTorrentActions, torrentDisplayName } from "@/lib/torrents";
import { Markdown } from "@/lib/markdown";

function countVotes(votes: Torrent["upvotes"]) {
  return Array.isArray(votes) ? votes.length : (votes ?? 0);
}

type FileRecord = NonNullable<Torrent["files"]>[number];

function charsToString(values: number[]) {
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(values));
    if (!decoded.includes("\uFFFD")) return decoded;
  } catch {
    // fall through to the code-unit interpretation
  }
  return String.fromCharCode(...values);
}

function bufferData(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    const data = (value as { data: unknown[] }).data;
    if (data.every((part) => typeof part === "number")) return data as number[];
  }
  return null;
}

function decodePath(value: FileRecord["path"] | FileRecord["name"]) {
  if (typeof value === "string") {
    // Paths stored by the bumped API while bencode returned Uint8Array look
    // like "99,111,110,..." (comma-joined decimal bytes). Repair on display.
    if (/^(?:\d{1,3},)*\d{1,3}$/.test(value)) {
      return charsToString(value.split(",").map(Number));
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((part) => typeof part === "number")) {
      return charsToString(value as number[]);
    }
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "number") return String.fromCharCode(part);
        const bytes = bufferData(part);
        return bytes ? charsToString(bytes) : "";
      })
      .filter(Boolean)
      .join("/");
  }
  const bytes = bufferData(value);
  return bytes ? charsToString(bytes) : "";
}

function fileLabel(file: FileRecord) {
  return decodePath(file.path ?? file.name) || "File";
}

function tmdbPoster(path?: string) {
  return path?.startsWith("/")
    ? `https://image.tmdb.org/t/p/w500${path}`
    : undefined;
}

function episodeLabel(torrent: Torrent) {
  const metadata = torrent.tmdb;
  if (metadata?.season === undefined) return null;
  const season = `S${String(metadata.season).padStart(2, "0")}`;
  const episodes = (metadata.episodes ?? [])
    .map((episode) => `E${String(episode).padStart(2, "0")}`)
    .join("");
  return `${season}${episodes}`;
}

export function TorrentDetail({ infoHash }: { infoHash: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const { config } = useTrackerConfig();
  const pluginHost = usePluginHost();
  const { data, error, loading, reload } = useApiData<Torrent>(
    session ? `/torrent/info/${infoHash}` : null,
  );
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  async function act(path: string, success: string, body?: object) {
    setActionError("");
    setMessage("");
    try {
      await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage(success);
      reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : "Action failed.",
      );
    }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await act(`/torrent/report/${infoHash}`, "Report sent to the staff team.", {
      reason: values.get("reason"),
    });
    form.reset();
  }

  async function removeTorrent() {
    if (!window.confirm("Delete this torrent permanently?")) return;
    setActionError("");
    try {
      await apiFetch(`/torrent/delete/${infoHash}`, { method: "DELETE" });
      router.push("/");
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete the torrent.",
      );
    }
  }

  const canManage =
    data && (session.role === "admin" || data.uploadedBy?._id === session.id);
  const trackerOrigin = config.trackerUrl || apiOrigin();
  const magnetHref = data
    ? `magnet:?xt=urn:btih:${data.infoHash}&dn=${encodeURIComponent(data.name)}&tr=${encodeURIComponent(`${trackerOrigin}/announce/${session.uid}`)}`
    : "#";
  const poster = tmdbPoster(data?.tmdb?.posterPath);
  const releaseLabel = data ? episodeLabel(data) : null;
  const description = data?.description?.trim() ?? "";
  const hasDistinctDescription =
    Boolean(description) && description !== data?.tmdb?.overview?.trim();
  const tags = data?.tags?.filter(Boolean) ?? [];
  const pluginContext = data
    ? {
        torrent: {
          _id: data._id,
          infoHash: data.infoHash,
          name: data.name,
          seeders: data.seeders ?? data.complete,
          created: data.created,
        },
        session: { id: session.id, role: session.role },
        reload,
      }
    : null;

  const orderedTorrentActions = (() => {
    if (!data || !pluginContext) return [];
    const actions: Array<{ key: string; node: ReactNode }> = [
      {
        key: "upvote",
        node: (
          <button
            className="icon-action"
            type="button"
            onClick={() =>
              act(`/torrent/vote/${data.infoHash}/up`, "Vote saved.")
            }
          >
            <ThumbsUp aria-hidden="true" /> {countVotes(data.upvotes)}
          </button>
        ),
      },
      {
        key: "downvote",
        node: (
          <button
            className="icon-action"
            type="button"
            onClick={() =>
              act(`/torrent/vote/${data.infoHash}/down`, "Vote saved.")
            }
          >
            <ThumbsDown aria-hidden="true" /> {countVotes(data.downvotes)}
          </button>
        ),
      },
      {
        key: "bookmark",
        node: (
          <button
            className="icon-action"
            type="button"
            onClick={() =>
              act(`/torrent/bookmark/${data.infoHash}`, "Bookmark updated.")
            }
          >
            <Bookmark aria-hidden="true" />{" "}
            {data.fetchedBy?.bookmarked ? "Bookmarked" : "Bookmark"}
          </button>
        ),
      },
    ];
    if (session.role === "admin") {
      actions.push({
        key: "freeleech",
        node: (
          <button
            className="icon-action"
            type="button"
            onClick={() =>
              act(
                `/torrent/toggle-freeleech/${data.infoHash}`,
                "Freeleech updated.",
              )
            }
          >
            <Sparkles aria-hidden="true" />{" "}
            {data.freeleech ? "Remove freeleech" : "Set freeleech"}
          </button>
        ),
      });
    }
    if (canManage) {
      actions.push({
        key: "delete",
        node: (
          <button
            className="icon-action danger-action"
            type="button"
            onClick={removeTorrent}
          >
            <Trash2 aria-hidden="true" /> Delete
          </button>
        ),
      });
    }
    const slotItems = pluginHost.slots("torrent.actions");
    const pluginGroups = new Map<
      string,
      {
        pluginId: string;
        pluginName: string;
        items: Array<(typeof slotItems)[number]>;
      }
    >();
    for (const item of slotItems) {
      const group = pluginGroups.get(item.pluginId);
      if (group) {
        group.items.push(item);
      } else {
        pluginGroups.set(item.pluginId, {
          pluginId: item.pluginId,
          pluginName: item.pluginName,
          items: [item],
        });
      }
    }
    for (const group of pluginGroups.values()) {
      actions.push({
        key: `plugin:${group.pluginId}`,
        node: (
          <>
            {group.items.map(
              ({ contribution, pluginId, pluginName }, index) => {
                const SlotComponent = contribution.component;
                return (
                  <PluginBoundary
                    key={`${pluginId}:torrent.actions:${index}`}
                    pluginId={pluginId}
                    pluginName={pluginName}
                  >
                    <SlotComponent context={pluginContext} />
                  </PluginBoundary>
                );
              },
            )}
          </>
        ),
      });
    }
    return sortTorrentActions(actions, config.torrentActionOrder);
  })();

  return (
    <main className="page detail-page">
      <ApiState loading={loading} error={error} empty={!data}>
        {data ? (
          <>
            <PageHeader
              title={torrentDisplayName(
                data,
                config.shortenMatchedTorrentNames,
              )}
              titleTooltip={
                config.shortenMatchedTorrentNames && data.tmdb?.title
                  ? data.name
                  : undefined
              }
              info={`${data.type || "All"} · ${formatBytes(data.size)}`}
              actions={
                <>
                  <a
                    className="primary-button button-link"
                    href={`${apiOrigin()}/torrent/download/${data.infoHash}/${session.uid}`}
                  >
                    <Download aria-hidden="true" /> .torrent
                  </a>
                  <a className="secondary-button button-link" href={magnetHref}>
                    <Magnet aria-hidden="true" /> Magnet
                  </a>
                </>
              }
            />

            {data.tmdb ? (
              <section className="detail-card media-metadata-card">
                {poster ? (
                  <Image
                    className="media-poster"
                    src={poster}
                    width={220}
                    height={330}
                    sizes="(max-width: 700px) 140px, 220px"
                    alt={`${data.tmdb.title} poster`}
                    priority
                  />
                ) : (
                  <div className="media-poster media-poster-empty">
                    No poster
                  </div>
                )}
                <div className="media-metadata-copy">
                  <div className="media-kicker">
                    <span className="status-pill">
                      {data.tmdb.mediaType === "tv" ? "TV series" : "Movie"}
                    </span>
                    {data.tmdb.year ? <span>{data.tmdb.year}</span> : null}
                    {releaseLabel ? <span>{releaseLabel}</span> : null}
                    {data.tmdb.episodeTitle ? (
                      <span>{data.tmdb.episodeTitle}</span>
                    ) : null}
                    {data.tmdb.rating ? (
                      <span className="media-rating">
                        <Star aria-hidden="true" />{" "}
                        {data.tmdb.rating.toFixed(1)} TMDB
                      </span>
                    ) : null}
                  </div>
                  {data.tmdb.originalTitle &&
                  data.tmdb.originalTitle !== data.tmdb.title ? (
                    <p className="media-original-title">
                      Original title: {data.tmdb.originalTitle}
                    </p>
                  ) : null}
                  {data.tmdb.overview ? (
                    <p className="media-overview">{data.tmdb.overview}</p>
                  ) : null}
                  {data.tmdb.genres?.length ? (
                    <div className="tag-row">
                      {data.tmdb.genres.map((genre) => (
                        <span className="tag" key={genre}>
                          {genre}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="media-facts">
                    {data.tmdb.runtime ? (
                      <span>{data.tmdb.runtime} min</span>
                    ) : null}
                    {data.tmdb.releaseDate ? (
                      <span>Released {data.tmdb.releaseDate}</span>
                    ) : null}
                  </div>
                  <div className="media-links">
                    <a
                      className="secondary-button button-link"
                      href={`https://www.themoviedb.org/${data.tmdb.mediaType}/${data.tmdb.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      TMDB <ExternalLink aria-hidden="true" />
                    </a>
                    {data.tmdb.imdbId ? (
                      <a
                        className="secondary-button button-link"
                        href={`https://www.imdb.com/title/${data.tmdb.imdbId}/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        IMDb <ExternalLink aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="detail-card">
              <dl className="detail-list">
                <div>
                  <dt>Uploaded by</dt>
                  <dd>
                    {data.anonymous ? (
                      "Anonymous"
                    ) : (
                      <Link
                        href={`/user/${data.uploadedBy?.username ?? "unknown"}`}
                      >
                        {data.uploadedBy?.username ?? "Unknown"}
                      </Link>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{formatDateTime(data.created)}</dd>
                </div>
                <div>
                  <dt>Info hash</dt>
                  <dd className="mono">{data.infoHash}</dd>
                </div>
                <div>
                  <dt>Downloads</dt>
                  <dd>{data.downloads ?? 0}</dd>
                </div>
                <div>
                  <dt>Seeders</dt>
                  <dd>{data.seeders ?? data.complete ?? "?"}</dd>
                </div>
                <div>
                  <dt>Leechers</dt>
                  <dd>{data.leechers ?? data.incomplete ?? "?"}</dd>
                </div>
                <div>
                  <dt>Freeleech</dt>
                  <dd>{data.freeleech ? "Yes" : "No"}</dd>
                </div>
              </dl>
              {session.role === "admin" ? (
                <TorrentPeers infoHash={data.infoHash} />
              ) : null}
            </section>
            <PluginSlot
              name="torrent.afterDetails"
              context={pluginContext}
            />

            {hasDistinctDescription || tags.length ? (
              <section className="copy-section">
                {hasDistinctDescription ? (
                  <>
                    <h2>Description</h2>
                    <Markdown text={description} />
                  </>
                ) : null}
                {tags.length ? (
                  <div className="tag-row">
                    {tags.map((tag) => (
                      <Link
                        className="tag"
                        href={`/tags/${encodeURIComponent(tag)}`}
                        key={tag}
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {data.files?.length ? (
              <section className="detail-card files-card">
                <h2>Files</h2>
                {data.files.map((file, index) => {
                  const label = fileLabel(file);
                  return (
                    <div className="file-row" key={`${label}-${index}`}>
                      <FileText aria-hidden="true" />
                      <span>{label}</span>
                      <small>{formatBytes(file.size ?? file.length)}</small>
                    </div>
                  );
                })}
              </section>
            ) : null}

            <div className="torrent-actions">
              {orderedTorrentActions.map((action) => (
                <Fragment key={action.key}>{action.node}</Fragment>
              ))}
            </div>
            <ActionMessage message={message} error={actionError} />

            <form className="inline-form report-form" onSubmit={report}>
              <Field label="Report this torrent">
                <input
                  name="reason"
                  required
                  maxLength={config.contentLimits.comment}
                  placeholder="Tell the staff team what is wrong"
                />
              </Field>
              <button className="secondary-button" type="submit">
                <Flag aria-hidden="true" /> Report
              </button>
            </form>

            <CommentThread
              comments={Array.isArray(data.comments) ? data.comments : []}
              endpoint={`/torrent/comment/${data.infoHash}`}
              onPosted={reload}
            />
          </>
        ) : null}
      </ApiState>
    </main>
  );
}
