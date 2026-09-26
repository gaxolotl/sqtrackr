"use client";

import Link from "next/link";
import { CheckCircle2, Clock3, Search, XCircle } from "lucide-react";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import { ActionMessage, ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch } from "@/lib/api";
import { canModerate } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { TorrentSubmissionPage } from "@/lib/types";

type View = "pending" | "reviewed";

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 aria-hidden="true" />;
  if (status === "rejected") return <XCircle aria-hidden="true" />;
  return <Clock3 aria-hidden="true" />;
}

export function UploadModerationPage({ embedded }: { embedded?: boolean }) {
  const { session } = useAuth();
  const allowed = canModerate(session?.role);
  const [view, setView] = useState<View>("pending");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const pendingTab = useRef<HTMLButtonElement>(null);
  const reviewedTab = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const query = new URLSearchParams({ view, page: String(page) });
  if (debounced) query.set("q", debounced);
  const submissions = useApiData<TorrentSubmissionPage>(
    allowed ? `/moderation/torrent-submissions?${query}` : null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");

  function selectView(next: View) {
    setView(next);
    setPage(0);
    setSelected([]);
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, tab: View) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "pending"
        : event.key === "End"
          ? "reviewed"
          : tab === "pending"
            ? "reviewed"
            : "pending";
    selectView(next);
    (next === "pending" ? pendingTab : reviewedTab).current?.focus();
  }

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  }

  async function rejectSelected() {
    if (!selected.length) return;
    const reason = window.prompt("Rejection reason for all selected uploads:");
    if (reason === null || !reason.trim()) return;
    setBulkMessage("");
    setBulkError("");
    try {
      const result = await apiFetch<{ rejected?: number }>(
        "/moderation/torrent-submissions/reject-many",
        {
          method: "POST",
          body: JSON.stringify({ ids: selected, reason: reason.trim() }),
        },
      );
      setSelected([]);
      setBulkMessage(`${result.rejected ?? 0} submissions rejected.`);
      submissions.reload();
    } catch (requestError) {
      setBulkError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reject submissions.",
      );
    }
  }

  const content = (
    <>
      {embedded ? null : <PageHeader title="Upload moderation" />}
      <div className="tab-bar" role="tablist" aria-label="Upload submissions">
        <button
          ref={pendingTab}
          id="pending-submissions-tab"
          type="button"
          role="tab"
          aria-controls="submission-list"
          aria-selected={view === "pending"}
          tabIndex={view === "pending" ? 0 : -1}
          onClick={() => selectView("pending")}
          onKeyDown={(event) => handleTabKey(event, "pending")}
        >
          Pending review
        </button>
        <button
          ref={reviewedTab}
          id="reviewed-submissions-tab"
          type="button"
          role="tab"
          aria-controls="submission-list"
          aria-selected={view === "reviewed"}
          tabIndex={view === "reviewed" ? 0 : -1}
          onClick={() => selectView("reviewed")}
          onKeyDown={(event) => handleTabKey(event, "reviewed")}
        >
          Reviewed
        </button>
      </div>
      <div className="list-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or info hash"
          aria-label="Search upload submissions"
        />
      </div>
      <section
        id="submission-list"
        role="tabpanel"
        aria-labelledby={`${view}-submissions-tab`}
      >
        <ActionMessage message={bulkMessage} error={bulkError} />
        {view === "pending" && submissions.data?.items.length ? (
          <div className="moderation-bulk-actions">
            <button
              className="secondary-button compact-button"
              type="button"
              disabled={!selected.length}
              onClick={rejectSelected}
            >
              Reject selected ({selected.length})
            </button>
          </div>
        ) : null}
        <ApiState
          loading={submissions.loading}
          error={!allowed ? "Staff access is required." : submissions.error}
          empty={!submissions.data?.items.length}
        >
          <div className="feed-list">
            {submissions.data?.items.map((submission) => (
              <article className="feed-card" key={submission._id}>
                {view === "pending" ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(submission._id)}
                    onChange={() => toggleSelected(submission._id)}
                    aria-label={`Select submission ${submission.name}`}
                  />
                ) : null}
                <Link
                  className="feed-card-link"
                  href={`/moderation/uploads/${submission._id}`}
                >
                  <div>
                    <h2>
                      <StatusIcon status={submission.status} />
                      {submission.name}
                    </h2>
                    <p>
                      Submitted {formatDateTime(submission.submittedAt)} by{" "}
                      <span>
                        {submission.uploadedBy?.username ??
                          (submission.anonymous ? "Anonymous" : "Unknown")}
                      </span>
                      {submission.anonymous ? " · Anonymous upload" : ""}
                      {` · ${submission.type || "Uncategorised"}`}
                      {submission.source ? ` / ${submission.source}` : ""}
                      {` · ${formatBytes(submission.size)}`}
                    </p>
                  </div>
                  <span className="status-pill">
                    {submission.status === "approving"
                      ? "Approving"
                      : submission.status === "approved"
                        ? "Approved"
                        : submission.status === "rejected"
                          ? "Rejected"
                          : "Pending"}
                  </span>
                </Link>
              </article>
            ))}
          </div>
          {submissions.data ? (
            <Pager
              page={submissions.data.page}
              pageSize={submissions.data.pageSize}
              total={submissions.data.total}
              onPageChange={setPage}
            />
          ) : null}
        </ApiState>
      </section>
    </>
  );

  if (embedded) return <div className="moderation-embedded">{content}</div>;
  return <main className="page list-page moderation-page">{content}</main>;
}
