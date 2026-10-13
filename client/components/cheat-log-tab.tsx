"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-context";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { canModerate } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type CheatEntry = {
  _id: string;
  userId?: string;
  username?: string | null;
  infoHash?: string;
  peerId?: string;
  reason?: string;
  details?: string;
  created: number;
};

const pageSize = 25;

export function CheatLogTab({ embedded }: { embedded?: boolean }) {
  const { session } = useAuth();
  const [page, setPage] = useState(0);
  const [reason, setReason] = useState("");
  const allowed = canModerate(session?.role);
  const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  const { data, error, loading } = useApiData<CheatEntry[]>(
    allowed ? `/admin/cheat-log/page/${page}${query}` : null,
  );
  const entries = data ?? [];
  const hasMore = entries.length >= pageSize;

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  const content = (
    <>
      {embedded ? null : <PageHeader title="Cheat log" />}
      <div className="moderation-filters">
        <label>
          <span>Reason</span>
          <select
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setPage(0);
            }}
            aria-label="Filter by cheat reason"
          >
            <option value="">All reasons</option>
            <option value="impossible-upload-speed">Impossible upload speed</option>
            <option value="announce-too-frequent">Announce too frequent</option>
            <option value="download-exceeds-size">Download exceeds size</option>
            <option value="completed-without-download">Completed without download</option>
          </select>
        </label>
      </div>
      <ApiState
        loading={loading}
        error={!allowed ? "Staff access is required." : error}
        empty={!loading && !entries.length}
      >
        <div className="feed-list">
          {entries.map((entry) => (
            <article className="feed-card" key={entry._id}>
              <div>
                <h2>{entry.reason ?? "Flagged announce"}</h2>
                <p>
                  {formatDateTime(entry.created)}
                  {entry.username ? (
                    <>
                      {" by "}
                      <Link href={`/user/${encodeURIComponent(entry.username)}`}>
                        {entry.username}
                      </Link>
                    </>
                  ) : null}
                  {entry.details ? ` · ${entry.details}` : ""}
                </p>
                {entry.infoHash ? (
                  <p>
                    <Link href={`/torrent/${entry.infoHash}`}>
                      {entry.infoHash}
                    </Link>
                  </p>
                ) : null}
              </div>
              <span className="status-pill">Review</span>
            </article>
          ))}
        </div>
      </ApiState>
      <div className="candidate-actions">
        <button
          className="secondary-button compact-button"
          type="button"
          disabled={page === 0 || loading}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span aria-live="polite">Page {page + 1}</span>
        <button
          className="secondary-button compact-button"
          type="button"
          disabled={loading || !hasMore}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );

  if (embedded) return <div className="moderation-embedded">{content}</div>;
  return <main className="page list-page">{content}</main>;
}
