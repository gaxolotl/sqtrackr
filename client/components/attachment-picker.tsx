"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch } from "@/lib/api";

const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.txt,.md";

export function AttachmentPicker({
  onInsert,
}: {
  onInsert: (markdown: string) => void;
}) {
  const { config } = useTrackerConfig();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  if (!config.attachmentsEnabled) return null;

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const result = await apiFetch<{
        url: string;
        filename: string;
      }>("/attachments", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          data,
        }),
      });
      onInsert(`[${result.filename}](${result.url})`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not upload file.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <span className="attachment-picker">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={upload}
        aria-label="Upload attachment"
      />
      <button
        className="secondary-button compact-button"
        type="button"
        disabled={uploading}
        onClick={() => input.current?.click()}
      >
        <Paperclip aria-hidden="true" />{" "}
        {uploading ? "Uploading…" : "Attach file"}
      </button>
      {error ? <span className="attachment-error">{error}</span> : null}
    </span>
  );
}
