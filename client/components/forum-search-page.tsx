"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, Lock, MessageSquare, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { Pager } from "@/components/pager";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { formatDateTime } from "@/lib/format";
import type { ForumThread, ForumThreadPage } from "@/lib/types";

type ForumSearchResults = Pick<
  ForumThreadPage,
  "total" | "page" | "pageSize"
> & {
  threads: ForumThread[];
};

export function ForumSearchPage({ initialQuery }: { initialQuery: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const queryValue = initialQuery.trim();
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(0);
  const { data, error, loading } = useApiData<ForumSearchResults>(
    session && queryValue
      ? `/forum/search?query=${encodeURIComponent(queryValue)}&page=${page}`
      : null,
  );

  if (!session) {
    return (
      <main className="page forum-page">
        <SignInRequired />
      </main>
    );
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/forum/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <main className="page forum-page forum-search-page">
      <PageHeader
        title="Search forum"
        actions={
          <Link className="secondary-button button-link" href="/forum">
            <ArrowLeft aria-hidden="true" /> Back to forum
          </Link>
        }
      />
      <form className="hero-search forum-search-form" onSubmit={search}>
        <div className="hero-search-field forum-search-field">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search thread titles and messages"
            aria-label="Search forum"
            autoFocus
          />
        </div>
        <button className="primary-button" type="submit">
          Search
        </button>
      </form>

      {!queryValue ? (
        <div className="state-panel state-panel-centered forum-search-prompt">
          Enter a word or phrase to search forum discussions.
        </div>
      ) : (
        <section className="content-section forum-search-results">
          <h2 className="section-title">
            Results for &quot;{queryValue}&quot;
          </h2>
          <ApiState loading={loading} error={error} empty={false}>
            {data?.threads.length ? (
              <div className="forum-thread-list">
                {data.threads.map((thread) => {
                  const category =
                    typeof thread.category === "string"
                      ? null
                      : thread.category;
                  const lastAuthor =
                    thread.lastPost?.author?.username ??
                    thread.author?.username;
                  return (
                    <article
                      className="forum-thread-row forum-search-result"
                      key={thread._id}
                    >
                      <div className="forum-topic-icon">
                        {thread.locked ? (
                          <Lock aria-label="Locked" />
                        ) : (
                          <MessageSquare aria-hidden="true" />
                        )}
                      </div>
                      <div className="forum-thread-summary">
                        <h3>
                          <Link href={`/forum/thread/${thread._id}`}>
                            {thread.title}
                          </Link>
                        </h3>
                        <p>
                          {category ? (
                            <Link href={`/forum/category/${category._id}`}>
                              {category.name}
                            </Link>
                          ) : (
                            "Unknown category"
                          )}
                          {" · by "}
                          {thread.author?.username ?? "Unknown"}
                        </p>
                      </div>
                      <div className="forum-count">
                        <strong>{thread.postCount}</strong>
                        <span>Replies</span>
                      </div>
                      <div className="forum-thread-activity">
                        <span>Last activity</span>
                        <small>
                          {lastAuthor ? `by ${lastAuthor} · ` : ""}
                          {formatDateTime(
                            thread.lastPost?.created ?? thread.updated,
                          )}
                        </small>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="state-panel state-panel-centered forum-search-empty">
                No discussions matched this search. Try a broader word or
                phrase.
              </div>
            )}
            {data ? (
              <Pager
                page={page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
              />
            ) : null}
          </ApiState>
        </section>
      )}
    </main>
  );
}
