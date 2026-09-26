"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

const isSafeUrl = (value: string) =>
  /^https?:\/\//i.test(value) || value.startsWith("/");

export function LinkPicker({
  onInsert,
}: {
  onInsert: (markdown: string) => void;
}) {
  const [error, setError] = useState("");

  function promptForLink() {
    setError("");
    const url = window.prompt("URL of the image or file:", "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (!isSafeUrl(trimmed)) {
      setError("URL must start with http(s):// or /.");
      return;
    }
    const label =
      window.prompt("Link text:", trimmed.split("/").pop() || trimmed) ??
      trimmed;
    const text = label.trim() || trimmed;
    onInsert(
      IMAGE_PATTERN.test(trimmed)
        ? `![${text}](${trimmed})`
        : `[${text}](${trimmed})`,
    );
  }

  return (
    <span className="attachment-picker">
      <button
        className="secondary-button compact-button"
        type="button"
        onClick={promptForLink}
      >
        <Link2 aria-hidden="true" /> Add link
      </button>
      {error ? <span className="attachment-error">{error}</span> : null}
    </span>
  );
}
