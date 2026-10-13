"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export function usePollCount(
  enabled: boolean,
  options: { endpoint: string; event: string; intervalMs?: number },
) {
  const [count, setCount] = useState(0);
  const { endpoint, event, intervalMs = 30_000 } = options;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let inFlight = false;

    async function refresh() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const result = await apiFetch<{ count?: number }>(endpoint);
        if (!active) return;
        const nextCount = Number(result?.count);
        setCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
      } catch {
        // Polling must never disrupt the surrounding shell.
      } finally {
        inFlight = false;
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden) void refresh();
    }

    function handleUpdated() {
      void refresh();
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(event, handleUpdated);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(event, handleUpdated);
    };
  }, [enabled, endpoint, event, intervalMs]);

  return enabled ? count : 0;
}
