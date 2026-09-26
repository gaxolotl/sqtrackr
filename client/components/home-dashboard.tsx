"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, Search, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { PluginSlot } from "@/components/plugin-host";
import { ApiState } from "@/components/ui";
import { TorrentTable } from "@/components/torrent-table";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { DashboardData, Torrent } from "@/lib/types";

export function HomeDashboard({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const { session } = useAuth();
  const { t } = useI18n();
  const { config } = useTrackerConfig();
  const { data: torrents, error, loading } = useApiData<Torrent[]>(session ? "/torrent/latest?count=25" : null);
  const { data: popular, error: popularError, loading: popularLoading } = useApiData<{ torrents?: Torrent[] }>(session ? "/torrent/search?sort=downloads:desc&page=0" : null);
  const { data: dashboard, error: dashboardError, loading: dashboardLoading } = useApiData<DashboardData>(session ? "/account/dashboard" : null);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  if (!session) {
    return (
      <main className="splash-page">
        <div className="splash-content">
          <span className="splash-mark" aria-hidden="true">■</span>
          <h1>{config.siteName}</h1>
          <p>{config.siteDescription || t("tagline")}</p>
          <div className="splash-actions">
            <Link className="primary-button button-link" href="/login"><LogIn aria-hidden="true" /> {t("login")}</Link>
            <Link className="secondary-button button-link" href="/register"><UserPlus aria-hidden="true" /> {t("register")}</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page home-page">
      <div className="home-heading-row"><h1>{t("home")}</h1></div>

      <PluginSlot name="home.afterHeader" context={{}} />

      <form className="hero-search" id="search" onSubmit={submitSearch}>
        <div className="hero-search-field">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchTracker")}
            aria-label={t("searchTracker")}
          />
        </div>
        <button className="primary-button" type="submit">{t("search")}</button>
      </form>

      <section className="content-section" id="my-stats">
        <div className="section-heading-row">
          <h2 className="section-title">My stats</h2>
        </div>
        <ApiState loading={dashboardLoading} error={dashboardError} empty={!dashboardLoading && !dashboardError && !dashboard}>
          {dashboard ? (
            <>
              <p>
                Ratio <strong>{Number(dashboard.ratio ?? 0).toFixed(2)}</strong>
                {" · "}Uploaded <strong>{formatBytes(dashboard.up ?? 0)}</strong>
                {" · "}Downloaded <strong>{formatBytes(dashboard.down ?? 0)}</strong>
                {" · "}Snatches <strong>{dashboard.snatches ?? 0}</strong>
                {" · "}Hit&apos;n&apos;runs <strong>{dashboard.hitnruns ?? 0}</strong>
                {" · "}Bonus points <strong>{dashboard.bp ?? 0}</strong>
              </p>
              <p>
                Seeding <strong>{dashboard.seeding.length}</strong>
                {" · "}Leeching <strong>{dashboard.leeching.length}</strong>
              </p>
              {dashboard.warnings.length ? (
                <>
                  <div className="section-heading-row">
                    <h2 className="section-title">Seed to avoid a hit&apos;n&apos;run</h2>
                  </div>
                  <div className="feed-list">
                    {dashboard.warnings.map((snatch) => (
                      <Link className="feed-card" href={`/torrent/${snatch.infoHash}`} key={snatch.infoHash}>
                        <div>
                          <h2>{snatch.name}</h2>
                          <p>Grace ends {formatDateTime(snatch.graceEndsAt)}</p>
                        </div>
                        <span className="status-pill">Warning</span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
              {dashboard.currentHnrs.length ? (
                <>
                  <div className="section-heading-row">
                    <h2 className="section-title">Hit&apos;n&apos;runs</h2>
                  </div>
                  <div className="feed-list">
                    {dashboard.currentHnrs.map((snatch) => (
                      <Link className="feed-card" href={`/torrent/${snatch.infoHash}`} key={snatch.infoHash}>
                        <div>
                          <h2>{snatch.name}</h2>
                          <p>Snatched {formatDateTime(snatch.snatchedAt)}</p>
                        </div>
                        <span className="status-pill">Hit&apos;n&apos;run</span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
              {dashboard.leeching.length ? (
                <>
                  <div className="section-heading-row">
                    <h2 className="section-title">Currently leeching</h2>
                  </div>
                  <div className="feed-list">
                    {dashboard.leeching.slice(0, 10).map((torrent) => (
                      <Link className="feed-card" href={`/torrent/${torrent.infoHash}`} key={torrent.infoHash}>
                        <div>
                          <h2>{torrent.name}</h2>
                        </div>
                        <span className="status-pill">Leeching</span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </ApiState>
      </section>
      <section className="content-section" id="browse">
        <div className="section-heading-row">
          <h2 className="section-title">{t("latestTorrents")}</h2>
        </div>
        <ApiState loading={loading} error={error} empty={!loading && !error && !torrents?.length}>
          <TorrentTable torrents={torrents ?? []} />
        </ApiState>
      </section>
      <section className="content-section home-secondary-section">
        <div className="section-heading-row">
          <h2 className="section-title">{t("popularTorrents")}</h2>
        </div>
        <ApiState loading={popularLoading} error={popularError} empty={!popularLoading && !popularError && !popular?.torrents?.length}>
          <TorrentTable torrents={popular?.torrents ?? []} />
        </ApiState>
      </section>
      <PluginSlot name="home.afterContent" context={{}} />
    </main>
  );
}
