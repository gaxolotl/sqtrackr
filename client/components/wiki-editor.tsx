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
import { LinkPicker } from "@/components/link-picker";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch, ApiError } from "@/lib/api";
import type { WikiResponse } from "@/lib/types";

export function WikiEditor({
  slug,
  defaultSlug,
}: {
  slug?: string | null;
  defaultSlug?: string;
}) {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const router = useRouter();
  const requestSlug = slug ? (slug === "/" ? "/wiki" : `/wiki${slug}`) : null;
  const { data, error: loadError, loading } = useApiData<WikiResponse>(
    session && requestSlug ? requestSlug : null,
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
    return <main className="page"><div className="state-panel state-error">Only administrators can edit the wiki.</div></main>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const rawSlug = String(form.get("slug") ?? "");
    const normalizedSlug =
      slug === "/" || rawSlug === "" || rawSlug === "/"
        ? "/"
        : `/${rawSlug.replace(/^\/+|\/+$/g, "")}`;
    const payload = {
      slug: normalizedSlug,
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      public: form.get("public") === "on",
    };
    try {
      if (slug) {
        if (!data?.page?._id) throw new Error("Wiki page could not be loaded.");
        await apiFetch(`/wiki/update/${data.page._id}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        router.push(`/wiki${normalizedSlug}`);
      } else {
        const createdSlug = await apiFetch<string>("/wiki/new", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        router.push(`/wiki${createdSlug}`);
      }
    } catch (requestError) {
      if (
        creatingRoot &&
        requestError instanceof ApiError &&
        requestError.status === 409
      ) {
        router.replace(`/wiki/new?slug=${encodeURIComponent("/")}`);
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : `Could not ${slug ? "update" : "create"} the wiki page.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const creatingRoot = !slug && defaultSlug === "/";

  const form = (
    <form className="stack-form wide-form" key={data?.page?._id ?? "new"} onSubmit={submit}>
      <Field
        label="Path"
        hint={
          creatingRoot
            ? "/ is the wiki's main page, shown at /wiki."
            : undefined
        }
      >
        {slug === "/" || creatingRoot ? (
          <input name="slug" value="/" readOnly />
        ) : (
          <input
            name="slug"
            required
            maxLength={200}
            defaultValue={slug ? data?.page?.slug.replace(/^\/+/, "") : ""}
            placeholder="rules or faq/uploading"
          />
        )}
      </Field>
      <Field label="Title"><input name="title" required maxLength={config.contentLimits.title} defaultValue={data?.page?.title} /></Field>
      <Field label="Body"><textarea ref={bodyBox} name="body" rows={12} required maxLength={config.contentLimits.body} placeholder="Markdown supported" defaultValue={data?.page?.body} /><LinkPicker onInsert={insertAttachment} /></Field>
      <label className="check-field"><input type="checkbox" name="public" defaultChecked={slug ? Boolean(data?.page?.public) : true} /> Visible to unregistered visitors when public viewing is enabled</label>
      <ActionMessage error={error} />
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : slug ? "Save changes" : "Create page"}
        </button>
      </div>
    </form>
  );

  return (
    <main className="page form-page">
      <PageHeader title={slug ? "Edit wiki page" : "New wiki page"} />
      {slug ? (
        <ApiState loading={loading} error={loadError} empty={!data?.page}>
          {data?.page ? form : null}
        </ApiState>
      ) : form}
    </main>
  );
}
