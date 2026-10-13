"use client";

import { usePollCount } from "@/hooks/use-poll-count";

export function useUnreadNotifications(enabled: boolean) {
  return usePollCount(enabled, {
    endpoint: "/notifications/unread-count",
    event: "sq:notifications-updated",
    intervalMs: 30_000,
  });
}
