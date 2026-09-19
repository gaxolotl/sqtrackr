"use client";

import Link from "next/link";
import { CheckCircle2, Clock3, Search, XCircle } from "lucide-react";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
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

  function selectView(next: View) {
    setView(next);
    setPage(0);
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
        <ApiState
          loading={submissions.loading}
          error={!allowed ? "Staff access is required." : submissions.error}
          empty={!submissions.data?.items.length}
        >
          <div className="feed-list">
            {submissions.data?.items.map((submission) => (
              <Link
                className="feed-card"
                href={`/moderation/uploads/${submission._id}`}
                key={submission._id}
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
