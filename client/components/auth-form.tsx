"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { ActionMessage, Field } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, session } = useAuth();
  const { t } = useI18n();
  const { config } = useTrackerConfig();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);

  useEffect(() => {
    if (session) router.replace("/");
  }, [router, session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        await login({
          username: String(form.get("username")),
          password: String(form.get("password")),
          totp: String(form.get("totp") || "") || undefined,
        });
      } else {
        await register({
          username: String(form.get("username")),
          email: String(form.get("email")),
          password: String(form.get("password")),
          invite: String(form.get("invite") || "") || undefined,
        });
      }
      router.replace("/");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to authenticate.";
      if (message.includes("One-time code required")) setTotpRequired(true);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (session) return null;

  if (mode === "register" && config.allowRegister === "closed") {
    return (
      <main className="auth-page page">
        <section className="auth-card">
          <h1>{t("registrationClosedTitle")}</h1>
          <p className="auth-intro">{t("registrationClosed")}</p>
          <p className="auth-switch">
            <Link href="/login">{t("login")}</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page page">
      <section className="auth-card">
        <h1>{mode === "login" ? t("welcomeBack") : t("createAccount")}</h1>
        <p className="auth-intro">
          {mode === "login" ? t("loginIntro") : t("registerIntro")}
        </p>
        {mode === "login" && searchParams.get("expired") === "1" ? (
          <p className="auth-intro">{t("sessionExpired")}</p>
        ) : null}
        <form className="stack-form" onSubmit={submit}>
          <Field label={t("username")}>
            <input
              name="username"
              maxLength={32}
              required
              autoComplete="username"
            />
          </Field>
          {mode === "register" ? (
            <Field label={t("email")}>
              <input
                name="email"
                type="email"
                maxLength={320}
                required
                autoComplete="email"
              />
            </Field>
          ) : null}
          <Field label={t("password")}>
            <input
              name="password"
              type="password"
              maxLength={128}
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </Field>
          {totpRequired ? (
            <Field label={t("oneTimeCode")}>
              <input
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                required
              />
            </Field>
          ) : null}
          {mode === "register" && config.allowRegister === "invite" ? (
            <Field label={t("inviteToken")} hint={t("inviteRequiredHint")}>
              <input
                name="invite"
                maxLength={4096}
                required
                defaultValue={searchParams.get("token") ?? ""}
              />
            </Field>
          ) : null}
          <ActionMessage error={error} />
          <button
            className="primary-button full-button"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? t("pleaseWait")
              : mode === "login"
                ? t("login")
                : t("register")}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "login" ? (
            <>
              {t("newHere")} <Link href="/register">{t("createAccount")}</Link>
            </>
          ) : (
            <>
              {t("alreadyAccount")} <Link href="/login">{t("login")}</Link>
            </>
          )}
        </p>
        {mode === "login" ? (
          <p className="auth-switch recovery-link">
            <Link href="/reset-password/initiate">{t("forgotPassword")}</Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
