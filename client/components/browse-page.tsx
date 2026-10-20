"use client";

import Link from "next/link";
import { BookOpen, Boxes, Film, Gamepad2, MonitorCog, Music2, Tv, type LucideIcon } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { PageHeader, SignInRequired } from "@/components/ui";
import { configCategoryOptions, type CategoryOption } from "@/lib/categories";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { useI18n } from "@/components/i18n-context";

const fallbackCategories: CategoryOption[] = [
  { name: "Movies", slug: "movies", sources: ["bluray", "webdl", "hdrip", "webrip", "dvd", "cam"] },
  { name: "TV", slug: "tv", sources: [] },
  { name: "Books", slug: "books", sources: [] },
  { name: "Music", slug: "music", sources: [] },
  { name: "Games", slug: "games", sources: [] },
  { name: "Software", slug: "software", sources: [] },
];

const categoryIcons: Record<string, LucideIcon> = {
  movies: Film,
  tv: Tv,
  books: BookOpen,
  music: Music2,
  games: Gamepad2,
  software: MonitorCog,
};

export function BrowsePage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const { config } = useTrackerConfig();
  if (!session) return <main className="page"><SignInRequired /></main>;
  const categories = configCategoryOptions(config.categories, fallbackCategories).map(
    ({ name, slug }) => ({ name, slug, icon: categoryIcons[slug] ?? Boxes }),
  );
  const allCards = [{ name: t("all"), slug: "all", icon: Boxes }, ...categories];

  return (
    <main className="page">
      <PageHeader title={t("browse")} />
      <section className="category-grid">
        {allCards.map(({ name, slug, icon: Icon }) => (
          <Link className="category-card" href={`/categories/${slug}`} key={slug}>
            <Icon aria-hidden="true" />
            <span>{name}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
