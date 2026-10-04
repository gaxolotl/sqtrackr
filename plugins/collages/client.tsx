"use client";

import {
  defineClientPlugin,
  type PluginManifest,
  type PluginPageProps,
} from "@sqtrackr/plugin-sdk/client";
import sharedManifest from "@sqtrackr/plugin-collages/manifest";
import { Heart, Layers, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, Fragment, useState } from "react";
import { useAuth } from "@/components/auth-context";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { Pager } from "@/components/pager";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch, canModerate } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type CollageTorrent = {
  infoHash: string;
  name: string;
  type?: string;
  created?: number;
};

type Collage = {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  ownsCollage: boolean;
  torrentCount: number;
  likeCount: number;
  likedByMe: boolean;
  createdAt: number | string;
  updatedAt: number | string;
};

type CollageDetail = Collage & {
  torrents: CollageTorrent[];
};

type CollageListResponse = {
  collages: Collage[];
  page: number;
  limit: number;
  total: number;
};

export const manifest = {
  ...sharedManifest,
  description: "Curated torrent collections built and liked by members.",
} as const satisfies PluginManifest;

function timestamp(value: number | string | null | undefined) {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function CollageDetailView({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const detail = useApiData<CollageDetail>(
    session ? `/plugins/collages/collages/${id}` : null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!session) return null;

  async function mutate(
    path: string,
    options: { method: string; body?: string },
    success: string,
  ) {
    setMessage("");
    setError("");
    try {
      await apiFetch(path, { method: options.method, body: options.body });
      setMessage(success);
      detail.reload();
      onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed.",
      );
    }
  }

  function addTorrent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const infoHash = String(new FormData(form).get("infoHash") ?? "").trim();
    form.reset();
    void mutate(
      `/plugins/collages/collages/${id}/torrents`,
      { method: "POST", body: JSON.stringify({ infoHash }) },
      "Torrent added.",
    );
  }

  function removeTorrent(infoHash: string) {
    void mutate(
      `/plugins/collages/collages/${id}/torrents/${infoHash}`,
      { method: "DELETE" },
      "Torrent removed.",
    );
  }

  function toggleLike() {
    void mutate(
      `/plugins/collages/collages/${id}/like`,
      { method: "POST" },
      detail.data?.likedByMe ? "Like removed." : "Liked.",
    );
  }

  function saveEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(
      `/plugins/collages/collages/${id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
        }),
      },
      "Collage updated.",
    );
  }

  function removeCollage() {
    if (!window.confirm("Delete this collage permanently?")) return;
    void mutate(
      `/plugins/collages/collages/${id}`,
      { method: "DELETE" },
      "Collage deleted.",
    );
  }

  const data = detail.data;
  const canEdit = Boolean(data?.ownsCollage);
  const canDelete =
    Boolean(data?.ownsCollage) || canModerate(session.role ?? "user");

  return (
    <ApiState loading={detail.loading} error={detail.error} empty={!data}>
      {data ? (
        <div className="copy-section">
          {data.description ? <p>{data.description}</p> : null}
          <p>
            <strong>{data.torrentCount}</strong> torrents ·{" "}
            <strong>{data.likeCount}</strong> likes
          </p>
          <div className="feed-list">
            {data.torrents.map((torrent) => (
              <div className="feed-card" key={torrent.infoHash}>
                <Link href={`/torrent/${torrent.infoHash}`}>
                  <div>
                    <h2>{torrent.name}</h2>
                    {torrent.type ? <p>{torrent.type}</p> : null}
                  </div>
                </Link>
                {canEdit ? (
                  <button
                    className="icon-action compact-button"
                    type="button"
                    onClick={() => removeTorrent(torrent.infoHash)}
                    aria-label={`Remove ${torrent.name}`}
                  >
                    <X aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="candidate-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={toggleLike}
            >
              <Heart aria-hidden="true" />{" "}
              {data.likedByMe ? "Unlike" : "Like"} ({data.likeCount})
            </button>
            {canDelete ? (
              <button
                className="secondary-button danger-action"
                type="button"
                onClick={removeCollage}
              >
                <Trash2 aria-hidden="true" /> Delete
              </button>
            ) : null}
          </div>
          {canEdit ? (
            <>
              <form className="inline-form" onSubmit={addTorrent}>
                <Field label="Add by info hash">
                  <input
                    name="infoHash"
                    required
                    minLength={40}
                    maxLength={40}
                    pattern="[a-fA-F0-9]{40}"
                    placeholder="40-character torrent info hash"
                  />
                </Field>
                <button className="primary-button" type="submit">
                  Add
                </button>
              </form>
              <form className="stack-form" onSubmit={saveEdits}>
                <Field label="Name">
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={data.name}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={2000}
                    defaultValue={data.description}
                  />
                </Field>
                <div className="form-actions">
                  <button className="primary-button" type="submit">
                    Save
                  </button>
                </div>
              </form>
            </>
          ) : null}
          <ActionMessage message={message} error={error} />
        </div>
      ) : null}
    </ApiState>
  );
}

function CollagesPage(_: PluginPageProps) {
  const { session } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const listPath = session
    ? `/plugins/collages/collages?page=${page}${search ? `&q=${encodeURIComponent(search)}` : ""}`
    : null;
  const list = useApiData<CollageListResponse>(listPath);

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setError("");
    try {
      await apiFetch("/plugins/collages/collages", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
        }),
      });
      (event.target as HTMLFormElement).reset();
      setMessage("Collage created.");
      list.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create collage.",
      );
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => (current === id ? null : id));
  }

  return (
    <main className="page list-page">
      <PageHeader title="Collages" />
      <form
        className="hero-search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          list.reload();
        }}
      >
        <div className="hero-search-field">
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search collages"
            aria-label="Search collages"
          />
        </div>
        <button className="primary-button" type="submit">
          Search
        </button>
      </form>
      <section className="content-section">
        <div className="section-heading-row">
          <h2 className="section-title">New collage</h2>
        </div>
        <form className="stack-form" onSubmit={create}>
          <Field label="Name">
            <input name="name" required maxLength={100} />
          </Field>
          <Field label="Description">
            <textarea name="description" rows={3} maxLength={2000} />
          </Field>
          <div className="form-actions">
            <button className="primary-button" type="submit">
              <Plus aria-hidden="true" /> Create
            </button>
          </div>
        </form>
        <ActionMessage message={message} error={error} />
      </section>
      <section className="content-section">
        <div className="section-heading-row">
          <h2 className="section-title">All collages</h2>
        </div>
        <ApiState
          loading={list.loading}
          error={list.error}
          empty={!list.loading && !list.error && !list.data?.collages.length}
        >
          <div className="feed-list">
            {list.data?.collages.map((collage) => (
              <Fragment key={collage.id}>
                <article className="feed-card">
                  <div>
                    <h2>{collage.name}</h2>
                    <p>
                      {collage.torrentCount} torrents · {collage.likeCount}{" "}
                      likes · Updated{" "}
                      {formatDateTime(timestamp(collage.updatedAt))}
                    </p>
                  </div>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => toggleExpanded(collage.id)}
                    aria-expanded={expanded === collage.id}
                  >
                    {expanded === collage.id ? "Hide" : "View"}
                  </button>
                </article>
                {expanded === collage.id ? (
                  <CollageDetailView id={collage.id} onChanged={list.reload} />
                ) : null}
              </Fragment>
            ))}
          </div>
        </ApiState>
        {list.data ? (
          <Pager
            page={list.data.page}
            pageSize={list.data.limit}
            total={list.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </section>
    </main>
  );
}

export const navigation = [
  {
    label: "Collages",
    href: "/plugins/collages",
    icon: Layers,
    authenticated: true,
  },
] as const;

export const pages = [
  {
    path: "/",
    title: "Collages",
    component: CollagesPage,
  },
] as const;

export const slots = [] as const;

export default defineClientPlugin({ manifest, navigation, pages, slots });
