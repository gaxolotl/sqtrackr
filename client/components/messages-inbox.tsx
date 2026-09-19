"use client";

import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { formatDateTime } from "@/lib/format";
import type { Conversation, ConversationPage } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";

function truncateMessage(body: string) {
  const compactBody = body.replace(/\s+/g, " ").trim();
  return compactBody.length > 160
    ? `${compactBody.slice(0, 157)}...`
    : compactBody;
}

export function MessagesInbox() {
  const { session } = useAuth();
  const [page, setPage] = useState(0);
  const { data, error, loading } = useApiData<ConversationPage>(
    session ? `/messages/page/${page}` : null,
  );

  if (!session) {
    return (
      <main className="page messages-page">
        <SignInRequired />
      </main>
    );
  }

  const currentUserId = session.id;
  const currentUsername = session.username;

  function conversationTitle(conversation: Conversation) {
    if (conversation.system) {
      return conversation.subject?.trim() || "System";
    }
    const otherParticipants = conversation.participants.filter(
      (participant) =>
        participant._id !== currentUserId &&
        participant.username !== currentUsername,
    );
    const participantNames = (
      otherParticipants.length ? otherParticipants : conversation.participants
    )
      .map((participant) => participant.username)
      .join(", ");

    return conversation.subject?.trim() || participantNames || "Conversation";
  }

  return (
    <main className="page list-page messages-page">
      <PageHeader
        title="Messages"
        actions={
          <Link className="primary-button button-link" href="/messages/new">
            <MessageSquarePlus aria-hidden="true" /> New conversation
          </Link>
        }
      />

      <ApiState loading={loading} error={error}>
        {data?.conversations.length ? (
          <>
            <div className="conversation-list">
              {data.conversations.map((conversation) => {
                const lastMessage = conversation.lastMessage;
                const unreadCount = Math.max(0, conversation.unreadCount ?? 0);

                const title = conversationTitle(conversation);
                const otherParticipant = conversation.participants.find(
                  (participant) =>
                    participant._id !== currentUserId &&
                    participant.username !== currentUsername,
                );
                const directUsername =
                  conversation.participants.length === 2
                    ? otherParticipant?.username
                    : undefined;
                return (
                  <Link
                    className="conversation-row"
                    href={`/messages/${encodeURIComponent(conversation._id)}`}
                    key={conversation._id}
                  >
                    <UserAvatar
                      username={directUsername}
                      avatarUpdated={otherParticipant?.avatarUpdated}
                      fallback={title}
                      className="conversation-avatar"
                      size={44}
                    />
                    <span className="conversation-row-main">
                      <span className="conversation-row-title">
                        <strong>{title}</strong>
                        {unreadCount ? (
                          <span
                            className="unread-dot"
                            aria-label={`${unreadCount} unread messages`}
                          />
                        ) : null}
                      </span>
                      <span className="conversation-row-preview">
                        {lastMessage ? (
                          <>
                            <strong>
                              {conversation.system
                                ? "System"
                                : (lastMessage.userId?.username ??
                                  "Unknown user")}
                              :
                            </strong>{" "}
                            {truncateMessage(lastMessage.body)}
                          </>
                        ) : (
                          "No messages yet."
                        )}
                      </span>
                    </span>
                    <span className="conversation-row-side">
                      {lastMessage ? (
                        <time
                          dateTime={new Date(lastMessage.created).toISOString()}
                        >
                          {formatDateTime(lastMessage.created)}
                        </time>
                      ) : null}
                      {unreadCount ? (
                        <span className="conversation-unread-count">
                          {unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ) : (
          <section className="messages-empty state-panel">
            <p>
              Your inbox is empty. Start a private conversation with another
              member.
            </p>
          </section>
        )}
      </ApiState>
    </main>
  );
}
