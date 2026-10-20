"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { TorrentTable } from "@/components/torrent-table";
import { PluginTab, usePluginHost } from "@/components/plugin-host";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import type { Torrent } from "@/lib/types";

function BookmarksContent() {
  const { session } = useAuth();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const pluginHost = usePluginHost();
  const { data, error, loading } = useApiData<{ torrents?: Torrent[] } | Torrent[]>(session ? "/account/bookmarks" : null);
  const torrents = Array.isArray(data) ? data : data?.torrents ?? [];
  const pluginTabs = pluginHost.tabs("bookmarks");
  const requestedTab = searchParams.get("tab");
  const defaultTab = pluginTabs.some((tab) => tab.pluginId === requestedTab)
    ? `plugin:${requestedTab}`
    : "bookmarks";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const currentTab = activeTab.startsWith("plugin:")
    && pluginTabs.some((tab) => `plugin:${tab.pluginId}` === activeTab)
    ? activeTab
    : "bookmarks";

  if (!session) return <main className="page"><SignInRequired /></main>;

  if (!pluginTabs.length) {
    return <main className="page"><PageHeader title={t("bookmarks")} /><ApiState loading={loading} error={error} empty={!torrents.length}><TorrentTable torrents={torrents} /></ApiState></main>;
  }

  return (
    <main className="page">
      <PageHeader title={t("bookmarks")} />
      <div className="tab-bar" role="tablist" aria-label="Bookmarks">
        <button
          type="button"
          role="tab"
          aria-selected={currentTab === "bookmarks"}
          onClick={() => setActiveTab("bookmarks")}
        >
          Bookmarks
        </button>
        {pluginTabs.map((tab) => (
          <button
            key={tab.pluginId}
            type="button"
            role="tab"
            aria-selected={currentTab === `plugin:${tab.pluginId}`}
            onClick={() => setActiveTab(`plugin:${tab.pluginId}`)}
          >
            {tab.contribution.label}
          </button>
        ))}
      </div>
      <section role="tabpanel">
        {currentTab === "bookmarks" ? (
          <ApiState loading={loading} error={error} empty={!torrents.length}>
            <TorrentTable torrents={torrents} />
          </ApiState>
        ) : (
          pluginTabs
            .filter((tab) => `plugin:${tab.pluginId}` === currentTab)
            .map((tab) => (
              <PluginTab key={tab.pluginId} tab={tab} context={{}} />
            ))
        )}
      </section>
    </main>
  );
}

export function BookmarksPage() {
  return (
    <Suspense>
      <BookmarksContent />
    </Suspense>
  );
}
