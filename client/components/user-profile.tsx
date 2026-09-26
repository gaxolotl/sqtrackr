"use client";

import Link from "next/link";
import {
  Ban,
  BarChart3,
  CircleUserRound,
  Download,
  Mail,
  MapPin,
  Globe,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { TorrentTable } from "@/components/torrent-table";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch, canModerate } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import type { UserProfile as UserProfileType } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import { Markdown } from "@/lib/markdown";

function websiteHost(website: string) {
  try {
    return new URL(website).hostname;
  } catch {
    return website;
  }
}

export function UserProfile({ username }: { username: string }) {
  const { session } = useAuth();
  const { data, error, loading, reload } = useApiData<UserProfileType>(
    session ? `/user/${encodeURIComponent(username)}` : null,
  );
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  async function setBanned(banned: boolean) {
    if (!data) return;
    const reason = banned
      ? window.prompt("Reason for banning this user:", "none")
      : undefined;
    if (banned && reason === null) return;
    setActionError("");
    setMessage("");
    try {
      await apiFetch(
        `/user/${banned ? "ban" : "unban"}/${encodeURIComponent(data.username)}`,
        {
          method: "POST",
          body: banned ? JSON.stringify({ reason }) : undefined,
        },
      );
      setMessage(banned ? "User banned." : "User unbanned.");
      reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the user.",
      );
    }
  }

  async function issueWarning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (!reason) return;
    setActionError("");
    setMessage("");
    try {
      await apiFetch(`/user/warn/${encodeURIComponent(data.username)}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMessage("Warning issued.");
      reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not issue the warning.",
      );
    }
  }

  async function resolveWarning(warningId: string) {
    setActionError("");
    setMessage("");
    try {
      await apiFetch(`/user/unwarn/${warningId}`, { method: "POST" });
      setMessage("Warning resolved.");
      reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not resolve the warning.",
      );
    }
  }

  async function updateRole(role: string) {
    if (!data) return;
    setSavingRole(true);
    setActionError("");
    setMessage("");
    try {
      await apiFetch(`/user/role/${encodeURIComponent(data.username)}`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setMessage("User role updated.");
      reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the user role.",
      );
    } finally {
      setSavingRole(false);
    }
  }

  const stats = data
    ? [
        {
          label: "Ratio",
          value: Number(data.ratio ?? 0).toFixed(2),
          icon: BarChart3,
        },
        {
          label: "Downloaded",
          value: formatBytes(data.downloaded?.bytes),
          icon: Download,
        },
        {
          label: "Uploaded",
          value: formatBytes(data.uploaded?.bytes),
          icon: Upload,
        },
      ]
    : [];

  return (
    <main className="page profile-page">
      <ApiState loading={loading} error={error} empty={!data}>
        {data ? (
          <>
            <PageHeader
              title={`${data.username}’s profile`}
              info={`User since ${formatDate(data.created)}`}
              actions={
                <>
                  {session.username === data.username ? (
                    <Link
                      className="primary-button button-link"
                      href="/account"
                    >
                      My account
                    </Link>
                  ) : null}
                  {session.username !== data.username ? (
                    <Link
                      className="secondary-button button-link"
                      href={`/messages/new?username=${encodeURIComponent(data.username)}`}
                    >
                      <Mail aria-hidden="true" /> Message user
                    </Link>
                  ) : null}
                  {session.role === "admin" &&
                  session.username !== data.username ? (
                    <button
                      className={`secondary-button ${data.banned ? "" : "danger-action"}`}
                      type="button"
                      onClick={() => setBanned(!data.banned)}
                    >
                      {data.banned ? (
                        <ShieldCheck aria-hidden="true" />
                      ) : (
                        <Ban aria-hidden="true" />
                      )}
                      {data.banned ? "Unban" : "Ban user"}
                    </button>
                  ) : null}
                </>
              }
            />
            <section className="profile-identity">
              <UserAvatar
                username={data.username}
                avatarUpdated={data.avatarUpdated}
                className="profile-avatar"
                size={128}
              />
              <div className="profile-identity-copy">
                <span className="role profile-role">
                  <CircleUserRound aria-hidden="true" />{" "}
                  {data.role === "admin"
                    ? "Administrator"
                    : data.role === "staff"
                      ? "Staff"
                      : "Member"}
                </span>
                {data.bio ? (
                  <div className="profile-bio">
                    <Markdown text={data.bio} />
                  </div>
                ) : (
                  <p className="profile-bio profile-bio-empty">No bio yet.</p>
                )}
                <div className="profile-details">
                  {data.location ? (
                    <span>
                      <MapPin aria-hidden="true" /> {data.location}
                    </span>
                  ) : null}
                  {data.website ? (
                    <a href={data.website} target="_blank" rel="noreferrer">
                      <Globe aria-hidden="true" /> {websiteHost(data.website)}
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
            <ActionMessage message={message} error={actionError} />

            {session.role === "admin" ? (
              <section className="admin-note">
                <h2>Only admins can see this</h2>
                <ul>
                  <li>{data.email ?? "No email"}</li>
                  <li>Email verified: {data.emailVerified ? "yes" : "no"}</li>
                  <li>Remaining invites: {data.remainingInvites ?? 0}</li>
                  <li>
                    Status:{" "}
                    {data.banned
                      ? `banned (${data.banReason ?? "none"})`
                      : "active"}
                  </li>
                </ul>
                <label className="profile-role-control">
                  <span>Role</span>
                  <select
                    value={data.role}
                    disabled={
                      savingRole ||
                      data.username === "admin" ||
                      data._id === session.id
                    }
                    onChange={(event) => updateRole(event.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </section>
            ) : null}

            {canModerate(session.role) ? (
              <section className="content-section">
                <h2 className="section-title">Warnings</h2>
                {data.warnings?.length ? (
                  <div className="feed-list">
                    {data.warnings.map((warning) => (
                      <article className="feed-card" key={warning._id}>
                        <div>
                          <h2>{warning.reason}</h2>
                          <p>
                            Issued{" "}
                            {formatDateTime(warning.created)}
                            {warning.issuedByUsername
                              ? ` by ${warning.issuedByUsername}`
                              : ""}
                            {warning.resolved ? " · Resolved" : ""}
                          </p>
                          {warning.appeal ? (
                            <p>
                              Appeal: {warning.appeal.text}
                            </p>
                          ) : null}
                        </div>
                        {warning.resolved ? (
                          <span className="status-pill">Resolved</span>
                        ) : (
                          <button
                            className="secondary-button compact-button"
                            type="button"
                            onClick={() => resolveWarning(warning._id)}
                          >
                            Resolve
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="state-panel">No warnings.</div>
                )}
                <form className="inline-form" onSubmit={issueWarning}>
                  <Field label="Issue a warning">
                    <input
                      name="reason"
                      required
                      maxLength={2000}
                      placeholder="Reason for the warning"
                    />
                  </Field>
                  <button className="primary-button" type="submit">
                    Warn
                  </button>
                </form>
              </section>
            ) : null}

            <section className="stats-grid">
              {stats.map(({ label, value, icon: Icon }) => (
                <article className="stat-card" key={label}>
                  <h2>
                    <Icon aria-hidden="true" /> {label}
                  </h2>
                  <p>{value}</p>
                </article>
              ))}
            </section>

            <section className="content-section">
              <h2 className="section-title">Uploaded</h2>
              <TorrentTable torrents={data.torrents ?? []} />
            </section>

            <section className="content-section comments-section">
              <h2 className="section-title">Comments</h2>
              <div className="comments-list">
                {data.comments?.length ? (
                  data.comments.map((comment) => {
                    const target = comment.torrent
                      ? `/torrent/${comment.torrent.infoHash}`
                      : comment.announcement
                        ? `/announcements/${comment.announcement.slug}`
                        : comment.request
                          ? `/requests/${comment.request.index}`
                          : "/";
                    const name =
                      comment.torrent?.name ??
                      comment.announcement?.title ??
                      comment.request?.title ??
                      "deleted item";
                    return (
                      <article className="comment" key={comment._id}>
                        <div className="comment-meta">
                          <p>
                            Comment by{" "}
                            <Link href={`/user/${data.username}`}>
                              {data.username}
                            </Link>{" "}
                            on <Link href={target}>{name}</Link>
                          </p>
                          <time>{formatDateTime(comment.created)}</time>
                        </div>
                        <p className="comment-body">{comment.comment}</p>
                      </article>
                    );
                  })
                ) : (
                  <div className="state-panel">No comments yet.</div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </ApiState>
    </main>
  );
}
