"use client";

import {
  defineClientPlugin,
  type PluginManifest,
  type PluginSlotProps,
  type PluginTabProps,
} from "@sqtrackr/plugin-sdk/client";
import sharedManifest from "@sqtrackr/plugin-upload-subscriptions/manifest";
import { BellPlus, BellRing, CheckCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-context";
import {
  ActionMessage,
  ApiState,
  Field,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const manifest = {
  ...sharedManifest,
  description: "Follow tags, categories and uploaders, and get notified of new uploads.",
} as const satisfies PluginManifest;

type Subscription = {
  id: string;
  kind: "tag" | "category" | "uploader";
  value: string;
  label?: string | null;
  createdAt: number | string;
};

type SubscriptionListResponse = {
  subscriptions: Subscription[];
};

type UploadMatch = {
  id: string;
  infoHash: string;
  name: string;
  tags: string[];
  type?: string | null;
  createdAt: number | string;
  read: boolean;
};

type MatchesResponse = {
  matches: UploadMatch[];
  unreadCount: number;
};

type TorrentInfo = {
  infoHash: string;
  name: string;
  tags?: string[];
  uploadedBy?: { _id?: string; username?: string } | null;
};

function subscriptionLabel(subscription: Subscription) {
  if (subscription.label) return subscription.label;
  if (subscription.kind === "tag") return `#${subscription.value}`;
  return subscription.value;
}

function kindLabel(kind: Subscription["kind"]) {
  if (kind === "tag") return "Tag";
  if (kind === "category") return "Category";
  return "Uploader";
}

function SubscriptionsTab({ context }: PluginTabProps) {
  void context;
  const { session } = useAuth();
  const subscriptions = useApiData<SubscriptionListResponse>(
    session ? "/plugins/upload-subscriptions/subscriptions" : null,
  );
  const matches = useApiData<MatchesResponse>(
    session ? "/plugins/upload-subscriptions/matches" : null,
  );
  const [kind, setKind] = useState<Subscription["kind"]>("tag");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  if (!session) {
    return <SignInRequired />;
  }

  async function addSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiFetch("/plugins/upload-subscriptions/subscriptions", {
        method: "POST",
        body: JSON.stringify({ kind, value: value.trim() }),
      });
      setMessage("Subscription added. New matching uploads will appear here.");
      setValue("");
      subscriptions.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not add the subscription.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeSubscription(subscription: Subscription) {
    setActingId(subscription.id);
    setMessage("");
    setError("");
    try {
      await apiFetch(
        `/plugins/upload-subscriptions/subscriptions/${encodeURIComponent(subscription.id)}`,
        { method: "DELETE" },
      );
      setMessage("Subscription removed.");
      subscriptions.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not remove the subscription.",
      );
    } finally {
      setActingId(null);
    }
  }

  async function markAllRead() {
    setMessage("");
    setError("");
    try {
      await apiFetch("/plugins/upload-subscriptions/matches/read", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage("All caught up.");
      matches.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not mark matches as read.",
      );
    }
  }

  const items = subscriptions.data?.subscriptions ?? [];
  const found = matches.data?.matches ?? [];

  return (
    <div className="moderation-embedded">
      <ActionMessage message={message} error={error} />
      <section className="content-section">
        <div className="section-heading-row">
          <h2 className="section-title">New uploads for you</h2>
          {matches.data && matches.data.unreadCount > 0 ? (
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={markAllRead}
            >
              <CheckCheck aria-hidden="true" /> Mark all read
            </button>
          ) : null}
        </div>
        <ApiState
          loading={matches.loading}
          error={matches.error}
          empty={!matches.loading && !found.length}
        >
          <div className="feed-list">
            {found.map((match) => (
              <article
                className="feed-card"
                key={match.id}
                style={match.read ? { opacity: 0.65 } : undefined}
              >
                <div>
                  <h2>
                    <Link href={`/torrent/${match.infoHash}`}>
                      {match.name}
                    </Link>
                  </h2>
                  <p>
                    {formatDateTime(
                      typeof match.createdAt === "number"
                        ? match.createdAt < 1e12
                          ? match.createdAt * 1000
                          : match.createdAt
                        : Date.parse(String(match.createdAt)),
                    )}
                    {match.type ? ` · ${match.type}` : ""}
                    {match.tags.length ? ` · ${match.tags.join(", ")}` : ""}
                  </p>
                </div>
                {match.read ? null : (
                  <span className="status-pill">New</span>
                )}
              </article>
            ))}
          </div>
        </ApiState>
      </section>
      <section className="content-section">
        <h2 className="section-title">Subscriptions</h2>
        <form className="inline-form" onSubmit={addSubscription}>
          <Field label="Kind">
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as Subscription["kind"])
              }
              aria-label="Subscription kind"
            >
              <option value="tag">Tag</option>
              <option value="category">Category</option>
              <option value="uploader">Uploader</option>
            </select>
          </Field>
          <Field
            label={
              kind === "tag"
                ? "Tag (without #)"
                : kind === "category"
                  ? "Category slug (e.g. movies)"
                  : "Uploader user id"
            }
          >
            <input
              value={value}
              maxLength={100}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                kind === "tag"
                  ? "4k"
                  : kind === "category"
                    ? "movies"
                    : "Paste from their profile URL"
              }
              aria-label="Subscription value"
            />
          </Field>
          <button
            className="primary-button"
            type="submit"
            disabled={saving || !value.trim()}
          >
            <BellPlus aria-hidden="true" /> Subscribe
          </button>
        </form>
        <ApiState
          loading={subscriptions.loading}
          error={subscriptions.error}
          empty={!subscriptions.loading && !items.length}
        >
          <div className="feed-list">
            {items.map((subscription) => (
              <article className="feed-card" key={subscription.id}>
                <div>
                  <h2>{subscriptionLabel(subscription)}</h2>
                  <p>{kindLabel(subscription.kind)} subscription</p>
                </div>
                <button
                  className="secondary-button compact-button danger-action"
                  type="button"
                  disabled={actingId === subscription.id}
                  onClick={() => removeSubscription(subscription)}
                >
                  <Trash2 aria-hidden="true" />
                  {actingId === subscription.id ? "Removing…" : "Remove"}
                </button>
              </article>
            ))}
          </div>
        </ApiState>
      </section>
    </div>
  );
}

function NewUploadsNotice() {
  const { session } = useAuth();
  const matches = useApiData<MatchesResponse>(
    session ? "/plugins/upload-subscriptions/matches?unread=1" : null,
  );
  const unread = matches.data?.unreadCount ?? 0;
  if (!session || matches.loading || unread === 0) return null;
  const first = matches.data?.matches[0];

  return (
    <aside className="reseed-radar-notice" role="status">
      <span className="reseed-radar-notice-icon" aria-hidden="true">
        <BellRing />
      </span>
      <div className="reseed-radar-notice-copy">
        <strong>
          {unread === 1
            ? "A followed upload just landed"
            : `${unread} followed uploads just landed`}
        </strong>
        <p>
          {first ? (
            <>
              Latest: {first.name}.{" "}
            </>
          ) : null}
          Open your subscriptions to catch up.
        </p>
      </div>
      <Link
        className="secondary-button button-link reseed-radar-notice-action"
        href="/bookmarks?tab=upload-subscriptions"
      >
        View uploads
      </Link>
    </aside>
  );
}

function WatchTorrentBox({ context }: PluginSlotProps) {
  const slot =
    context && typeof context === "object"
      ? (context as {
          torrent?: { infoHash?: string; name?: string };
          session?: { id: string } | null;
        })
      : null;
  const infoHash = slot?.torrent?.infoHash;
  const { session } = useAuth();
  const info = useApiData<TorrentInfo>(
    session && infoHash
      ? `/torrent/info/${encodeURIComponent(infoHash)}`
      : null,
  );
  const subscriptions = useApiData<SubscriptionListResponse>(
    session ? "/plugins/upload-subscriptions/subscriptions" : null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  if (!session || !infoHash) return null;
  const tags = info.data?.tags ?? [];
  const uploader = info.data?.uploadedBy;
  const uploaderId =
    typeof uploader?._id === "string" ? uploader._id : undefined;
  const existing = new Set(
    (subscriptions.data?.subscriptions ?? []).map(
      (subscription) => `${subscription.kind}:${subscription.value}`,
    ),
  );

  async function subscribe(kind: Subscription["kind"], value: string, label?: string) {
    const key = `${kind}:${value.toLowerCase()}`;
    if (existing.has(key)) return;
    setSaving(key);
    setMessage("");
    setError("");
    try {
      await apiFetch("/plugins/upload-subscriptions/subscriptions", {
        method: "POST",
        body: JSON.stringify({ kind, value, label }),
      });
      setMessage("Subscription added.");
      subscriptions.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not add the subscription.",
      );
    } finally {
      setSaving("");
    }
  }

  if (info.loading || info.error || (!tags.length && !uploaderId)) {
    return (
      <div className="reseed-radar-status-state">
        <ApiState loading={info.loading} error={info.error}>
          {null}
        </ApiState>
      </div>
    );
  }

  return (
    <section className="detail-card reseed-radar-status">
      <div className="reseed-radar-status-heading">
        <div>
          <span>Subscriptions</span>
          <h2>Follow more like this</h2>
        </div>
      </div>
      <div className="tag-row">
        {tags.map((tag) => {
          const key = `tag:${tag.toLowerCase()}`;
          const watched = existing.has(key);
          return (
            <button
              key={tag}
              className="secondary-button compact-button"
              type="button"
              disabled={watched || saving === key}
              onClick={() => subscribe("tag", tag)}
            >
              <BellPlus aria-hidden="true" /> {watched ? `#${tag} ✓` : `#${tag}`}
            </button>
          );
        })}
        {uploaderId && uploaderId !== session.id ? (
          <button
            className="secondary-button compact-button"
            type="button"
            disabled={
              existing.has(`uploader:${uploaderId.toLowerCase()}`) ||
              saving === `uploader:${uploaderId.toLowerCase()}`
            }
            onClick={() =>
              subscribe("uploader", uploaderId, uploader?.username)
            }
          >
            <BellPlus aria-hidden="true" />{" "}
            {existing.has(`uploader:${uploaderId.toLowerCase()}`)
              ? `${uploader?.username ?? "Uploader"} ✓`
              : `Uploader${uploader?.username ? `: ${uploader.username}` : ""}`}
          </button>
        ) : null}
      </div>
      <ActionMessage message={message} error={error || subscriptions.error} />
    </section>
  );
}

export const tabs = [
  {
    slot: "bookmarks",
    label: "Subscriptions",
    component: SubscriptionsTab,
  },
] as const;

export const slots = [
  {
    name: "home.afterHeader",
    component: NewUploadsNotice,
    authenticated: true,
  },
  {
    name: "torrent.afterDetails",
    component: WatchTorrentBox,
    authenticated: true,
  },
] as const;

export default defineClientPlugin({ manifest, tabs, slots });
