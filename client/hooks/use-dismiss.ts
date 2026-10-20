"use client";

import { RefObject, useEffect } from "react";

// Closes a disclosure popup on an outside pointer press or Escape. The
// trigger and popup should share the ref so clicking the trigger still
// reaches its own toggle handler.
export function useDismiss(
  open: boolean,
  onDismiss: () => void,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onDismiss, ref]);
}
