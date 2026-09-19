"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { formatDateTime } from "@/lib/format";
import { canModerate } from "@/lib/api";
import type { Report } from "@/lib/types";

export function ReportsPage({ embedded }: { embedded?: boolean }) {
  const { session } = useAuth();
  const [tab, setTab] = useState<"open" | "solved">("open");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const allowed = canModerate(session?.role);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const base = tab === "solved" ? "/reports/solved/page/0" : "/reports/page/0";
  const { data, error, loading } = useApiData<Report[]>(
    allowed
      ? `${base}${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`
      : null,
  );
  if (!session)
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  const content = (
    <>
      {embedded ? null : <PageHeader title="Reports" />}
      <div className="tab-bar" role="tablist" aria-label="Reports">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "open"}
          onClick={() => setTab("open")}
        >
          Open
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "solved"}
          onClick={() => setTab("solved")}
        >
          Solved
        </button>
      </div>
      <div className="list-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search reports by title or reason"
          aria-label="Search reports"
        />
      </div>
      <ApiState
        loading={loading}
        error={!allowed ? "Staff access is required." : error}
        empty={!data?.length}
      >
        <div className="feed-list">
          {data?.map((report) => (
            <Link
              className="feed-card"
              href={`/reports/${report._id}`}
              key={report._id}
            >
              <div>
                <h2>
                  {report.solved ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <TriangleAlert aria-hidden="true" />
                  )}
                  {report.torrent?.name ?? "Deleted torrent"}
                </h2>
                <p>
                  Reported {formatDateTime(report.created)} by{" "}
                  <span>{report.reportedBy?.username ?? "Unknown"}</span>
                  {report.solved && report.solvedAt
                    ? ` · Solved ${formatDateTime(report.solvedAt)}`
                    : ""}
                </p>
              </div>
              <span className="feed-arrow">
                <ArrowRight aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </ApiState>
    </>
  );

  if (embedded) return <div className="moderation-embedded">{content}</div>;
  return <main className="page list-page">{content}</main>;
}
