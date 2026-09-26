"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { AttachmentPicker } from "@/components/attachment-picker";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch } from "@/lib/api";
import type { Announcement } from "@/lib/types";

export function AnnouncementEditor({ slug }: { slug?: string }) {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const router = useRouter();
  const { data, error: loadError, loading } = useApiData<Announcement>(
    session && slug ? `/announcements/${encodeURIComponent(slug)}` : null,
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bodyBox = useRef<HTMLTextAreaElement>(null);

  function insertAttachment(markdown: string) {
    const box = bodyBox.current;
    if (!box) return;
    const start = box.selectionStart ?? box.value.length;
    const end = box.selectionEnd ?? start;
    box.value = `${box.value.slice(0, start)}${markdown}${box.value.slice(end)}`;
    box.focus();
  }

  if (!session) {
    return <main className="page"><SignInRequired /></main>;
  }

  if (session.role !== "admin") {
    return <main className="page"><div className="state-panel state-error">Only administrators can publish announcements.</div></main>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = JSON.stringify({
      title: form.get("title"),
      body: form.get("body"),
      pinned: form.get("pinned") === "on",
      allowComments: form.get("allowComments") === "on",
    });
    try {
      const nextSlug = await apiFetch<string>(
        data ? `/announcements/edit/${data._id}` : "/announcements/new",
        { method: "POST", body },
      );
      router.push(`/announcements/${nextSlug}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `Could not ${data ? "update" : "create"} announcement.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const form = (
    <form className="stack-form wide-form" key={data?._id ?? "new"} onSubmit={submit}>
      <Field label="Title"><input name="title" required maxLength={config.contentLimits.title} defaultValue={data?.title} /></Field>
      <Field label="Body">
        <textarea ref={bodyBox} name="body" rows={10} required maxLength={config.contentLimits.body} placeholder="Markdown supported" defaultValue={data?.body} />
        <AttachmentPicker onInsert={insertAttachment} />
      </Field>
      <div className="inline-checks">
        <label className="check-field"><input type="checkbox" name="pinned" defaultChecked={data?.pinned} /> Pin announcement</label>
        <label className="check-field"><input type="checkbox" name="allowComments" defaultChecked={data ? data.allowComments : true} /> Allow comments</label>
      </div>
      <ActionMessage error={error} />
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : data ? "Save changes" : "Publish"}
        </button>
      </div>
    </form>
  );

  return (
    <main className="page form-page">
      <PageHeader title={data ? "Edit announcement" : "New announcement"} />
      {slug ? <ApiState loading={loading} error={loadError} empty={!data}>{data ? form : null}</ApiState> : form}
    </main>
  );
}
