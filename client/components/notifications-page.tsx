"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { Pager } from "@/components/pager";
import {
  ActionMessage,
  ApiState,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
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

export function NotificationsPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [page, setPage] = useState(0);
  const notifications = useApiData<NotificationPage>(
    session ? `/notifications/page/${page}` : null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  async function markAllRead() {
    setMessage("");
    setError("");
    try {
      await apiFetch("/notifications/read", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.dispatchEvent(new Event("sq:notifications-updated"));
      notifications.reload();
      setMessage("All notifications marked as read.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not mark notifications as read.",
      );
    }
  }

  function markOne(id: string) {
    void apiFetch("/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids: [id] }),
    })
      .then(() => {
        window.dispatchEvent(new Event("sq:notifications-updated"));
      })
      .catch(() => {
        // Navigation proceeds regardless; the badge refreshes on next poll.
      });
  }

  return (
    <main className="page list-page">
      <PageHeader
        title={t("notifications")}
        actions={
          <button
            className="secondary-button"
            type="button"
            onClick={markAllRead}
          >
            Mark all read
          </button>
        }
      />
      <ActionMessage message={message} error={error} />
      <ApiState
        loading={notifications.loading}
        error={notifications.error}
        empty={!notifications.data?.items.length}
      >
        <div className="feed-list">
          {notifications.data?.items.map((item) => (
            <Link
              className="feed-card"
              href={safeNotificationLink(item.link)}
              key={item._id}
              onClick={() => markOne(item._id)}
            >
              <div>
                <h2>{item.title}</h2>
                <p>{formatDateTime(item.created)}</p>
              </div>
              <span className="status-pill">
                {item.read ? "Read" : "New"}
              </span>
            </Link>
          ))}
        </div>
      </ApiState>
      {notifications.data ? (
        <Pager
          page={notifications.data.page}
          pageSize={notifications.data.pageSize}
          total={notifications.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </main>
  );
}
