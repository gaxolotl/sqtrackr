"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { ActionMessage, Field, PageHeader, SignInRequired } from "@/components/ui";
import { AttachmentPicker } from "@/components/attachment-picker";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch } from "@/lib/api";

export function RequestEditor() {
  const { session } = useAuth(); const { config } = useTrackerConfig(); const router = useRouter(); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false); const bodyBox = useRef<HTMLTextAreaElement>(null);
  function insertAttachment(markdown: string) { const box = bodyBox.current; if (!box) return; const start = box.selectionStart ?? box.value.length; const end = box.selectionEnd ?? start; box.value = `${box.value.slice(0, start)}${markdown}${box.value.slice(end)}`; box.focus(); }
  if (!session) return <main className="page"><SignInRequired /></main>;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSubmitting(true); setError(""); const form = new FormData(event.currentTarget); try { const result = await apiFetch<{ index: number }>("/requests/new", { method: "POST", body: JSON.stringify({ title: form.get("title"), body: form.get("body"), bounty: Number(form.get("bounty")) || 0 }) }); router.push(`/requests/${result.index}`); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not create request."); } finally { setSubmitting(false); } }
  return <main className="page form-page"><PageHeader title="New request" /><form className="stack-form wide-form" onSubmit={submit}><Field label="Title"><input name="title" required maxLength={config.contentLimits.title} /></Field><Field label="Details"><textarea ref={bodyBox} name="body" rows={10} required maxLength={config.contentLimits.body} placeholder="Describe exactly what you are looking for" /><AttachmentPicker onInsert={insertAttachment} /></Field><Field label="Bounty (bonus points, 0 for none)"><input name="bounty" type="number" min={0} step={1} defaultValue={0} /></Field><ActionMessage error={error} /><div className="form-actions"><button className="primary-button" disabled={submitting}>{submitting ? "Posting…" : "Post request"}</button></div></form></main>;
}
