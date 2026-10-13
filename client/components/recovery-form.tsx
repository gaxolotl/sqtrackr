"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ActionMessage, Field, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/api";

export function RecoveryForm({ stage }: { stage: "initiate" | "finalise" }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError(""); setMessage("");
    try {
      if (stage === "initiate") await apiFetch("/reset-password/initiate", { method: "POST", auth: false, body: JSON.stringify({ email: form.get("email") }) });
      else {
        await apiFetch("/reset-password/finalise", { method: "POST", auth: false, body: JSON.stringify({ email: form.get("email"), newPassword: form.get("newPassword"), token: searchParams.get("token") }) });
        // Drop the one-time token from history so it is not retained in the URL.
        router.replace("/reset-password/finalise");
      }
      setMessage(stage === "initiate" ? "If that account exists, a reset link has been sent." : "Password updated. You can now log in.");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not reset the password."); }
  }

  return <main className="page form-page"><PageHeader title={stage === "initiate" ? "Reset password" : "Choose a new password"} /><form className="stack-form auth-card recovery-card" onSubmit={submit}><Field label="Email"><input type="email" name="email" maxLength={320} required /></Field>{stage === "finalise" ? <Field label="New password"><input type="password" name="newPassword" autoComplete="new-password" maxLength={128} required /></Field> : null}<ActionMessage message={message} error={error} /><button className="primary-button full-button" type="submit">{stage === "initiate" ? "Send reset link" : "Update password"}</button><p className="auth-switch"><Link href="/login">Back to login</Link></p></form></main>;
}
