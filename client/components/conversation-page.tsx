"use client";

import { ArrowLeft, LogOut, Send, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import {
  ActionMessage,
  ApiState,
  Field,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Conversation, DirectMessagePage } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";

export function ConversationPage({
  conversationId,
}: {
  conversationId: string;
}) {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const router = useRouter();
  const [page, setPage] = useState<number | "latest">("latest");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingPeople, setAddingPeople] = useState(false);
  const encodedId = encodeURIComponent(conversationId);
  const conversation = useApiData<Conversation>(
    session ? `/messages/${encodedId}` : null,
  );
  const messagePage = useApiData<DirectMessagePage>(
    session ? `/messages/${encodedId}/messages/page/${page}` : null,
  );

  useEffect(() => {
    if (!session || !messagePage.data?.messages.length) return;
    const displayedMessages = messagePage.data.messages;
    let active = true;

    async function markRead() {
      try {
        const through = Math.max(
          ...displayedMessages.map((message) => message.created),
        );
        await apiFetch(`/messages/${encodedId}/read`, {
          method: "POST",
          body: JSON.stringify({ through }),
        });
        if (active) window.dispatchEvent(new Event("sq:messages-updated"));
      } catch (requestError) {
        if (active) {
          setActionError(
            requestError instanceof Error
              ? requestError.message
              : "Could not mark the conversation as read.",
          );
        }
      }
    }

    void markRead();
    return () => {
      active = false;
    };
  }, [encodedId, messagePage.data, session]);

  if (!session) {
    return (
      <main className="page conversation-page">
        <SignInRequired />
      </main>
    );
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSubmitting(true);
    setActionError("");
    setActionMessage("");
    try {
      await apiFetch(`/messages/${encodedId}`, {
        method: "POST",
        body: JSON.stringify({ body: String(fields.get("body") ?? "") }),
      });
      form.reset();
      if (page === "latest") messagePage.reload();
      else setPage("latest");
      window.dispatchEvent(new Event("sq:messages-updated"));
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send the message.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function addParticipants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const participants = String(fields.get("participants") ?? "")
      .split(",")
      .map((username) => username.trim())
      .filter(Boolean);

    if (!participants.length) {
      setActionError("Enter at least one username to add.");
      setActionMessage("");
      return;
    }

    setSubmitting(true);
    setActionError("");
    setActionMessage("");
    try {
      await apiFetch(`/messages/${encodedId}/participants`, {
        method: "POST",
        body: JSON.stringify({ participants }),
      });
      form.reset();
      setAddingPeople(false);
      setActionMessage("Participants added.");
      conversation.reload();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not add participants.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveConversation() {
    if (
      !window.confirm(
        "Archive this conversation? It will return to your inbox when someone sends a new message.",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setActionError("");
    setActionMessage("");
    try {
      await apiFetch(`/messages/${encodedId}/archive`, { method: "POST" });
      window.dispatchEvent(new Event("sq:messages-updated"));
      router.push("/messages");
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not archive the conversation.",
      );
      setSubmitting(false);
    }
  }

  async function leaveGroupConversation() {
    if (
      !window.confirm(
        "Leave this group conversation? You will no longer be able to read its messages.",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setActionError("");
    setActionMessage("");
    try {
      await apiFetch(`/messages/${encodedId}/leave`, { method: "POST" });
      window.dispatchEvent(new Event("sq:messages-updated"));
      router.push("/messages");
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not leave the group conversation.",
      );
      setSubmitting(false);
    }
  }

  const otherParticipants =
    conversation.data?.participants.filter(
      (participant) =>
        participant._id !== session.id &&
        participant.username !== session.username,
    ) ?? [];
  const isSystem = Boolean(conversation.data?.system);
  const isReadOnly = Boolean(conversation.data?.readOnly) || isSystem;
  const title = isSystem
    ? conversation.data?.subject?.trim() || "System"
    : conversation.data?.subject?.trim() ||
      otherParticipants.map((participant) => participant.username).join(", ") ||
      "Conversation";
  const isCreator =
    !isSystem && conversation.data?.createdBy === session.id;
  const isGroup = (conversation.data?.participants.length ?? 0) > 2;

  return (
    <main className="chat-page">
      <ActionMessage message={actionMessage} error={actionError} />
      <ApiState
        loading={conversation.loading}
        error={conversation.error}
        empty={!conversation.data}
      >
        {conversation.data ? (
          <div className="chat">
            <header className="chat-top">
              <Link
                className="chat-back"
                href="/messages"
                aria-label="Back to messages"
              >
                <ArrowLeft aria-hidden="true" />
              </Link>
              <UserAvatar
                username={isGroup ? undefined : otherParticipants[0]?.username}
                avatarUpdated={otherParticipants[0]?.avatarUpdated}
                fallback={title}
                className="chat-avatar"
                size={44}
              />
              <div className="chat-heading">
                <h1>{title}</h1>
                <p>
                  {conversation.data.participants.length} people
                  {conversation.data.subject ? " · Group conversation" : ""}
                </p>
              </div>
              <div className="chat-tools">
                {isCreator ? (
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => setAddingPeople((open) => !open)}
                  >
                    {addingPeople ? (
                      <X aria-hidden="true" />
                    ) : (
                      <UserPlus aria-hidden="true" />
                    )}
                    {addingPeople ? "Close" : "Add people"}
                  </button>
                ) : null}
                {isGroup ? (
                  <button
                    className="secondary-button compact-button danger-action"
                    type="button"
                    disabled={submitting}
                    onClick={leaveGroupConversation}
                  >
                    <LogOut aria-hidden="true" /> Leave
                  </button>
                ) : (
                  <button
                    className="secondary-button compact-button danger-action"
                    type="button"
                    disabled={submitting}
                    onClick={archiveConversation}
                  >
                    <LogOut aria-hidden="true" /> Archive
                  </button>
                )}
              </div>
            </header>

            {isSystem ? (
              <div className="chat-participants">
                <span>From System · Automated message, replies are disabled</span>
              </div>
            ) : (
              <div className="chat-participants">
                <span>With</span>
                {conversation.data.participants.map((participant) => (
                  <Link
                    href={`/user/${encodeURIComponent(participant.username)}`}
                    key={participant._id ?? participant.username}
                  >
                    {participant.username}
                  </Link>
                ))}
              </div>
            )}

            {isCreator && addingPeople ? (
              <form className="chat-add-people" onSubmit={addParticipants}>
                <Field
                  label="Add people by username"
                  hint={`Comma-separated. ${Math.max(0, 8 - conversation.data.participants.length)} places left.`}
                >
                  <input
                    name="participants"
                    required
                    autoComplete="off"
                    placeholder="username, another-user"
                  />
                </Field>
                <button
                  className="primary-button compact-button"
                  type="submit"
                  disabled={submitting}
                >
                  Add
                </button>
              </form>
            ) : null}

            <section className="chat-thread">
              <ApiState
                loading={messagePage.loading}
                error={messagePage.error}
                empty={!messagePage.data?.messages.length}
              >
                <div className="chat-messages">
                  {messagePage.data?.messages.map((message) => {
                    const isOwnMessage = message.sender?._id === session.id;
                    const senderName = message.system
                      ? "System"
                      : (message.sender?.username ?? "Unknown user");
                    return (
                      <article
                        className={`chat-message${isOwnMessage ? " chat-message-own" : ""}`}
                        aria-label={`Message from ${senderName}`}
                        key={message._id}
                      >
                        {!isOwnMessage ? (
                          <UserAvatar
                            username={message.sender?.username}
                            avatarUpdated={message.sender?.avatarUpdated}
                            fallback={message.system ? "S" : undefined}
                            className="chat-message-avatar"
                            size={34}
                          />
                        ) : null}
                        <div className="chat-bubble">
                          {!isOwnMessage ? (
                            <div className="chat-message-meta">
                              {message.sender?.username ? (
                                <Link
                                  href={`/user/${encodeURIComponent(message.sender.username)}`}
                                >
                                  {message.sender.username}
                                </Link>
                              ) : (
                                <span>{senderName}</span>
                              )}
                            </div>
                          ) : null}
                          <div className="chat-message-content">
                            <p className="chat-message-body">
                              {message.body
                                .split(/\r?\n/)
                                .map((line, index) => (
                                  <Fragment key={index}>
                                    {index ? <br /> : null}
                                    {line}
                                  </Fragment>
                                ))}
                            </p>
                            <time
                              dateTime={new Date(message.created).toISOString()}
                            >
                              {formatDateTime(message.created)}
                            </time>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {messagePage.data ? (
                  <Pager
                    page={messagePage.data.page}
                    pageSize={messagePage.data.pageSize}
                    total={messagePage.data.total}
                    onPageChange={setPage}
                  />
                ) : null}
              </ApiState>
            </section>

            {isReadOnly ? (
              <div className="state-panel">
                This is an automated system message and cannot be replied to.
              </div>
            ) : (
              <form className="chat-composer" onSubmit={sendMessage}>
                <Field label="Reply">
                  <textarea
                    name="body"
                    rows={2}
                    required
                    maxLength={Math.min(config.contentLimits.message, 50000)}
                    placeholder="Write a message…"
                  />
                </Field>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={submitting}
                  aria-label="Send message"
                >
                  <Send aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        ) : null}
      </ApiState>
    </main>
  );
}
