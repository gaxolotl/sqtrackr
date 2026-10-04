"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export function useUnreadNotifications(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function refresh() {
      if (document.hidden) return;
      try {
        const result = await apiFetch<{ count?: number }>(
          "/notifications/unread-count",
        );
        if (!active) return;
        const nextCount = Number(result?.count);
        setCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
      } catch {
        // Notification polling must never disrupt the surrounding shell.
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden) void refresh();
    }

    function handleNotificationsUpdated() {
      void refresh();
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 30_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(
      "sq:notifications-updated",
      handleNotificationsUpdated,
    );

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        "sq:notifications-updated",
        handleNotificationsUpdated,
      );
    };
  }, [enabled]);

  return enabled ? count : 0;
}
