"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-context";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { Pager } from "@/components/pager";
import { useApiData } from "@/hooks/use-api-data";
import { formatDateTime } from "@/lib/format";
import { canModerate } from "@/lib/api";

type AuditEntry = {
  _id: string;
  actorUsername?: string | null;
  action: string;
  target?: string;
  details?: string;
  created: number;
};

type AuditPage = {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export function AuditLogPage({ embedded }: { embedded?: boolean }) {
  const { session } = useAuth();
  const [page, setPage] = useState(0);
  const allowed = canModerate(session?.role);
  const { data, error, loading } = useApiData<AuditPage>(
    allowed ? `/admin/audit-log/page/${page}` : null,
  );

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  const content = (
    <>
      {embedded ? null : <PageHeader title="Audit log" />}
      <ApiState
        loading={loading}
        error={!allowed ? "Staff access is required." : error}
        empty={!data?.items.length}
      >
        <div className="feed-list">
          {data?.items.map((entry) => (
            <article className="feed-card" key={entry._id}>
              <div>
                <h2>{entry.action}</h2>
                <p>
                  {formatDateTime(entry.created)} by{" "}
                  <span>{entry.actorUsername ?? "Unknown"}</span>
                  {entry.target ? ` · ${entry.target}` : ""}
                </p>
                {entry.details ? <p>{entry.details}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </ApiState>
      {data ? (
        <Pager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      ) : null}
    </>
  );

  if (embedded) return <div className="moderation-embedded">{content}</div>;
  return <main className="page list-page">{content}</main>;
}
