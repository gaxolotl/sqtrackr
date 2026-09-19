"use client";

import {
  Activity,
  CheckCircle2,
  Download,
  HardDriveUpload,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-context";
import { ActionMessage, ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch } from "@/lib/api";
import type { TrackerStats } from "@/lib/types";

export function StatsPage({ embedded }: { embedded?: boolean }) {
  const { session } = useAuth();
  const { data, error, loading, reload } = useApiData<TrackerStats>(
    session?.role === "admin" ? "/admin/stats" : null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  if (!session) return <main className="page"><SignInRequired /></main>;

  async function refreshStats() {
    setRefreshing(true);
    setRefreshError("");
    try {
      await apiFetch("/admin/stats/refresh", { method: "POST" });
      reload();
    } catch (requestError) {
      setRefreshError(
        requestError instanceof Error
          ? requestError.message
          : "Could not refresh tracker stats."
      );
    } finally {
      setRefreshing(false);
    }
  }

  const cards = data
    ? [
        { label: "Registered users", value: data.registeredUsers, icon: Users },
        { label: "Uploaded torrents", value: data.uploadedTorrents, icon: HardDriveUpload },
        { label: "Completed downloads", value: data.completedDownloads, icon: Download },
        { label: "Active torrents", value: data.activeTorrents, icon: Activity },
        { label: "Peers online", value: data.peers, icon: Radio },
        { label: "Invites accepted", value: `${data.invitesAccepted}/${data.totalInvitesSent}`, icon: Send },
        { label: "Requests filled", value: `${data.filledRequests}/${data.totalRequests}`, icon: CheckCircle2 },
        { label: "Comments", value: data.totalComments, icon: MessageSquare },
      ]
    : [];
  const isAdmin = session.role === "admin";

  const content = (
    <>
      {embedded ? null : (
        <PageHeader
          title="Stats"
          actions={
            isAdmin ? (
              <button
                className="secondary-button"
                type="button"
                onClick={refreshStats}
                disabled={refreshing}
              >
                <RefreshCw aria-hidden="true" className={refreshing ? "spin" : undefined} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            ) : undefined
          }
        />
      )}
      {embedded && isAdmin ? (
        <div className="moderation-embedded-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={refreshStats}
            disabled={refreshing}
          >
            <RefreshCw aria-hidden="true" className={refreshing ? "spin" : undefined} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      ) : null}
      {refreshError ? <ActionMessage error={refreshError} /> : null}
      <ApiState
        loading={loading}
        error={!isAdmin ? "Administrator access is required." : error}
        empty={!data}
      >
        <section className="metric-grid">
          {cards.map(({ label, value, icon: Icon }) => (
            <article className="metric-card" key={label}>
              <Icon aria-hidden="true" />
              <div>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            </article>
          ))}
        </section>
      </ApiState>
    </>
  );

  if (embedded) return <div className="moderation-embedded">{content}</div>;
  return <main className="page">{content}</main>;
}
