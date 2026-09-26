"use client";

import Image from "next/image";
import {
  Check,
  CheckCircle2,
  Copy,
  FileUp,
  Info,
  Link2,
  Search,
  Sparkles,
} from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  ActionMessage,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { AttachmentPicker } from "@/components/attachment-picker";
import { apiFetch, apiOrigin } from "@/lib/api";
import { configCategoryOptions, type CategoryOption } from "@/lib/categories";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import type { TmdbCandidate, TmdbIdentification } from "@/lib/types";

const fallbackCategories: CategoryOption[] = [
  {
    name: "Movies",
    slug: "movies",
    sources: ["bluray", "webdl", "hdrip", "webrip", "dvd", "cam"],
  },
  { name: "TV", slug: "tv", sources: [] },
  { name: "Books", slug: "books", sources: [] },
  { name: "Music", slug: "music", sources: [] },
  { name: "Games", slug: "games", sources: [] },
  { name: "Software", slug: "software", sources: [] },
];

async function fileToBase64(file: File) {
  const binary = await file.arrayBuffer();
  const bytes = new Uint8Array(binary);
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function candidatePoster(path?: string) {
  return path?.startsWith("/")
    ? `https://image.tmdb.org/t/p/w154${path}`
    : undefined;
}

function categoryForMedia(
  options: CategoryOption[],
  mediaType: TmdbCandidate["mediaType"],
) {
  const pattern =
    mediaType === "tv"
      ? /\b(?:tv|television|series|shows?)\b/i
      : /\b(?:movies?|films?|cinema)\b/i;
  return options.find((option) =>
    pattern.test(`${option.name} ${option.slug.replaceAll("-", " ")}`),
  )?.slug;
}

function parsedSummary(result: TmdbIdentification) {
  const { parsed } = result;
  return [
    parsed.title,
    parsed.year,
    parsed.mediaType === "tv"
      ? "TV"
      : parsed.mediaType === "movie"
        ? "Movie"
        : null,
    parsed.season !== undefined
      ? `S${String(parsed.season).padStart(2, "0")}${parsed.episodes
          .map((episode) => `E${String(episode).padStart(2, "0")}`)
          .join("")}`
      : null,
    parsed.episodeTitle,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function UploadPage() {
  const { session } = useAuth();
  const router = useRouter();
  const { config } = useTrackerConfig();
  const [file, setFile] = useState<File | null>(null);
  const [torrentPayload, setTorrentPayload] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [category, setCategory] = useState("");
  const [metadataQuery, setMetadataQuery] = useState("");
  const [metadata, setMetadata] = useState<TmdbIdentification | null>(null);
  const [metadataError, setMetadataError] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [showMetadataChoices, setShowMetadataChoices] = useState(false);
  const [selectedMetadata, setSelectedMetadata] = useState<
    TmdbCandidate | "none" | null
  >(null);
  const identifyRequest = useRef<AbortController | null>(null);
  const categoryOptions = configCategoryOptions(
    config.categories,
    fallbackCategories,
  );
  const selectedCategory = categoryOptions.find(
    (option) => option.slug === category,
  );
  const categorySources = selectedCategory?.sources ?? [];

  async function identifyMetadata(
    input: { torrent?: string; query?: string },
    mediaCategory = category,
  ) {
    identifyRequest.current?.abort();
    const controller = new AbortController();
    identifyRequest.current = controller;
    setIdentifying(true);
    setShowMetadataChoices(true);
    setMetadataError("");

    try {
      const result = await apiFetch<TmdbIdentification>("/torrent/identify", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ ...input, type: mediaCategory || undefined }),
      });
      setMetadata(result);
      setMetadataQuery(result.parsed.query);
      setName((current) => current || result.parsed.releaseName);

      const automaticMatch = result.candidates.find(
        (candidate) => candidate.id === result.autoMatchId,
      );
      setSelectedMetadata(automaticMatch ?? null);
      setShowMetadataChoices(automaticMatch?.confidence !== 100);
      if (automaticMatch) {
        const matchedCategory = categoryForMedia(
          categoryOptions,
          automaticMatch.mediaType,
        );
        if (matchedCategory) setCategory(matchedCategory);
      }
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setMetadata(null);
      setSelectedMetadata("none");
      setShowMetadataChoices(true);
      setMetadataError(
        requestError instanceof Error
          ? requestError.message
          : "Could not identify this release.",
      );
    } finally {
      if (identifyRequest.current === controller) setIdentifying(false);
    }
  }

  async function chooseFile(nextFile: File | null) {
    identifyRequest.current?.abort();
    setFile(nextFile);
    setTorrentPayload("");
    setName("");
    setDescription("");
    setMetadata(null);
    setMetadataQuery("");
    setMetadataError("");
    setSelectedMetadata(null);
    setShowMetadataChoices(false);
    if (!nextFile) return;

    const maxBytes = config.contentLimits.torrentFileSizeKb * 1024;
    if (nextFile.size > maxBytes) {
      setMetadataError(
        `Torrent files cannot exceed ${config.contentLimits.torrentFileSizeKb} KB.`,
      );
      setFile(null);
      return;
    }

    try {
      const payload = await fileToBase64(nextFile);
      setTorrentPayload(payload);
      await identifyMetadata({ torrent: payload });
    } catch (readError) {
      setMetadataError(
        readError instanceof Error
          ? readError.message
          : "Could not read the selected file.",
      );
    }
  }

  function selectMetadata(candidate: TmdbCandidate) {
    setSelectedMetadata(candidate);
    setShowMetadataChoices(candidate.confidence !== 100);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a .torrent file first.");
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const payload = torrentPayload || (await fileToBase64(file));
      const result = await apiFetch<{
        infoHash: string;
        status: "pending" | "approved";
      }>(
        "/torrent/upload",
        {
          method: "POST",
          body: JSON.stringify({
            torrent: payload,
            name: form.get("name"),
            type: form.get("type"),
            source: form.get("source") || undefined,
            description: form.get("description"),
            tags: form.get("tags"),
            mediaInfo: form.get("mediaInfo") || undefined,
            anonymous: form.get("anonymous") === "on",
            tmdb:
              selectedMetadata && selectedMetadata !== "none"
                ? {
                    id: selectedMetadata.id,
                    mediaType: selectedMetadata.mediaType,
                  }
                : undefined,
          }),
        },
      );
      if (result.status === "pending") {
        formElement.reset();
        setFile(null);
        setTorrentPayload("");
        setName("");
        setDescription("");
        setCategory("");
        setMetadata(null);
        setMetadataQuery("");
        setMetadataError("");
        setSelectedMetadata(null);
        setShowMetadataChoices(false);
        setMessage("Upload submitted for staff review.");
      } else {
        router.push(`/torrent/${result.infoHash}`);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Upload failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!session)
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  const announceUrl = `${config.trackerUrl || apiOrigin()}/announce/${session.uid}`;
  const requiresReview =
    config.torrentPremoderation &&
    session.role !== "staff" &&
    session.role !== "admin";
  const confirmedAutomaticMatch =
    selectedMetadata &&
    selectedMetadata !== "none" &&
    selectedMetadata.confidence === 100 &&
    !showMetadataChoices
      ? selectedMetadata
      : null;

  async function copyAnnounceUrl() {
    try {
      await navigator.clipboard.writeText(announceUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = announceUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  return (
    <main className="page form-page">
      <PageHeader title="Upload" />
      {requiresReview ? (
        <div className="upload-review-notice">
          <Info aria-hidden="true" />
          <div>
            <strong>Staff review is required</strong>
            <span>
              Your torrent will stay private until a moderator approves it. You
              will receive a message when a decision is made.
            </span>
          </div>
        </div>
      ) : null}
      <p className="announce-hint">
        <Link2 aria-hidden="true" />
        <span>
          Announce URL must point to this tracker before the upload can be
          accepted.
        </span>
        <span className="info-tooltip" tabIndex={0} aria-label={announceUrl}>
          <Info aria-hidden="true" />
          <span role="tooltip">
            The announce URL is the tracker address inside a .torrent that your
            client reports to. Torrents you upload must point to it so your
            upload and download stats are counted.
            <button
              type="button"
              className="tooltip-copy"
              onClick={copyAnnounceUrl}
            >
              {copied ? (
                <Check aria-hidden="true" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {copied ? "Copied to clipboard" : announceUrl}
            </button>
          </span>
        </span>
      </p>
      <form className="stack-form wide-form" onSubmit={submit}>
        <Field label="Torrent file">
          <label className="drop-zone">
            <FileUp aria-hidden="true" />
            <strong>
              {file?.name ?? "Drag a .torrent file here, or click to select"}
            </strong>
            <input
              type="file"
              accept=".torrent,application/x-bittorrent"
              onChange={(event) =>
                void chooseFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
        </Field>
        <Field label="Name">
          <input
            name="name"
            required
            maxLength={config.contentLimits.torrentName}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Category">
            <select
              name="type"
              required
              value={category}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setCategory(nextCategory);
                if (torrentPayload) {
                  void identifyMetadata(
                    { torrent: torrentPayload },
                    nextCategory,
                  );
                }
              }}
            >
              <option value="" disabled>
                Select a category
              </option>
              {categoryOptions.map((option) => (
                <option value={option.slug} key={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select
              name="source"
              required={Boolean(categorySources.length)}
              disabled={!categorySources.length}
              defaultValue=""
            >
              <option value="">
                {categorySources.length
                  ? "Select a source"
                  : "No source required"}
              </option>
              {categorySources.map((source) => (
                <option value={source} key={source}>
                  {source.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {file && confirmedAutomaticMatch && metadata ? (
          <section className="metadata-auto-match" aria-live="polite">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>Matched automatically</strong>
              <span>
                {[
                  confirmedAutomaticMatch.title,
                  confirmedAutomaticMatch.year,
                  metadata.parsed.season !== undefined
                    ? `S${String(metadata.parsed.season).padStart(2, "0")}${metadata.parsed.episodes
                        .map(
                          (episode) => `E${String(episode).padStart(2, "0")}`,
                        )
                        .join("")}`
                    : null,
                  confirmedAutomaticMatch.episodeTitle,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowMetadataChoices(true)}
            >
              Change
            </button>
          </section>
        ) : file ? (
          <section className="metadata-picker" aria-labelledby="metadata-title">
            <div className="metadata-picker-heading">
              <div>
                <span className="eyebrow">Automatic matching</span>
                <h2 id="metadata-title">Movie or TV metadata</h2>
              </div>
              <Sparkles aria-hidden="true" />
            </div>
            <div className="metadata-search">
              <input
                aria-label="Search TMDB"
                maxLength={200}
                value={metadataQuery}
                onChange={(event) => setMetadataQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (metadataQuery.trim()) {
                    void identifyMetadata({ query: metadataQuery });
                  }
                }}
                placeholder="Search for a different title"
              />
              <button
                className="secondary-button"
                type="button"
                disabled={identifying || !metadataQuery.trim()}
                onClick={() =>
                  void identifyMetadata({ query: metadataQuery.trim() })
                }
              >
                <Search aria-hidden="true" />
                {identifying ? "Searching…" : "Search"}
              </button>
            </div>
            {metadata ? (
              <>
                <p className="metadata-detection">
                  Detected from release name:{" "}
                  <strong>{parsedSummary(metadata)}</strong>
                </p>
                {metadata.candidates.length ? (
                  <div className="metadata-candidates">
                    {metadata.candidates.map((candidate) => {
                      const poster = candidatePoster(candidate.posterPath);
                      const selected =
                        selectedMetadata !== "none" &&
                        selectedMetadata?.id === candidate.id &&
                        selectedMetadata.mediaType === candidate.mediaType;
                      return (
                        <button
                          className={`metadata-candidate${selected ? " selected" : ""}`}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => selectMetadata(candidate)}
                          key={`${candidate.mediaType}-${candidate.id}`}
                        >
                          {poster ? (
                            <Image src={poster} width={64} height={96} alt="" />
                          ) : (
                            <span className="metadata-poster-placeholder">
                              {candidate.mediaType === "tv" ? "TV" : "Film"}
                            </span>
                          )}
                          <span className="metadata-candidate-copy">
                            <strong>{candidate.title}</strong>
                            <small>
                              {candidate.year ?? "Year unknown"} ·{" "}
                              {candidate.mediaType === "tv" ? "TV" : "Movie"}
                            </small>
                            {candidate.overview ? (
                              <span>{candidate.overview}</span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      className={`metadata-candidate metadata-none${selectedMetadata === "none" ? " selected" : ""}`}
                      type="button"
                      aria-pressed={selectedMetadata === "none"}
                      onClick={() => setSelectedMetadata("none")}
                    >
                      <span className="metadata-poster-placeholder">None</span>
                      <span className="metadata-candidate-copy">
                        <strong>No metadata match</strong>
                        <small>
                          Upload without attaching a movie or TV show.
                        </small>
                      </span>
                    </button>
                  </div>
                ) : (
                  <p className="metadata-detection">
                    No TMDB candidates found. Try a simpler title above.
                  </p>
                )}
              </>
            ) : identifying ? (
              <p className="metadata-detection">
                Parsing release and searching TMDB…
              </p>
            ) : null}
            <ActionMessage error={metadataError} />
          </section>
        ) : null}
        <Field label="Description">
          <textarea
            name="description"
            rows={8}
            required
            maxLength={config.contentLimits.body}
            placeholder="Markdown supported"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <AttachmentPicker
            onInsert={(markdown) =>
              setDescription((current) => `${current}${markdown}`)
            }
          />
        </Field>
        <Field label="Tags">
          <input
            name="tags"
            maxLength={config.contentLimits.torrentTags}
            placeholder="Separated by commas"
          />
        </Field>
        <Field label="Media info">
          <textarea
            name="mediaInfo"
            rows={5}
            maxLength={config.contentLimits.mediaInfo}
            placeholder="Optional technical metadata"
          />
        </Field>
        {config.allowAnonymousUploads ? (
          <label className="check-field">
            <input name="anonymous" type="checkbox" /> Upload anonymously
          </label>
        ) : null}
        <ActionMessage message={message} error={error} />
        <div className="form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={submitting || identifying}
          >
            {submitting
              ? "Uploading…"
              : identifying
                ? "Identifying…"
                : requiresReview
                  ? "Submit for review"
                  : "Upload"}
          </button>
        </div>
      </form>
    </main>
  );
}
