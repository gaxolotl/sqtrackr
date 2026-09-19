"use client";

import Link from "next/link";
import { ArrowRight, Ban, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import {
  ActionMessage,
  ApiState,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Member = {
  _id: string;
  username: string;
  email?: string;
  role: string;
  created: number;
  banned?: boolean;
  banReason?: string;
  remainingInvites: number;
  bonusPoints: number;
  emailVerified?: boolean;
};

type MembersPage = {
  items: Member[];
  total: number;
  page: number;
  pageSize: number;
};

export function MembersTab({ embedded }: { embedded?: boolean }) {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("");
  const [banned, setBanned] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [acting, setActing] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const query = new URLSearchParams({ page: String(page) });
  if (debounced) query.set("q", debounced);
  if (role) query.set("role", role);
  if (banned) query.set("banned", banned);
  const members = useApiData<MembersPage>(
    isAdmin ? `/moderation/members?${query}` : null,
  );

  if (!session) {
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  }

  async function runAction(username: string, action: () => Promise<unknown>, success: string) {
    setActing(username);
    setActionError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      members.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : "Action failed.",
      );
    } finally {
      setActing("");
    }
  }

  function toggleBan(member: Member) {
    if (member.banned) {
      return runAction(
        member.username,
        () =>
          apiFetch(`/user/unban/${encodeURIComponent(member.username)}`, {
            method: "POST",
          }),
        `${member.username} unbanned.`,
      );
    }
    const reason = window.prompt(
      `Reason for banning ${member.username}:`,
      "none",
    );
    if (reason === null) return Promise.resolve();
    return runAction(
      member.username,
      () =>
        apiFetch(`/user/ban/${encodeURIComponent(member.username)}`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        }),
      `${member.username} banned.`,
    );
  }

  function changeRole(member: Member, nextRole: string) {
    if (nextRole === member.role) return Promise.resolve();
    return runAction(
      member.username,
      () =>
        apiFetch(`/user/role/${encodeURIComponent(member.username)}`, {
          method: "POST",
          body: JSON.stringify({ role: nextRole }),
        }),
      `${member.username} is now ${nextRole}.`,
    );
  }

  const content = (
    <>
      <ActionMessage message={message} error={actionError || (!isAdmin ? "Administrator access is required." : members.error)} />
      <div className="list-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={search}
          maxLength={100}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder="Search by username or email"
          aria-label="Search members"
        />
      </div>
      <div className="moderation-filters">
        <label>
          <span>Role</span>
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(0);
            }}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={banned}
            onChange={(event) => {
              setBanned(event.target.value);
              setPage(0);
            }}
            aria-label="Filter by status"
          >
            <option value="">Active and banned</option>
            <option value="active">Active only</option>
            <option value="banned">Banned only</option>
          </select>
        </label>
      </div>
      <ApiState
        loading={members.loading}
        error={undefined}
        empty={!members.data?.items.length}
      >
        <div className="feed-list">
          {members.data?.items.map((member) => (
            <article className="feed-card" key={member._id}>
              <div>
                <h2>
                  {member.banned ? (
                    <Ban aria-hidden="true" />
                  ) : (
                    <ShieldCheck aria-hidden="true" />
                  )}
                  {member.username}
                </h2>
                <p>
                  {member.role} · Joined {formatDateTime(member.created)}
                  {member.banned ? ` · Banned (${member.banReason || "no reason"})` : ""}
                </p>
                <p>
                  {member.email ?? "No email"} · {member.bonusPoints} BP ·{" "}
                  {member.remainingInvites} invites
                  {member.emailVerified ? " · Verified" : ""}
                </p>
                <div className="moderation-member-actions">
                  <label>
                    <span className="visually-hidden">Role for {member.username}</span>
                    <select
                      value={member.role}
                      disabled={acting === member.username || member.username === "admin"}
                      onChange={(event) => changeRole(member, event.target.value)}
                      aria-label={`Role for ${member.username}`}
                    >
                      <option value="user">User</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    disabled={acting === member.username || member.username === "admin"}
                    onClick={() => toggleBan(member)}
                  >
                    {member.banned ? "Unban" : "Ban"}
                  </button>
                  <Link
                    className="secondary-button compact-button button-link"
                    href={`/user/${encodeURIComponent(member.username)}`}
                  >
                    Profile <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <span className="status-pill">
                {member.banned ? "Banned" : member.role}
              </span>
            </article>
          ))}
        </div>
        {members.data ? (
          <Pager
            page={members.data.page}
            pageSize={members.data.pageSize}
            total={members.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </ApiState>
    </>
  );

  if (embedded) return <div className="moderation-embedded">{content}</div>;
  return <main className="page list-page">{content}</main>;
}
