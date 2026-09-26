"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { ActionMessage, Field } from "@/components/ui";
import { AttachmentPicker } from "@/components/attachment-picker";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CommentRecord } from "@/lib/types";

export function CommentThread({ comments = [], endpoint, disabled = false, onPosted }: { comments?: CommentRecord[]; endpoint: string; disabled?: boolean; onPosted?: () => void }) {
  const { config } = useTrackerConfig();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const commentBox = useRef<HTMLTextAreaElement>(null);

  function insertAttachment(markdown: string) {
    const box = commentBox.current;
    if (!box) return;
    const start = box.selectionStart ?? box.value.length;
    const end = box.selectionEnd ?? start;
    box.value = `${box.value.slice(0, start)}${markdown}${box.value.slice(end)}`;
    box.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ comment: data.get("comment") }) });
      form.reset();
      onPosted?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not post the comment.");
    } finally { setSubmitting(false); }
  }

  return (
    <section className="content-section comments-section">
      <h2 className="section-title">Comments</h2>
      <form className="comment-form" onSubmit={submit}>
        <Field label="Post a comment"><textarea ref={commentBox} name="comment" rows={5} required maxLength={config.contentLimits.comment} disabled={disabled} placeholder={disabled ? "Comments are disabled." : "Write a comment…"} /></Field>
        <ActionMessage error={error} />
        <div className="form-actions"><AttachmentPicker onInsert={insertAttachment} /><button className="primary-button" type="submit" disabled={disabled || submitting}>{submitting ? "Posting…" : "Post"}</button></div>
      </form>
      {comments.length ? <div className="comments-list rendered-comments">{comments.map((comment) => <article className="comment" key={comment._id}><div className="comment-meta"><p><MessageSquare aria-hidden="true" /> Comment by <Link href={`/user/${comment.user?.username ?? "unknown"}`}>{comment.user?.username ?? "Unknown user"}</Link></p><time>{formatDateTime(comment.created)}</time></div><p className="comment-body">{comment.comment}</p></article>)}</div> : null}
    </section>
  );
}
