"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-context";
import { useApiData } from "@/hooks/use-api-data";
import { useDismiss } from "@/hooks/use-dismiss";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { NotificationPage } from "@/lib/types";

// Notification links are stored server-side, but only same-site relative
// paths are safe to hand to next/link. Anything else (absolute URLs,
// protocol-relative "//host" paths) falls back to the notifications page
// to block open-redirect phishing.
function safeNotificationLink(link: unknown) {
  return typeof link === "string" &&
    link.startsWith("/") &&
    !link.startsWith("//")
    ? link
    : "/notifications";
}

export function NotificationsBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const unread = useUnreadNotifications(true);
  const recent = useApiData<NotificationPage>(
    open ? "/notifications/page/0" : null,
  );

  useDismiss(open, close, menu);

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
    <div className="notifications-menu" ref={menu}>
      <button
        className="theme-button notifications-trigger"
        type="button"
        title={t("notifications")}
        aria-label={
          unread > 0
            ? `${t("notifications")}: ${unread} unread`
            : t("notifications")
        }
        aria-expanded={open}
        aria-controls="notifications-menu"
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
        <div
          className="notifications-popup"
          id="notifications-menu"
          role="region"
          aria-label={t("notifications")}
        >
          {recent.loading ? (
            <p className="notifications-empty">Loading…</p>
          ) : items.length ? (
            items.map((item) => (
              <Link
                className="notification-row"
                href={safeNotificationLink(item.link)}
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
