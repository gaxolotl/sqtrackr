"use client";

import { Copy, ExternalLink, RefreshCw, Rss, ShieldAlert } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-context";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { FeatureDisabled } from "@/components/feature-disabled";
import { apiFetch, apiOrigin } from "@/lib/api";

type RssAccess = { token: string | null };

const feedReaders = [
  { name: "NewsBlur", url: "https://www.newsblur.com/" },
  { name: "FreshRSS", url: "https://freshrss.org/" },
  { name: "Miniflux", url: "https://miniflux.app/" },
];

export function RssPage() {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const access = useApiData<RssAccess>(session ? "/account/rss-token" : null);
  const totpStatus = useApiData<{ enabled: boolean }>(
    session ? "/account/totp/status" : null,
  );
  const totpEnabled = totpStatus.data?.enabled ?? false;
  const feedUrl = (() => {
    if (!access.data?.token) return "";
    const parameters = new URLSearchParams({ token: access.data.token });
    if (query) parameters.set("query", query);
    return `${apiOrigin()}/rss?${parameters}`;
  })();

  if (!session)
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );

  if (!config.rssEnabled) {
    return <FeatureDisabled name="RSS" />;
  }

  async function copyFeed(reader?: string) {
    if (!feedUrl) return;
    setError("");
    setMessage("");
    try {
      await navigator.clipboard.writeText(feedUrl);
      setMessage(
        reader
          ? `Feed URL copied. Paste it into ${reader}.`
          : "Feed URL copied.",
      );
    } catch {
      setError("Could not copy the feed URL. Copy it from the field above.");
    }
  }

  async function regenerateToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !window.confirm(
        "Regenerate your RSS token? Existing feed URLs will stop working.",
      )
    )
      return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const totp = String(data.get("totp") ?? "");
    if (!password) return;
    setRegenerating(true);
    setError("");
    setMessage("");
    try {
      const result = await apiFetch<RssAccess>(
        "/account/rss-token/regenerate",
        {
          method: "POST",
          body: JSON.stringify({ password, ...(totp ? { totp } : {}) }),
        },
      );
      access.setData(result);
      setMessage(
        "RSS token regenerated. Update your feed reader with the new URL.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not regenerate the RSS token.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <main className="page form-page">
      <PageHeader title="RSS" />
      <section className="rss-card">
        <Rss aria-hidden="true" />
        <div>
          <h2>Your tracker feed</h2>
          <p>
            This private URL includes an access token. Add it directly to your
            feed reader and do not share it.
          </p>
        </div>
      </section>
      <ApiState
        loading={access.loading}
        error={access.error}
        empty={!access.data}
      >
        <div className="stack-form wide-form">
          <Field label="Optional search filter">
            <input
              value={query}
              maxLength={200}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name or description"
              aria-label="Optional search filter"
            />
          </Field>
          <Field label="Private feed URL">
            <div className="copy-field">
              <input readOnly value={feedUrl} aria-label="Private feed URL" />
              <button
                className="secondary-button"
                type="button"
                onClick={() => void copyFeed()}
              >
                <Copy aria-hidden="true" /> Copy
              </button>
            </div>
          </Field>
          {access.data && !access.data.token && (
            <p>
              Your RSS token is stored securely and cannot be shown again.
              Regenerate it below to get a new feed URL.
            </p>
          )}
          <div className="rss-primary-actions">
            <a
              className="primary-button button-link"
              href={feedUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink aria-hidden="true" /> Open feed
            </a>
          </div>
          {config.rssReadersEnabled && (
            <section className="rss-reader-section">
              <div>
                <h2>Add to a feed reader</h2>
                <p>
                  Choose an open-source reader to copy the private URL, then add
                  it in the reader.
                </p>
              </div>
              <div className="rss-reader-actions">
                {feedReaders.map((reader) => (
                  <a
                    className="secondary-button button-link"
                    href={reader.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() => void copyFeed(reader.name)}
                    key={reader.name}
                  >
                    <ExternalLink aria-hidden="true" /> {reader.name}
                  </a>
                ))}
              </div>
            </section>
          )}
          <section className="rss-token-section">
            <ShieldAlert aria-hidden="true" />
            <div>
              <h2>Token security</h2>
              <p>
                Regenerate only if this URL was exposed. Every existing feed
                subscription will stop working.
              </p>
            </div>
            <form className="inline-form" onSubmit={regenerateToken}>
              <Field label="Current password">
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
              </Field>
              {totpEnabled ? (
                <Field label="Authenticator code">
                  <input name="totp" inputMode="numeric" maxLength={6} />
                </Field>
              ) : null}
              <button
                className="secondary-button danger-action"
                type="submit"
                disabled={regenerating}
              >
                <RefreshCw aria-hidden="true" />{" "}
                {regenerating ? "Regenerating…" : "Regenerate token"}
              </button>
            </form>
          </section>
          <ActionMessage message={message} error={error} />
        </div>
      </ApiState>
    </main>
  );
}
