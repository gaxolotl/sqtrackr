"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export function useModerationQueue(enabled: boolean) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function refresh() {
      if (document.hidden) return;
      try {
        const result = await apiFetch<{
          pendingSubmissions?: number;
          openReports?: number;
        }>("/moderation/queue-counts");
        if (!active) return;
        const next =
          (Number(result?.pendingSubmissions) || 0) +
          (Number(result?.openReports) || 0);
        setTotal(Number.isFinite(next) ? Math.max(0, next) : 0);
      } catch {
        // Queue polling must never disrupt the surrounding application shell.
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden) void refresh();
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 60_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled]);

  return enabled ? total : 0;
}
