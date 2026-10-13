"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, KeyRound, ShieldCheck, Ticket, Upload } from "lucide-react";
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
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Invite, UserWarning } from "@/lib/types";

type ApiTokenMeta = {
  _id: string;
  name: string;
  prefix: string;
  created: number;
  lastUsedAt?: number;
};
type DeviceSession = {
  id: string;
  device: string;
  ip?: string | null;
  created: number;
  lastSeen: number;
  revoked: boolean;
  current: boolean;
};
import { UserAvatar } from "@/components/user-avatar";
import { useTrackerConfig } from "@/hooks/use-tracker-config";

type AccountStats = {
  bp: number;
  ratio: number;
  hitnruns: number;
  snatches: number;
  uploaded?: number;
  downloaded?: number;
};
type TotpSetup = { qr: string; secret: string };
type EditableProfile = {
  username: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUpdated?: number;
};

export function AccountPage() {
  const { session, logout } = useAuth();
  const router = useRouter();
  const stats = useApiData<AccountStats>(session ? "/account/get-stats" : null);
  const warnings = useApiData<UserWarning[]>(
    session ? "/account/warnings" : null,
  );
  const tokens = useApiData<ApiTokenMeta[]>(
    session ? "/account/tokens" : null,
  );
  const devices = useApiData<{ sessions: DeviceSession[] }>(
    session ? "/account/sessions" : null,
  );
  const totpStatus = useApiData<{ enabled: boolean }>(
    session ? "/account/totp/status" : null,
  );
  const totpEnabled = totpStatus.data?.enabled ?? false;
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newAnnounceUrl, setNewAnnounceUrl] = useState<string | null>(null);
  const invites = useApiData<Invite[]>(session ? "/account/invites" : null);
  const profile = useApiData<EditableProfile>(
    session ? "/account/profile" : null,
  );
  const { config } = useTrackerConfig();
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [totp, setTotp] = useState<TotpSetup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  if (!session)
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );

  async function postForm(
    event: FormEvent<HTMLFormElement>,
    path: string,
    success: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const entries = Object.fromEntries(new FormData(form).entries());
    setMessage("");
    setActionError("");
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(entries) });
      setMessage(success);
      form.reset();
      stats.reload();
      invites.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : "Action failed.",
      );
    }
  }

  async function appealWarning(warningId: string) {
    const text = window.prompt("Explain why this warning should be lifted:");
    if (!text || !text.trim()) return;
    setMessage("");
    setActionError("");
    try {
      await apiFetch(`/account/warnings/${warningId}/appeal`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim() }),
      });
      setMessage("Appeal sent. Staff will review it.");
      warnings.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send the appeal.",
      );
    }
  }

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    setMessage("");
    setActionError("");
    try {
      const result = await apiFetch<{ token: string }>("/account/tokens", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      form.reset();
      setNewToken(result.token);
      setMessage("API token created. Copy it now, it will not be shown again.");
      tokens.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create the token.",
      );
    }
  }

  async function revokeToken(id: string) {
    if (!window.confirm("Revoke this API token?")) return;
    setMessage("");
    setActionError("");
    try {
      await apiFetch(`/account/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMessage("API token revoked.");
      tokens.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not revoke the token.",
      );
    }
  }

  async function rotateUid() {
    if (
      !window.confirm(
        "Rotate your announce key? You must re-download torrents afterwards.",
      )
    )
      return;
    setMessage("");
    setActionError("");
    setNewAnnounceUrl(null);
    try {
      const result = await apiFetch<{ announceUrl: string }>(
        "/account/rotate-uid",
        { method: "POST" },
      );
      setNewAnnounceUrl(result.announceUrl);
      setMessage("Announce key rotated. Re-download your torrents.");
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not rotate the announce key.",
      );
    }
  }

  async function revokeSession(device: DeviceSession) {
    if (
      !window.confirm(
        device.current
          ? "Sign out this device? You will be logged out immediately."
          : `Sign out "${device.device}"?`,
      )
    )
      return;
    setRevokingSession(device.id);
    setMessage("");
    setActionError("");
    try {
      await apiFetch(`/account/sessions/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      if (device.current) {
        void logout({ revoke: false });
        router.push("/login");
        return;
      }
      setMessage("Device signed out.");
      devices.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not sign out the device.",
      );
    } finally {
      setRevokingSession(null);
    }
  }

  async function signOutEverywhere() {
    if (
      !window.confirm(
        "Sign out all devices, including this one? You will need to log in again.",
      )
    )
      return;
    try {
      await apiFetch("/account/sign-out-all", { method: "POST" });
    } catch {
      // The session may already be invalid; continue to log out locally.
    }
    void logout({ revoke: false });
    router.push("/login");
  }

  async function beginTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setMessage("");
    setActionError("");
    try {
      setTotp(
        await apiFetch<TotpSetup>("/account/totp/generate", {
          method: "POST",
          body: JSON.stringify({ password }),
        }),
      );
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not start 2FA setup.",
      );
    }
  }

  async function enableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const token = new FormData(form).get("token");
    const password = String(new FormData(form).get("password") ?? "");
    setMessage("");
    setActionError("");
    try {
      const codes = await apiFetch<string>("/account/totp/enable", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setBackupCodes(codes.split(",").filter(Boolean));
      setMessage(
        "Two-factor authentication enabled. Store these backup codes safely.",
      );
      setTotp(null);
      totpStatus.reload();
      form.reset();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not enable two-factor authentication.",
      );
    }
  }

  function downloadBackupCodes() {
    if (!backupCodes.length) return;
    const content = backupCodes.join("\n") + "\n";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sqtrackr-backup-codes.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function disableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const token = String(new FormData(form).get("token") ?? "");
    const password = String(new FormData(form).get("password") ?? "");
    if (
      !window.confirm(
        "Disable two-factor authentication? Your account will be protected by password only.",
      )
    )
      return;
    setMessage("");
    setActionError("");
    try {
      await apiFetch("/account/totp/disable", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage("Two-factor authentication disabled.");
      setTotp(null);
      setBackupCodes([]);
      totpStatus.reload();
      form.reset();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not disable two-factor authentication.",
      );
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    setMessage("");
    setActionError("");
    try {
      await apiFetch("/account/profile", {
        method: "PATCH",
        body: JSON.stringify(entries),
      });
      setMessage("Profile updated.");
      profile.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update profile.",
      );
    }
  }

  async function uploadProfilePicture(file?: File) {
    if (!file) return;
    setUploadingAvatar(true);
    setMessage("");
    setActionError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Could not read the selected image."));
        reader.readAsDataURL(file);
      });
      await apiFetch("/account/avatar", {
        method: "POST",
        body: JSON.stringify({ data, contentType: file.type }),
      });
      setMessage("Profile picture updated and converted to WebP.");
      profile.reload();
      window.dispatchEvent(new Event("sq:profile"));
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not upload profile picture.",
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeProfilePicture() {
    setMessage("");
    setActionError("");
    try {
      await apiFetch("/account/avatar", { method: "DELETE" });
      setMessage("Profile picture removed.");
      profile.reload();
      window.dispatchEvent(new Event("sq:profile"));
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not remove profile picture.",
      );
    }
  }

  return (
    <main className="page account-page">
      <PageHeader
        title="My account"
        info={`Signed in as ${session.username}`}
        actions={
          <Link className="secondary-button button-link" href="/bookmarks">
            View bookmarks
          </Link>
        }
      />
      <div className="account-role">
        This is {session.role === "admin" ? "an" : "a"}{" "}
        <strong>{session.role}</strong> account.
      </div>
      <ApiState
        loading={profile.loading}
        error={profile.error}
        empty={!profile.data}
      >
        {profile.data ? (
          <section className="account-section profile-settings-section">
            <h2>Public profile</h2>
            <div className="avatar-settings">
              <UserAvatar
                username={profile.data.username}
                avatarUpdated={profile.data.avatarUpdated}
                className="account-avatar"
                size={112}
              />
              <div>
                <label className="secondary-button avatar-upload-button">
                  {uploadingAvatar ? "Processing…" : "Choose picture"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploadingAvatar}
                    onChange={(event) =>
                      uploadProfilePicture(event.target.files?.[0])
                    }
                  />
                </label>
                {profile.data.avatarUpdated ? (
                  <button
                    className="secondary-button compact-button danger-action"
                    type="button"
                    onClick={removeProfilePicture}
                  >
                    Remove picture
                  </button>
                ) : null}
                <p>
                  JPEG, PNG, WebP or{" "}
                  {config.allowGifAvatars ? "GIF" : "static images"}. Stored as
                  WebP at up to {config.avatarMaxResolution}px and{" "}
                  {config.avatarMaxSizeKb} KB.
                </p>
              </div>
            </div>
            <form className="stack-form" onSubmit={saveProfile}>
              <Field label="Bio" hint="Markdown is supported.">
                <textarea
                  name="bio"
                  rows={5}
                  maxLength={Math.min(config.contentLimits.profileBio, 500)}
                  defaultValue={profile.data.bio ?? ""}
                  placeholder="Tell the community about yourself."
                />
              </Field>
              <div className="settings-grid">
                <Field label="Location">
                  <input
                    name="location"
                    maxLength={Math.min(
                      config.contentLimits.profileLocation,
                      80,
                    )}
                    defaultValue={profile.data.location ?? ""}
                  />
                </Field>
                <Field label="Website">
                  <input
                    name="website"
                    type="url"
                    maxLength={200}
                    defaultValue={profile.data.website ?? ""}
                    placeholder="https://example.com"
                  />
                </Field>
              </div>
              <div className="form-actions">
                <button className="primary-button" type="submit">
                  Save profile
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </ApiState>
      {warnings.data?.some((warning) => !warning.resolved) ? (
        <section className="account-section">
          <h2>Warnings</h2>
          <div className="feed-list">
            {warnings.data
              .filter((warning) => !warning.resolved)
              .map((warning) => (
                <article className="feed-card" key={warning._id}>
                  <div>
                    <h2>{warning.reason}</h2>
                    <p>Issued {formatDateTime(warning.created)}</p>
                    {warning.appeal ? (
                      <p>Appeal sent: {warning.appeal.text}</p>
                    ) : null}
                  </div>
                  {warning.appeal ? (
                    <span className="status-pill">Appealed</span>
                  ) : (
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => appealWarning(warning._id)}
                    >
                      Appeal
                    </button>
                  )}
                </article>
              ))}
          </div>
        </section>
      ) : null}
      <ApiState loading={stats.loading} error={stats.error} empty={!stats.data}>
        <section className="account-section">
          <h2>Bonus points</h2>
          <p>
            You currently have <strong>{stats.data?.bp ?? 0}</strong> bonus
            points.
          </p>
          <div className="purchase-grid">
            <form
              className="purchase-card"
              onSubmit={(event) =>
                postForm(event, "/account/buy", "Invites purchased.")
              }
            >
              <Ticket aria-hidden="true" />
              <span>Purchase invites</span>
              <input type="hidden" name="type" value="invite" />
              <input
                aria-label="Invite amount"
                name="amount"
                type="number"
                min="1"
                defaultValue="1"
              />
              <button className="primary-button" type="submit">
                Buy
              </button>
            </form>
            <form
              className="purchase-card"
              onSubmit={(event) =>
                postForm(event, "/account/buy", "Upload credit purchased.")
              }
            >
              <Upload aria-hidden="true" />
              <span>Purchase upload (1 GB)</span>
              <input type="hidden" name="type" value="upload" />
              <input
                aria-label="Upload amount"
                name="amount"
                type="number"
                min="1"
                defaultValue="1"
              />
              <button className="primary-button" type="submit">
                Buy
              </button>
            </form>
          </div>
        </section>
      </ApiState>
      <section className="account-section">
        <div className="section-heading-row">
          <h2>Invites</h2>
        </div>
        <form
          className="inline-form invite-form"
          onSubmit={(event) =>
            postForm(event, "/account/generate-invite", "Invite created.")
          }
        >
          <Field label="Email">
            <input name="email" type="email" maxLength={320} required />
          </Field>
          <Field label="Role">
            <select name="role" defaultValue="user">
              <option value="user">User</option>
              {session.role === "admin" ? (
                <option value="admin">Admin</option>
              ) : null}
            </select>
          </Field>
          <button className="primary-button" type="submit">
            Send invite
          </button>
        </form>
        <ApiState
          loading={invites.loading}
          error={invites.error}
          empty={!invites.data?.length}
        >
          <div className="invite-list">
            {invites.data?.map((invite) => (
              <article className="invite-row" key={invite._id}>
                <div>
                  <strong>{invite.email}</strong>
                  <span>
                    {invite.claimed
                      ? "Claimed"
                      : `Valid until ${formatDateTime(invite.validUntil)}`}
                  </span>
                </div>
                <button
                  className="icon-action"
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}/register?token=${encodeURIComponent(invite.token)}`,
                    )
                  }
                  aria-label="Copy invite link"
                >
                  <Copy aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        </ApiState>
      </section>
      <section className="account-section">
        <h2>Two-factor authentication</h2>
        <ApiState
          loading={totpStatus.loading}
          error={totpStatus.error}
          empty={false}
        >
          {totpEnabled ? (
            <p>
              <ShieldCheck aria-hidden="true" /> Two-factor authentication is
              currently enabled on your account.
            </p>
          ) : (
            <p>Use an authenticator app to add another layer of security.</p>
          )}
        </ApiState>
        {totp && !totpEnabled ? (
          <div className="totp-setup">
            <Image
              src={totp.qr}
              width={180}
              height={180}
              alt="Authenticator QR code"
              unoptimized
            />
            <code>{totp.secret}</code>
            <form className="inline-form" onSubmit={enableTotp}>
              <Field label="Authenticator code">
                <input
                  name="token"
                  inputMode="numeric"
                  maxLength={6}
                  required
                />
              </Field>
              <Field label="Current password">
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
              </Field>
              <button className="primary-button" type="submit">
                Enable 2FA
              </button>
            </form>
          </div>
        ) : null}
        {!totp && !totpEnabled ? (
          <form className="inline-form" onSubmit={beginTotp}>
            <Field label="Current password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </Field>
            <button className="secondary-button" type="submit">
              <ShieldCheck aria-hidden="true" /> Set up 2FA
            </button>
          </form>
        ) : null}
        {backupCodes.length ? (
          <>
            <div
              className="backup-codes"
              aria-label="Two-factor backup codes"
            >
              {backupCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={downloadBackupCodes}
            >
              <Download aria-hidden="true" /> Download backup codes (.txt)
            </button>
          </>
        ) : null}
        {totpEnabled ? (
          <form className="inline-form" onSubmit={disableTotp}>
            <Field label="Authenticator code">
              <input
                name="token"
                inputMode="numeric"
                maxLength={6}
                required
              />
            </Field>
            <Field label="Current password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </Field>
            <button
              className="secondary-button danger-action"
              type="submit"
            >
              Disable 2FA
            </button>
          </form>
        ) : null}
      </section>
      <section className="account-section">
        <h2>Change password</h2>
        <form
          className="stack-form"
          onSubmit={(event) =>
            postForm(event, "/account/change-password", "Password changed.")
          }
        >
          <Field label="Current password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </Field>
          <Field label="New password">
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              maxLength={128}
              required
            />
          </Field>
          <div className="form-actions">
            <button className="primary-button" type="submit">
              <KeyRound aria-hidden="true" /> Change password
            </button>
          </div>
        </form>
      </section>
      <section className="account-section">
        <h2>API tokens</h2>
        <p>Tokens authenticate API requests as you. They can be revoked any time.</p>
        {newToken ? (
          <p>
            New token: <strong>{newToken}</strong>
          </p>
        ) : null}
        {tokens.data?.length ? (
          <div className="feed-list">
            {tokens.data.map((token) => (
              <article className="feed-card" key={token._id}>
                <div>
                  <h2>{token.name}</h2>
                  <p>
                    {token.prefix}… · Created {formatDateTime(token.created)}
                    {token.lastUsedAt
                      ? ` · Last used ${formatDateTime(token.lastUsedAt)}`
                      : " · Never used"}
                  </p>
                </div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => revokeToken(token._id)}
                >
                  Revoke
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p>No API tokens yet.</p>
        )}
        <form className="inline-form" onSubmit={createToken}>
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Token name, e.g. autobrr"
            aria-label="Token name"
          />
          <button className="primary-button" type="submit">
            Create token
          </button>
        </form>
      </section>
      <section className="account-section">
        <h2>Sessions and announce key</h2>
        <p>Every browser you sign in with shows up here.</p>
        <ApiState
          loading={devices.loading}
          error={devices.error}
          empty={
            !devices.loading &&
            !devices.data?.sessions.some((device) => !device.revoked)
          }
        >
          <div className="feed-list">
            {devices.data?.sessions
              .filter((device) => !device.revoked)
              .map((device) => (
                <article className="feed-card" key={device.id}>
                  <div>
                    <h2>
                      {device.device}
                      {device.current ? " · This device" : ""}
                    </h2>
                    <p>
                      {device.ip ? `${device.ip} · ` : ""}
                      Signed in {formatDateTime(device.created)}
                      {device.lastSeen
                        ? ` · Last active ${formatDateTime(device.lastSeen)}`
                        : ""}
                    </p>
                  </div>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    disabled={revokingSession === device.id}
                    onClick={() => revokeSession(device)}
                  >
                    {revokingSession === device.id
                      ? "Signing out…"
                      : "Sign out"}
                  </button>
                </article>
              ),
            )}
          </div>
        </ApiState>
        {newAnnounceUrl ? (
          <p>
            New announce URL: <strong>{newAnnounceUrl}</strong>
          </p>
        ) : null}
        <div className="candidate-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={rotateUid}
          >
            <Copy aria-hidden="true" /> Rotate announce key
          </button>
          <button
            className="secondary-button danger-action"
            type="button"
            onClick={signOutEverywhere}
          >
            Sign out everywhere
          </button>
        </div>
      </section>
      <ActionMessage message={message} error={actionError} />
    </main>
  );
}
