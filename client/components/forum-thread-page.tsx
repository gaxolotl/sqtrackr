"use client";

import { FormEvent, useRef, useState } from "react";
import { Lock, MessageSquare, Pencil, Pin, Trash2, Unlock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { LinkPicker } from "@/components/link-picker";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch, canModerate } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { UserAvatar } from "@/components/user-avatar";
import type {
  ForumPost,
  ForumPostPage as ForumPostPageData,
  ForumThread,
} from "@/lib/types";

function AuthorLink({ username }: { username?: string }) {
  if (!username) return <>Unknown user</>;
  return <Link href={`/user/${encodeURIComponent(username)}`}>{username}</Link>;
}

export function ForumThreadPage({ threadId }: { threadId: string }) {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [editingThread, setEditingThread] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const replyBox = useRef<HTMLTextAreaElement>(null);

  function insertReplyAttachment(markdown: string) {
    const box = replyBox.current;
    if (!box) return;
    const start = box.selectionStart ?? box.value.length;
    const end = box.selectionEnd ?? start;
    box.value = `${box.value.slice(0, start)}${markdown}${box.value.slice(end)}`;
    box.focus();
  }
  const thread = useApiData<ForumThread>(
    session ? `/forum/thread/${encodeURIComponent(threadId)}` : null,
  );
  const posts = useApiData<ForumPostPageData>(
    session
      ? `/forum/thread/${encodeURIComponent(threadId)}/posts/page/${page}`
      : null,
  );

  if (!session) {
    return (
      <main className="page forum-page">
        <SignInRequired />
      </main>
    );
  }

  const category =
    thread.data && typeof thread.data.category !== "string"
      ? thread.data.category
      : null;
  const categoryId =
    category?._id ??
    (thread.data && typeof thread.data.category === "string"
      ? thread.data.category
      : "");
  const moderator = canModerate(session.role);
  const canManageThread = thread.data?.createdBy === session.id || moderator;

  function clearActionMessage() {
    setActionError("");
    setMessage("");
  }

  async function editThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSubmitting(true);
    clearActionMessage();
    try {
      await apiFetch(`/forum/thread/${threadId}/edit`, {
        method: "POST",
        body: JSON.stringify({
          title: values.get("title"),
          body: values.get("body"),
        }),
      });
      setEditingThread(false);
      setMessage("Thread updated.");
      thread.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the thread.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteThread() {
    if (
      !thread.data ||
      !window.confirm("Delete this thread and all of its replies?")
    ) {
      return;
    }
    clearActionMessage();
    try {
      await apiFetch(`/forum/thread/${threadId}`, { method: "DELETE" });
      router.push(categoryId ? `/forum/category/${categoryId}` : "/forum");
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete the thread.",
      );
    }
  }

  async function togglePinned() {
    if (!thread.data) return;
    clearActionMessage();
    try {
      await apiFetch(
        `/forum/thread/${threadId}/pin/${thread.data.pinned ? "unpin" : "pin"}`,
        { method: "POST" },
      );
      setMessage(thread.data.pinned ? "Thread unpinned." : "Thread pinned.");
      thread.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the thread.",
      );
    }
  }

  async function toggleLocked() {
    if (!thread.data) return;
    clearActionMessage();
    try {
      await apiFetch(
        `/forum/thread/${threadId}/lock/${thread.data.locked ? "unlock" : "lock"}`,
        { method: "POST" },
      );
      setMessage(thread.data.locked ? "Thread unlocked." : "Thread locked.");
      thread.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the thread.",
      );
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    clearActionMessage();
    try {
      await apiFetch(`/forum/thread/${threadId}/post`, {
        method: "POST",
        body: JSON.stringify({ body: values.get("body") }),
      });
      form.reset();
      setMessage("Reply posted.");
      thread.reload();
      const targetPage = Math.floor(
        (posts.data?.total ?? 0) / (posts.data?.pageSize ?? 25),
      );
      if (targetPage === page) posts.reload();
      else setPage(targetPage);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not post the reply.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function editPost(event: FormEvent<HTMLFormElement>, post: ForumPost) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSubmitting(true);
    clearActionMessage();
    try {
      await apiFetch(`/forum/post/${post._id}/edit`, {
        method: "POST",
        body: JSON.stringify({ body: values.get("body") }),
      });
      setEditingPostId(null);
      setMessage("Reply updated.");
      posts.reload();
      thread.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update the reply.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePost(post: ForumPost) {
    if (!window.confirm("Delete this reply?")) return;
    clearActionMessage();
    try {
      await apiFetch(`/forum/post/${post._id}`, { method: "DELETE" });
      setMessage("Reply deleted.");
      thread.reload();
      if (posts.data && posts.data.posts.length === 1 && page > 0) {
        setPage(page - 1);
      } else {
        posts.reload();
      }
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete the reply.",
      );
    }
  }

  return (
    <main className="page forum-page forum-thread-page">
      <ApiState
        loading={thread.loading}
        error={thread.error}
        empty={!thread.data}
      >
        {thread.data ? (
          <>
            <nav className="forum-breadcrumbs" aria-label="Breadcrumb">
              <Link href="/forum">Forum</Link>
              <span aria-hidden="true">/</span>
              <Link
                href={categoryId ? `/forum/category/${categoryId}` : "/forum"}
              >
                {category?.name ?? "Category"}
              </Link>
            </nav>
            <PageHeader title={thread.data.title} />
            <div className="forum-topic-tools">
              <div className="forum-topic-statuses">
                {thread.data.pinned ? (
                  <span>
                    <Pin aria-hidden="true" /> Pinned
                  </span>
                ) : null}
                {thread.data.locked ? (
                  <span>
                    <Lock aria-hidden="true" /> Locked
                  </span>
                ) : null}
                <span>{thread.data.views} views</span>
                <span>{thread.data.postCount} replies</span>
              </div>
              {moderator ? (
                <div className="forum-moderation-tools">
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={togglePinned}
                  >
                    <Pin aria-hidden="true" />{" "}
                    {thread.data.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={toggleLocked}
                  >
                    {thread.data.locked ? (
                      <Unlock aria-hidden="true" />
                    ) : (
                      <Lock aria-hidden="true" />
                    )}
                    {thread.data.locked ? "Unlock" : "Lock"}
                  </button>
                </div>
              ) : null}
            </div>
            <ActionMessage message={message} error={actionError} />

            <article className="forum-post-card forum-opening-post">
              <aside className="forum-post-author">
                <UserAvatar
                  username={thread.data.author?.username}
                  avatarUpdated={thread.data.author?.avatarUpdated}
                  className="forum-avatar"
                  size={46}
                />
                <strong>
                  <AuthorLink username={thread.data.author?.username} />
                </strong>
                <small>Topic author</small>
              </aside>
              <div className="forum-post-content">
                <header className="forum-post-header">
                  <time>{formatDateTime(thread.data.created)}</time>
                  {canManageThread ? (
                    <div className="forum-post-actions">
                      {!editingThread ? (
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => setEditingThread(true)}
                        >
                          <Pencil aria-hidden="true" /> Edit
                        </button>
                      ) : null}
                      <button
                        className="secondary-button compact-button danger-action"
                        type="button"
                        onClick={deleteThread}
                      >
                        <Trash2 aria-hidden="true" /> Delete
                      </button>
                    </div>
                  ) : null}
                </header>
                {editingThread ? (
                  <form
                    className="stack-form forum-thread-edit"
                    onSubmit={editThread}
                  >
                    <Field label="Title">
                      <input
                        name="title"
                        maxLength={Math.min(config.contentLimits.title, 200)}
                        required
                        defaultValue={thread.data.title}
                      />
                    </Field>
                    <Field label="Message" hint="Markdown is supported.">
                      <textarea
                        name="body"
                        rows={10}
                        maxLength={Math.min(config.contentLimits.body, 50000)}
                        required
                        defaultValue={thread.data.body}
                      />
                    </Field>
                    <div className="form-actions forum-edit-actions">
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={submitting}
                      >
                        {submitting ? "Saving..." : "Save changes"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setEditingThread(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <Markdown text={thread.data.body ?? ""} />
                )}
              </div>
            </article>

            <section className="content-section forum-replies-section">
              <div className="section-heading-row">
                <h2 className="section-title">
                  <MessageSquare aria-hidden="true" /> Replies
                </h2>
              </div>
              <ApiState
                loading={posts.loading}
                error={posts.error}
                empty={
                  !posts.loading && !posts.error && !posts.data?.posts.length
                }
              >
                <div className="forum-post-list">
                  {posts.data?.posts.map((post) => {
                    const ownsPost =
                      post.userId === session.id ||
                      post.author?._id === session.id;
                    const canManagePost = ownsPost || moderator;
                    return (
                      <article className="forum-post-card" key={post._id}>
                        <aside className="forum-post-author">
                          <UserAvatar
                            username={post.author?.username}
                            avatarUpdated={post.author?.avatarUpdated}
                            className="forum-avatar"
                            size={46}
                          />
                          <strong>
                            <AuthorLink username={post.author?.username} />
                          </strong>
                          <small>Member</small>
                        </aside>
                        <div className="forum-post-content">
                          <header className="forum-post-header">
                            <div>
                              <time>{formatDateTime(post.created)}</time>
                              {post.edited ? (
                                <span className="forum-post-edited">
                                  Edited {formatDateTime(post.edited)}
                                </span>
                              ) : null}
                            </div>
                            {canManagePost && editingPostId !== post._id ? (
                              <div className="forum-post-actions">
                                <button
                                  className="secondary-button compact-button"
                                  type="button"
                                  onClick={() => setEditingPostId(post._id)}
                                >
                                  <Pencil aria-hidden="true" /> Edit
                                </button>
                                <button
                                  className="secondary-button compact-button danger-action"
                                  type="button"
                                  onClick={() => deletePost(post)}
                                >
                                  <Trash2 aria-hidden="true" /> Delete
                                </button>
                              </div>
                            ) : null}
                          </header>
                          {editingPostId === post._id ? (
                            <form
                              className="stack-form forum-post-edit"
                              onSubmit={(event) => editPost(event, post)}
                            >
                              <Field
                                label="Reply"
                                hint="Markdown is supported."
                              >
                                <textarea
                                  name="body"
                                  rows={6}
                                  maxLength={Math.min(
                                    config.contentLimits.body,
                                    50000,
                                  )}
                                  required
                                  defaultValue={post.body}
                                />
                              </Field>
                              <div className="form-actions forum-edit-actions">
                                <button
                                  className="primary-button"
                                  type="submit"
                                  disabled={submitting}
                                >
                                  {submitting ? "Saving..." : "Save reply"}
                                </button>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => setEditingPostId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <Markdown text={post.body} />
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {posts.data ? (
                  <Pager
                    page={page}
                    pageSize={posts.data.pageSize}
                    total={posts.data.total}
                    onPageChange={setPage}
                  />
                ) : null}
              </ApiState>
            </section>

            <section className="content-section forum-reply-section">
              <h2 className="section-title">Post a reply</h2>
              {thread.data.locked ? (
                <div className="state-panel forum-thread-locked">
                  <Lock aria-hidden="true" /> This thread is locked. New replies
                  are disabled.
                </div>
              ) : (
                <form
                  className="stack-form forum-reply-form"
                  onSubmit={createPost}
                >
                  <Field label="Reply" hint="Markdown is supported.">
                    <textarea
                      ref={replyBox}
                      name="body"
                      rows={7}
                      maxLength={Math.min(config.contentLimits.body, 50000)}
                      required
                    />
                    <LinkPicker onInsert={insertReplyAttachment} />
                  </Field>
                  <div className="form-actions">
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? "Posting..." : "Post reply"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </>
        ) : null}
      </ApiState>
    </main>
  );
}
