"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { AuditLogPage } from "@/components/audit-log-page";
import { CheatLogTab } from "@/components/cheat-log-tab";
import { MembersTab } from "@/components/members-tab";
import { ReportsPage } from "@/components/reports-page";
import { StatsPage } from "@/components/stats-page";
import { UploadModerationPage } from "@/components/upload-moderation-page";
import { PluginTab, usePluginHost } from "@/components/plugin-host";
import { PageHeader, SignInRequired } from "@/components/ui";
import { canModerate } from "@/lib/api";

export type ModerationTab = "uploads" | "reports" | "cheat" | "members" | "stats" | "audit";

export function ModerationPage({
  initialTab = "uploads",
}: {
  initialTab?: ModerationTab;
}) {
  const { session } = useAuth();
  const pluginHost = usePluginHost();
  const isAdmin = session?.role === "admin";
  const allowed = canModerate(session?.role);
  const pluginTabs = pluginHost.tabs("moderation");
  const defaultTab: ModerationTab =
    initialTab === "stats" && !isAdmin
      ? "uploads"
      : initialTab === "members" && !isAdmin
        ? "uploads"
        : initialTab;
  const [tab, setTab] = useState<string>(defaultTab);
  const tabElements = useRef(new Map<string, HTMLButtonElement>());

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  const tabs: Array<{ id: string; label: string; adminOnly?: boolean }> = [
    { id: "uploads", label: "Uploads" },
    { id: "reports", label: "Reports" },
    { id: "cheat", label: "Cheat log" },
    { id: "members", label: "Members", adminOnly: true },
    { id: "stats", label: "Stats", adminOnly: true },
    { id: "audit", label: "Audit log" },
    ...pluginTabs.map((entry) => ({
      id: `plugin:${entry.pluginId}`,
      label: entry.contribution.label,
      adminOnly: entry.contribution.roles?.length
        ? !entry.contribution.roles.some((role) => role === "staff")
        : false,
    })),
  ];
  const visibleTabs = tabs.filter((entry) => !entry.adminOnly || isAdmin);
  const activeTab = visibleTabs.some((entry) => entry.id === tab)
    ? tab
    : "uploads";

  function selectTab(next: string) {
    setTab(next);
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const order = visibleTabs.map((entry) => entry.id);
    const index = order.indexOf(current);
    let next: string;
    if (event.key === "Home") next = order[0];
    else if (event.key === "End") next = order[order.length - 1];
    else {
      const delta = event.key === "ArrowRight" ? 1 : -1;
      next = order[(index + delta + order.length) % order.length];
    }
    selectTab(next);
    tabElements.current.get(next)?.focus();
  }

  const activePluginTab = activeTab.startsWith("plugin:")
    ? pluginTabs.find((entry) => `plugin:${entry.pluginId}` === activeTab)
    : undefined;

  return (
    <main className="page list-page">
      <PageHeader
        title="Moderation"
        info="Review uploads and reports, manage members, and inspect tracker stats."
      />
      {!allowed ? (
        <div className="state-panel state-error">
          Staff access is required.
        </div>
      ) : (
        <>
          <div className="tab-bar" role="tablist" aria-label="Moderation">
            {visibleTabs.map((entry) => (
              <button
                key={entry.id}
                ref={(element) => {
                  if (element) tabElements.current.set(entry.id, element);
                  else tabElements.current.delete(entry.id);
                }}
                id={`moderation-tab-${entry.id}`}
                type="button"
                role="tab"
                aria-controls="moderation-panel"
                aria-selected={activeTab === entry.id}
                tabIndex={activeTab === entry.id ? 0 : -1}
                onClick={() => selectTab(entry.id)}
                onKeyDown={(event) => handleTabKey(event, entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <section
            id="moderation-panel"
            role="tabpanel"
            aria-labelledby={`moderation-tab-${activeTab}`}
          >
            {activeTab === "uploads" ? <UploadModerationPage embedded /> : null}
            {activeTab === "reports" ? <ReportsPage embedded /> : null}
            {activeTab === "cheat" ? <CheatLogTab embedded /> : null}
            {activeTab === "members" ? <MembersTab embedded /> : null}
            {activeTab === "stats" ? <StatsPage embedded /> : null}
            {activeTab === "audit" ? <AuditLogPage embedded /> : null}
            {activePluginTab ? (
              <PluginTab tab={activePluginTab} context={{}} />
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
