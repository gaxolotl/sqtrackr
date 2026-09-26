"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-context";
import { useApiData } from "@/hooks/use-api-data";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { NotificationPage } from "@/lib/types";

export function NotificationsBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotifications(true);
  const recent = useApiData<NotificationPage>(
    open ? "/notifications/page/0" : null,
  );

  async function markAllRead() {
    try {
      await apiFetch("/notifications/read", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.dispatchEvent(new Event("sq:notifications-updated"));
    } catch {
      // The badge refreshes on the next poll.
    }
  }

  function toggle() {
    const closing = open;
    setOpen(!open);
    if (closing) {
      recent.reload();
      void markAllRead();
    }
  }

  const items = (recent.data?.items ?? []).slice(0, 8);

  return (
    <div className="notifications-menu">
      <button
        className="theme-button notifications-trigger"
        type="button"
        title={t("notifications")}
        aria-label={t("notifications")}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell aria-hidden="true" />
        {unread > 0 ? (
          <span className="notifications-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="notifications-popup" role="menu">
          {recent.loading ? (
            <p className="notifications-empty">Loading…</p>
          ) : items.length ? (
            items.map((item) => (
              <Link
                className="notification-row"
                href={item.link ?? "/notifications"}
                key={item._id}
                onClick={() => setOpen(false)}
              >
                <span className="notification-title">{item.title}</span>
                <small>{formatDateTime(item.created)}</small>
              </Link>
            ))
          ) : (
            <p className="notifications-empty">No notifications.</p>
          )}
          <Link
            className="notification-view-all"
            href="/notifications"
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
