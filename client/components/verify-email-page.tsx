"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiState, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/api";

export function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [result, setResult] = useState<{ error?: string; verified?: boolean }>({});

  useEffect(() => {
    if (!token) return;
    let active = true;
    apiFetch("/verify-email", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ token }),
    })
      .then(() => { if (active) setResult({ verified: true }); })
      .catch((requestError: unknown) => {
        if (active) setResult({ error: requestError instanceof Error ? requestError.message : "Could not verify your email." });
      });
    return () => { active = false; };
  }, [token]);

  return (
    <main className="page form-page">
      <PageHeader title="Verify email" />
      {!token ? (
        <div className="state-panel state-error">This verification link is missing its token.</div>
      ) : (
        <ApiState loading={!result.error && !result.verified} error={result.error}>
          <div className="state-panel state-panel-centered">Email verified. <Link className="primary-button compact-button" href="/login">Log in</Link></div>
        </ApiState>
      )}
    </main>
  );
}
