"use client";

import Link from "next/link";
import { ArrowRight, Pin, Plus } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { FeatureDisabled } from "@/components/feature-disabled";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { formatDateTime } from "@/lib/format";
import type { Announcement } from "@/lib/types";

export function AnnouncementsPage() {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const pinned = useApiData<Announcement[]>(session ? "/announcements/pinned" : null);
  const latest = useApiData<Announcement[]>(session ? "/announcements/page/0" : null);
  if (!session) return <main className="page"><SignInRequired /></main>;
  if (!config.announcementsEnabled) return <FeatureDisabled name="Announcements" />;
  const items = [...(pinned.data ?? []), ...(latest.data ?? [])];
  const error = pinned.error || latest.error;

  return (
    <main className="page list-page">
      <PageHeader title="Announcements" actions={session.role === "admin" ? <Link className="primary-button button-link" href="/announcements/new"><Plus aria-hidden="true" /> New announcement</Link> : null} />
      <ApiState loading={pinned.loading || latest.loading} error={error} empty={!items.length}>
        <div className="feed-list">{items.map((item) => <Link className="feed-card" href={`/announcements/${item.slug}`} key={item._id}><div><h2>{item.pinned ? <Pin aria-label="Pinned" /> : null}{item.title}</h2><p>Posted {formatDateTime(item.created)} by <span>{item.createdBy?.username ?? "Unknown"}</span></p></div><span className="feed-arrow"><ArrowRight aria-hidden="true" /></span></Link>)}</div>
      </ApiState>
    </main>
  );
}
