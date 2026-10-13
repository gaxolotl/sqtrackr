"use client";

import { usePollCount } from "@/hooks/use-poll-count";

export function useUnreadMessages(enabled: boolean) {
  return usePollCount(enabled, {
    endpoint: "/messages/unread-count",
    event: "sq:messages-updated",
    intervalMs: 30_000,
  });
}
