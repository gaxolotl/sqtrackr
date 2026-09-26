"use client";

import Image from "next/image";
import Link from "next/link";
import { Copy, KeyRound, ShieldCheck, Ticket, Upload } from "lucide-react";
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
import type { Invite } from "@/lib/types";
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
  const { session } = useAuth();
  const stats = useApiData<AccountStats>(session ? "/account/get-stats" : null);
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

  async function beginTotp() {
    setActionError("");
    try {
      setTotp(await apiFetch<TotpSetup>("/account/totp/generate"));
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
    setMessage("");
    setActionError("");
    try {
      const codes = await apiFetch<string>("/account/totp/enable", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setBackupCodes(codes.split(",").filter(Boolean));
      setMessage(
        "Two-factor authentication enabled. Store these backup codes safely.",
      );
      form.reset();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not enable two-factor authentication.",
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
                      `${window.location.origin}/register?token=${invite.token}`,
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
        <p>Use an authenticator app to add another layer of security.</p>
        {totp ? (
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
              <button className="primary-button" type="submit">
                Enable 2FA
              </button>
            </form>
            {backupCodes.length ? (
              <div
                className="backup-codes"
                aria-label="Two-factor backup codes"
              >
                {backupCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={beginTotp}
          >
            <ShieldCheck aria-hidden="true" /> Set up 2FA
          </button>
        )}
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
      <ActionMessage message={message} error={actionError} />
    </main>
  );
}
