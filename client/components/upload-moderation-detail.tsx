"use client";

import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-context";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch, canModerate } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import type { TorrentSubmission } from "@/lib/types";

function filePath(file: NonNullable<TorrentSubmission["files"]>[number]) {
  if (typeof file.path === "string") return file.path;
  if (typeof file.name === "string") return file.name;
  return "Unnamed file";
}

export function UploadModerationDetail({ id }: { id: string }) {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const allowed = canModerate(session?.role);
  const submission = useApiData<TorrentSubmission>(
    allowed
      ? `/moderation/torrent-submissions/${encodeURIComponent(id)}`
      : null,
  );
  const [rejecting, setRejecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  async function approve() {
    setSaving(true);
    setMessage("");
    setActionError("");
    try {
      await apiFetch(`/moderation/torrent-submissions/${id}/approve`, {
        method: "POST",
      });
      setMessage("Upload approved and the uploader was notified.");
      submission.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not approve the upload.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("");
    setActionError("");
    try {
      await apiFetch(`/moderation/torrent-submissions/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: form.get("reason") }),
      });
      setRejecting(false);
      setMessage("Upload rejected and the uploader was notified.");
      submission.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reject the upload.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function retryNotification() {
    setSaving(true);
    setMessage("");
    setActionError("");
    try {
      await apiFetch(`/moderation/torrent-submissions/${id}/notify`, {
        method: "POST",
      });
      setMessage("Decision message sent to the uploader.");
      submission.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not notify the uploader.",
      );
    } finally {
      setSaving(false);
    }
  }

  const data = submission.data;
  const pending = data?.status === "pending" || data?.status === "approving";

  return (
    <main className="page detail-page moderation-detail-page">
      <ApiState
        loading={submission.loading}
        error={!allowed ? "Staff access is required." : submission.error}
        empty={!data}
      >
        {data ? (
          <>
            <PageHeader
              title={data.name}
              actions={
                pending ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={saving}
                      onClick={approve}
                    >
                      <Check aria-hidden="true" />
                      {data.status === "approving"
                        ? "Resume approval"
                        : "Approve"}
                    </button>
                    {data.status === "pending" ? (
                      <button
                        className="secondary-button danger-action"
                        type="button"
                        disabled={saving}
                        onClick={() => setRejecting((open) => !open)}
                      >
                        <X aria-hidden="true" />{" "}
                        {rejecting ? "Cancel rejection" : "Reject"}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    {data.status === "approved" ? (
                      <Link
                        className="primary-button button-link"
                        href={`/torrent/${data.infoHash}`}
                      >
                        View torrent <ExternalLink aria-hidden="true" />
                      </Link>
                    ) : null}
                    {!data.notifiedAt ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={saving}
                        onClick={retryNotification}
                      >
                        Retry notification
                      </button>
                    ) : null}
                  </>
                )
              }
            />
            <ActionMessage message={message} error={actionError} />
            {rejecting ? (
              <form className="moderation-rejection-form" onSubmit={reject}>
                <Field
                  label="Reason for rejection"
                  hint="This reason will be sent to the uploader in a private message."
                >
                  <textarea
                    name="reason"
                    rows={5}
                    required
                    maxLength={config.contentLimits.comment}
                  />
                </Field>
                <button
                  className="secondary-button danger-action"
                  disabled={saving}
                >
                  {saving ? "Rejecting…" : "Reject upload"}
                </button>
              </form>
            ) : null}
            <section className="detail-card moderation-summary">
              <span
                className={`moderation-status moderation-status-${data.status}`}
              >
                {data.status === "approving" ? "Approving" : data.status}
              </span>
              <dl className="detail-list">
                <div>
                  <dt>Uploader</dt>
                  <dd>
                    {data.uploadedBy?.username ? (
                      <Link
                        href={`/user/${encodeURIComponent(data.uploadedBy.username)}`}
                      >
                        {data.uploadedBy.username}
                      </Link>
                    ) : (
                      data.anonymous ? "Anonymous" : "Unknown"
                    )}
                    {data.anonymous && data.uploadedBy
                      ? " (anonymous after publication)"
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Info hash</dt>
                  <dd className="mono">{data.infoHash}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{data.type || "None"}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{data.source || "None"}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatBytes(data.size)}</dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{formatDateTime(data.submittedAt)}</dd>
                </div>
                {data.reviewedAt ? (
                  <div>
                    <dt>Reviewed</dt>
                    <dd>
                      {formatDateTime(data.reviewedAt)} by{" "}
                      {data.reviewedBy?.username ?? "Unknown"}
                    </dd>
                  </div>
                ) : null}
                {data.groupWith ? (
                  <div>
                    <dt>Requested group</dt>
                    <dd className="mono">{data.groupWith}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
            {data.rejectionReason ? (
              <section className="copy-section moderation-rejection-copy">
                <h2>Rejection reason</h2>
                <p>{data.rejectionReason}</p>
              </section>
            ) : null}
            <section className="copy-section">
              <h2>Description</h2>
              <div className="rendered-markdown">
                <Markdown text={data.description ?? ""} />
              </div>
            </section>
            {data.mediaInfo ? (
              <section className="copy-section">
                <h2>MediaInfo</h2>
                <pre className="moderation-media-info">{data.mediaInfo}</pre>
              </section>
            ) : null}
            <section className="copy-section">
              <h2>Files ({data.files?.length ?? 0})</h2>
              <div className="moderation-files">
                {data.files?.map((file, index) => (
                  <div key={`${filePath(file)}-${index}`}>
                    <span>{filePath(file)}</span>
                    <small>{formatBytes(file.size ?? file.length)}</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </ApiState>
    </main>
  );
}
