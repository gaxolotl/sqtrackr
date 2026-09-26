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
import { ActionMessage, ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch } from "@/lib/api";
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
  const { data, error, loading, reload } = useApiData<Report[]>(
    allowed
      ? `${base}${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`
      : null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");
  if (!session)
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  }

  async function resolveSelected() {
    if (!selected.length) return;
    setBulkMessage("");
    setBulkError("");
    try {
      const result = await apiFetch<{ resolved?: number }>("/reports/resolve-many", {
        method: "POST",
        body: JSON.stringify({ ids: selected }),
      });
      setSelected([]);
      setBulkMessage(`${result.resolved ?? 0} reports resolved.`);
      reload();
    } catch (requestError) {
      setBulkError(
        requestError instanceof Error
          ? requestError.message
          : "Could not resolve reports.",
      );
    }
  }

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
      <ActionMessage message={bulkMessage} error={bulkError} />
      {tab === "open" && data?.length ? (
        <div className="moderation-bulk-actions">
          <button
            className="secondary-button compact-button"
            type="button"
            disabled={!selected.length}
            onClick={resolveSelected}
          >
            Resolve selected ({selected.length})
          </button>
        </div>
      ) : null}
      <ApiState
        loading={loading}
        error={!allowed ? "Staff access is required." : error}
        empty={!data?.length}
      >
        <div className="feed-list">
          {data?.map((report) => (
            <article className="feed-card" key={report._id}>
              {tab === "open" ? (
                <input
                  type="checkbox"
                  checked={selected.includes(report._id)}
                  onChange={() => toggleSelected(report._id)}
                  aria-label={`Select report on ${report.torrent?.name ?? "deleted torrent"}`}
                />
              ) : null}
              <Link
                className="feed-card-link"
                href={`/reports/${report._id}`}
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
            </article>
          ))}
        </div>
      </ApiState>
    </>
  );

  if (embedded) return <div className="moderation-embedded">{content}</div>;
  return <main className="page list-page">{content}</main>;
}
