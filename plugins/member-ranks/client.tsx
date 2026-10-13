"use client";

import {
  defineClientPlugin,
  type PluginManifest,
  type PluginTabProps,
} from "@sqtrackr/plugin-sdk/client";
import sharedManifest from "@sqtrackr/plugin-member-ranks/manifest";
import { Award, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-context";
import { ApiState, SignInRequired } from "@/components/ui";
import { Pager } from "@/components/pager";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch } from "@/lib/api";

export const manifest = {
  ...sharedManifest,
  description: "Earned member classes with progress tracking and ratio-watch visibility.",
} as const satisfies PluginManifest;

type RankProgress = {
  label: string;
  current: number | string;
  target: number;
  unit: string;
  met: boolean;
};

type RankInfo = {
  class: string;
  name: string;
  next: { key: string; name: string; progress: RankProgress[] } | null;
  stats: {
    uploadGb: number;
    ratio: number;
    ageDays: number;
    uploads: number;
    hitnruns: number;
  };
};

type RankResponse = {
  user: { userId: string; username: string; banned: boolean };
  rank: RankInfo;
  watch: { lowRatio: boolean; tooManyHnr: boolean; atRisk: boolean };
  enforcement: { minimumRatio: number | null; maximumHitNRuns: number | null };
};

type MemberItem = {
  _id: string;
  username: string;
};

type MembersResponse = {
  items: MemberItem[];
  total: number;
  page: number;
  pageSize: number;
};

function formatCurrent(value: number | string, unit: string) {
  return unit ? `${value} ${unit}` : String(value);
}

function RankCard({ data }: { data: RankResponse }) {
  const { rank, watch, enforcement } = data;
  return (
    <div className="moderation-embedded">
      <section className="content-section">
        <div className="section-heading-row">
          <h2 className="section-title">
            <Award aria-hidden="true" /> {rank.name}
          </h2>
          {watch.atRisk ? (
            <span className="status-pill">
              <ShieldAlert aria-hidden="true" /> At risk
            </span>
          ) : null}
        </div>
        <div className="stats-grid">
          <article className="stat-card">
            <h2>Uploaded</h2>
            <p>{rank.stats.uploadGb} GB</p>
          </article>
          <article className="stat-card">
            <h2>Ratio</h2>
            <p>{rank.stats.ratio === -1 ? "∞" : rank.stats.ratio.toFixed(2)}</p>
          </article>
          <article className="stat-card">
            <h2>Uploads</h2>
            <p>{rank.stats.uploads}</p>
          </article>
          <article className="stat-card">
            <h2>Hit&apos;n&apos;runs</h2>
            <p>{rank.stats.hitnruns}</p>
          </article>
        </div>
      </section>
      {rank.next ? (
        <section className="content-section">
          <div className="section-heading-row">
            <h2 className="section-title">
              <TrendingUp aria-hidden="true" /> Next: {rank.next.name}
            </h2>
          </div>
          <div className="feed-list">
            {rank.next.progress.map((item) => (
              <article className="feed-card" key={item.label}>
                <div>
                  <h2>{item.label}</h2>
                  <p>
                    {formatCurrent(item.current, item.unit)} of{" "}
                    {formatCurrent(item.target, item.unit)}
                  </p>
                </div>
                {item.met ? (
                  <span className="status-pill">Done</span>
                ) : (
                  <span className="status-pill">To go</span>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="content-section">
          <p>Highest class achieved. Thanks for keeping the tracker alive.</p>
        </section>
      )}
      {watch.atRisk ? (
        <section className="account-section">
          <h2>Ratio watch</h2>
          {watch.lowRatio && enforcement.minimumRatio !== null ? (
            <p>
              Ratio is below the {enforcement.minimumRatio} minimum. Upload or
              seed to stay downloadable.
            </p>
          ) : null}
          {watch.tooManyHnr && enforcement.maximumHitNRuns !== null ? (
            <p>
              Hit&apos;n&apos;run count reached {enforcement.maximumHitNRuns}.
              Seed existing snatches to clear them.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function RankTab({ context }: PluginTabProps) {
  const { session } = useAuth();
  const slot =
    context && typeof context === "object"
      ? (context as { userId?: string })
      : null;
  const userId = slot?.userId;
  const rank = useApiData<RankResponse>(
    session && userId
      ? `/plugins/member-ranks/rank/user/${encodeURIComponent(userId)}`
      : null,
  );

  if (!session) return <SignInRequired />;
  return (
    <ApiState loading={rank.loading} error={rank.error} empty={!rank.data}>
      {rank.data ? <RankCard data={rank.data} /> : null}
    </ApiState>
  );
}

function RanksTab({ context }: PluginTabProps) {
  void context;
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const [page, setPage] = useState(0);
  const members = useApiData<MembersResponse>(
    isAdmin ? `/moderation/members?page=${page}` : null,
  );
  const ids = (members.data?.items ?? []).map((member) => member._id);
  const [statuses, setStatuses] = useState<RankResponse[] | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  async function loadStatuses(userIds: string[]) {
    if (!userIds.length) {
      setStatuses([]);
      return;
    }
    setStatusLoading(true);
    setStatusError("");
    try {
      const result = await apiFetch<{ users: RankResponse[] }>(
        "/plugins/member-ranks/watch/status",
        {
          method: "POST",
          body: JSON.stringify({ userIds }),
        },
      );
      setStatuses(result.users);
    } catch (requestError) {
      setStatusError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load ranks.",
      );
      setStatuses(null);
    } finally {
      setStatusLoading(false);
    }
  }

  if (!session) return <SignInRequired />;
  if (!isAdmin) return <div className="state-panel">Admin access is required.</div>;

  const byId = new Map((statuses ?? []).map((entry) => [entry.user.userId, entry]));

  return (
    <div className="moderation-embedded">
      <ApiState
        loading={members.loading}
        error={members.error}
        empty={!members.data?.items.length}
      >
        <div className="feed-list">
          {(members.data?.items ?? []).map((member) => {
            const status = byId.get(member._id);
            return (
              <article className="feed-card" key={member._id}>
                <div>
                  <h2>
                    <Link href={`/user/${encodeURIComponent(member.username)}`}>
                      {member.username}
                    </Link>
                  </h2>
                  <p>
                    {status ? (
                      <>
                        {status.rank.name} · {status.rank.stats.uploadGb} GB ·{" "}
                        ratio{" "}
                        {status.rank.stats.ratio === -1
                          ? "∞"
                          : status.rank.stats.ratio.toFixed(2)}{" "}
                        · {status.rank.stats.hitnruns} HnR
                      </>
                    ) : (
                      "Rank not loaded yet"
                    )}
                  </p>
                </div>
                {status?.watch.atRisk ? (
                  <span className="status-pill">
                    <ShieldAlert aria-hidden="true" /> At risk
                  </span>
                ) : (
                  <span className="status-pill">{status?.rank.name ?? "…"}</span>
                )}
              </article>
            );
          })}
        </div>
      </ApiState>
      <div className="candidate-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={members.loading || statusLoading || !ids.length}
          onClick={() => loadStatuses(ids)}
        >
          {statusLoading ? "Loading…" : "Load ranks for this page"}
        </button>
      </div>
      {statusError ? <p className="form-error">{statusError}</p> : null}
      {members.data ? (
        <Pager
          page={members.data.page}
          pageSize={members.data.pageSize}
          total={members.data.total}
          onPageChange={(next) => {
            setPage(next);
            setStatuses(null);
          }}
        />
      ) : null}
    </div>
  );
}

export const tabs = [
  {
    slot: "profile",
    label: "Rank",
    component: RankTab,
  },
  {
    slot: "moderation",
    label: "Ranks",
    component: RanksTab,
    roles: ["admin"],
  },
] as const;

export default defineClientPlugin({ manifest, tabs });
