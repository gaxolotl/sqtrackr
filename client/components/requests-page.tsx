"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  Clock3,
  Plus,
  XCircle,
} from "lucide-react";
import { KeyboardEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { TorrentSubmissionPage, TrackerRequest } from "@/lib/types";

type Tab = "requests" | "submissions";

function SubmissionStatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 aria-hidden="true" />;
  if (status === "rejected") return <XCircle aria-hidden="true" />;
  return <Clock3 aria-hidden="true" />;
}

export function RequestsPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("requests");
  const [submissionPage, setSubmissionPage] = useState(0);
  const requestsTab = useRef<HTMLButtonElement>(null);
  const submissionsTab = useRef<HTMLButtonElement>(null);
  const { data, error, loading } = useApiData<TrackerRequest[]>(session ? "/requests/page/0" : null);
  const submissions = useApiData<TorrentSubmissionPage>(
    session && tab === "submissions"
      ? `/moderation/my-submissions?page=${submissionPage}`
      : null,
  );
  if (!session) return <main className="page"><SignInRequired /></main>;

  function selectTab(next: Tab) {
    setTab(next);
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, current: Tab) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const order: Tab[] = ["requests", "submissions"];
    const index = order.indexOf(current);
    let next: Tab;
    if (event.key === "Home") next = order[0];
    else if (event.key === "End") next = order[order.length - 1];
    else {
      const delta = event.key === "ArrowRight" ? 1 : -1;
      next = order[(index + delta + order.length) % order.length];
    }
    selectTab(next);
    (next === "requests" ? requestsTab : submissionsTab).current?.focus();
  }

  return (
    <main className="page list-page">
      <PageHeader
        title="Requests"
        actions={
          tab === "requests" ? (
            <Link className="primary-button button-link" href="/requests/new">
              <Plus aria-hidden="true" /> New request
            </Link>
          ) : undefined
        }
      />
      <div className="tab-bar" role="tablist" aria-label="Requests">
        <button
          ref={requestsTab}
          id="requests-tab-requests"
          type="button"
          role="tab"
          aria-controls="requests-panel"
          aria-selected={tab === "requests"}
          tabIndex={tab === "requests" ? 0 : -1}
          onClick={() => selectTab("requests")}
          onKeyDown={(event) => handleTabKey(event, "requests")}
        >
          Requests
        </button>
        <button
          ref={submissionsTab}
          id="requests-tab-submissions"
          type="button"
          role="tab"
          aria-controls="requests-panel"
          aria-selected={tab === "submissions"}
          tabIndex={tab === "submissions" ? 0 : -1}
          onClick={() => selectTab("submissions")}
          onKeyDown={(event) => handleTabKey(event, "submissions")}
        >
          My submissions
        </button>
      </div>
      <section
        id="requests-panel"
        role="tabpanel"
        aria-labelledby={`requests-tab-${tab}`}
      >
        {tab === "requests" ? (
          <ApiState loading={loading} error={error} empty={!data?.length}>
            <div className="feed-list">
              {data?.map((item) => (
                <Link className="feed-card" href={`/requests/${item.index}`} key={item._id}>
                  <div>
                    <h2>
                      {item.fulfilledBy ? (
                        <CheckCircle2 className="success-icon" />
                      ) : (
                        <CircleDashed />
                      )}
                      {item.title}
                    </h2>
                    <p>
                      Posted {formatDateTime(item.created)} by{" "}
                      <span>{item.createdBy?.username ?? "Unknown"}</span>
                    </p>
                  </div>
                  <span className="status-pill">
                    {item.fulfilledBy ? "Filled" : "Open"}
                  </span>
                </Link>
              ))}
            </div>
          </ApiState>
        ) : (
          <ApiState
            loading={submissions.loading}
            error={submissions.error}
            empty={!submissions.data?.items.length}
          >
            <div className="feed-list">
              {submissions.data?.items.map((submission) => {
                const label =
                  submission.status === "approving"
                    ? "Approving"
                    : submission.status === "approved"
                      ? "Approved"
                      : submission.status === "rejected"
                        ? "Rejected"
                        : "Pending";
                const card = (
                  <>
                    <div>
                      <h2>
                        <SubmissionStatusIcon status={submission.status} />
                        {submission.name}
                      </h2>
                      <p>
                        Submitted {formatDateTime(submission.submittedAt)}
                        {` · ${formatBytes(submission.size)}`}
                        {submission.status === "rejected" &&
                        submission.rejectionReason
                          ? ` · Reason: ${submission.rejectionReason}`
                          : ""}
                      </p>
                    </div>
                    <span className="status-pill">{label}</span>
                  </>
                );
                return submission.status === "approved" ? (
                  <Link
                    className="feed-card"
                    href={`/torrent/${submission.infoHash}`}
                    key={submission._id}
                  >
                    {card}
                  </Link>
                ) : (
                  <article className="feed-card" key={submission._id}>
                    {card}
                  </article>
                );
              })}
            </div>
            {submissions.data ? (
              <Pager
                page={submissions.data.page}
                pageSize={submissions.data.pageSize}
                total={submissions.data.total}
                onPageChange={setSubmissionPage}
              />
            ) : null}
          </ApiState>
        )}
      </section>
    </main>
  );
}
