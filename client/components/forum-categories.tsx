"use client";

import { FormEvent, useState } from "react";
import { MessageSquare, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { ApiState, PageHeader, SignInRequired } from "@/components/ui";
import { FeatureDisabled } from "@/components/feature-disabled";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { forumIcon } from "@/lib/forum-icons";
import { formatDateTime } from "@/lib/format";
import type { ForumCategory } from "@/lib/types";

export function ForumCategories() {
  const { session } = useAuth();
  const { config } = useTrackerConfig();
  const router = useRouter();
  const { data, error, loading } = useApiData<ForumCategory[]>(
    session ? "/forum/categories" : null,
  );
  const [query, setQuery] = useState("");

  if (!session) {
    return (
      <main className="page forum-page">
        <SignInRequired />
      </main>
    );
  }

  if (!config.forumEnabled) {
    return <FeatureDisabled name="Forum" />;
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/forum/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <main className="page forum-page forum-categories-page">
      <PageHeader
        title="Forum"
        actions={
          session.role === "admin" ? (
            <Link className="secondary-button button-link" href="/forum/admin">
              <Settings aria-hidden="true" /> Category settings
            </Link>
          ) : undefined
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
            placeholder="Search discussions"
            aria-label="Search forum"
          />
        </div>
        <button className="primary-button" type="submit">
          Search
        </button>
      </form>

      <section className="content-section forum-category-section">
        <ApiState
          loading={loading}
          error={error}
          empty={!loading && !error && !data?.length}
        >
          <div
            className="forum-index"
            role="table"
            aria-label="Forum categories"
          >
            <div className="forum-index-header" role="row">
              <span role="columnheader">Forum</span>
              <span role="columnheader">Topics</span>
              <span role="columnheader">Replies</span>
              <span role="columnheader">Last post</span>
            </div>
            <div className="forum-category-list" role="rowgroup">
              {data?.map((category) => {
                const Icon = forumIcon(category.icon);
                const latest = category.latestThread;
                const latestAuthor =
                  latest?.lastPost?.author?.username ??
                  latest?.author?.username;
                const latestTime = latest?.lastPost?.created ?? latest?.created;
                return (
                  <article
                    className="forum-category-card"
                    key={category._id}
                    role="row"
                  >
                    <div className="forum-board-icon" aria-hidden="true">
                      <Icon />
                    </div>
                    <div className="forum-category-main">
                      <h3>
                        <Link href={`/forum/category/${category._id}`}>
                          {category.name}
                        </Link>
                      </h3>
                      {category.description ? (
                        <p>{category.description}</p>
                      ) : null}
                    </div>
                    <div className="forum-count" role="cell">
                      <strong>{category.threadCount ?? 0}</strong>
                      <span>Topics</span>
                    </div>
                    <div className="forum-count" role="cell">
                      <strong>{category.postCount ?? 0}</strong>
                      <span>Replies</span>
                    </div>
                    <div className="forum-category-latest">
                      {latest ? (
                        <>
                          <span className="forum-category-latest-label">
                            <MessageSquare aria-hidden="true" /> Latest
                            discussion
                          </span>
                          <Link href={`/forum/thread/${latest._id}`}>
                            {latest.title}
                          </Link>
                          <small>
                            {latestAuthor ? `by ${latestAuthor} · ` : ""}
                            {formatDateTime(latestTime)}
                          </small>
                        </>
                      ) : (
                        <span>No discussions yet</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </ApiState>
      </section>
    </main>
  );
}
