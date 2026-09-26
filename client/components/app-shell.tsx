"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { PluginBoundary, usePluginHost } from "@/components/plugin-host";
import {
  useI18n,
  localeNames,
  supportedLocales,
  type MessageKey,
} from "@/components/i18n-context";
import clientPackage from "@/package.json";
import {
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Download,
  Home,
  List,
  LogOut,
  LogIn,
  Languages,
  Menu,
  Mail,
  MessagesSquare,
  MessageSquarePlus,
  Moon,
  Newspaper,
  Puzzle,
  Rss,
  Search,
  ShieldCheck,
  Settings,
  Sun,
  UserPlus,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { useModerationQueue } from "@/hooks/use-moderation-queue";
import { NotificationsBell } from "@/components/notifications-bell";
import { useApiData } from "@/hooks/use-api-data";
import { canModerate } from "@/lib/api";
import { UserAvatar } from "@/components/user-avatar";

const primaryItems = [
  { label: "home", href: "/", icon: Home },
  { label: "browse", href: "/browse", icon: List },
  { label: "search", href: "/search", icon: Search },
  { label: "upload", href: "/upload", icon: Upload },
  { label: "announcements", href: "/announcements", icon: Newspaper },
  { label: "requests", href: "/requests", icon: MessageSquarePlus },
  { label: "forum", href: "/forum", icon: MessagesSquare },
  { label: "messages", href: "/messages", icon: Mail },
  { label: "rss", href: "/rss", icon: Rss },
  { label: "wiki", href: "/wiki", icon: BookOpen },
] as const;

const pageTitleRoutes: Array<[string, MessageKey]> = [
  ["/announcements", "announcements"],
  ["/bookmarks", "bookmarks"],
  ["/categories", "browse"],
  ["/forum", "forum"],
  ["/login", "login"],
  ["/messages", "messages"],
  ["/notifications", "notifications"],
  ["/moderation", "moderation"],
  ["/register", "register"],
  ["/reports", "moderation"],
  ["/requests", "requests"],
  ["/reset-password", "login"],
  ["/rss", "rss"],
  ["/search", "search"],
  ["/settings", "settings"],
  ["/stats", "moderation"],
  ["/tags", "browse"],
  ["/torrent", "torrent"],
  ["/upload", "upload"],
  ["/user", "profile"],
  ["/wiki", "wiki"],
  ["/account", "account"],
  ["/browse", "browse"],
];

function pageTitleKey(pathname: string): MessageKey {
  if (pathname === "/") return "home";
  return (
    pageTitleRoutes.find(([path]) => pathname.startsWith(path))?.[1] ?? "home"
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const plugins = usePluginHost();
  const { locale, setLocale, t } = useI18n();
  const { config } = useTrackerConfig();
  const unreadMessages = useUnreadMessages(Boolean(session));
  const moderationQueue = useModerationQueue(
    Boolean(session) && canModerate(session?.role),
  );
  const ownProfile = useApiData<{ avatarUpdated?: number }>(
    session ? "/account/profile" : null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("sq-theme");
    const dark = savedTheme ? savedTheme === "dark" : true;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    window.addEventListener("sq:profile", ownProfile.reload);
    return () => window.removeEventListener("sq:profile", ownProfile.reload);
  }, [ownProfile.reload]);

  useEffect(() => {
    const theme = config.customTheme ?? {};
    const root = document.documentElement;
    const variables: Record<string, string | undefined> = {
      "--accent": theme.primary,
      "--accent-hover": theme.primary,
      "--accent-soft": theme.primary
        ? `color-mix(in srgb, ${theme.primary} 12%, transparent)`
        : undefined,
      "--page": theme.background,
      "--sidebar": theme.sidebar,
      "--border": theme.border,
      "--text": theme.text,
      "--muted": theme.grey,
      "--content-max-width": `${Math.min(
        2560,
        Math.max(640, config.contentMaxWidth),
      )}px`,
    };
    for (const [property, value] of Object.entries(variables)) {
      if (value) root.style.setProperty(property, value);
      else root.style.removeProperty(property);
    }
  }, [config.customTheme, config.contentMaxWidth]);

  function toggleTheme() {
    const nextTheme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("sq-theme", nextTheme);
  }

  function submitGlobalSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = String(form.get("query") ?? "").trim();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const accountItems: Array<{
    label: string;
    href: string;
    icon: LucideIcon;
    badge?: number;
  }> =
    session
      ? [
          ...(canModerate(session.role)
            ? [
                {
                  label: t("moderation"),
                  href: "/moderation",
                  icon: ShieldCheck,
                  badge: moderationQueue,
                },
              ]
            : []),
          ...(session.role === "admin"
            ? [{ label: t("settings"), href: "/settings", icon: Settings }]
            : []),
        ]
      : [
          { label: t("login"), href: "/login", icon: LogIn },
          ...(config.allowRegister === "closed"
            ? []
            : [{ label: t("register"), href: "/register", icon: UserPlus }]),
        ];
  const visiblePrimaryItems = session ? primaryItems : [];

  const browserTitle = config.showPageInTitle
    ? `${config.siteName} • ${plugins.resolveTitle(pathname) ?? t(pageTitleKey(pathname))}`
    : config.siteName;

  return (
    <>
      <title>{browserTitle}</title>
      <div className="app-frame">
        <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
          <div className="brand-row">
            <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
              <span className="brand-mark" aria-hidden="true">
                <Download />
              </span>
              <span>{config.siteName}</span>
            </Link>
            <button
              className="mobile-close"
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label={t("closeNavigation")}
            >
              <X />
            </button>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {visiblePrimaryItems.map(({ label, href, icon: Icon }) => {
              const badge = label === "messages" ? unreadMessages : 0;
              return (
                <Link
                  className={`nav-link ${isActive(href) ? "active" : ""}`}
                  href={href}
                  key={label}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="nav-label">
                    {t(label)}
                    {badge > 0 ? (
                      <span
                        className="nav-badge"
                        aria-label={`${badge} unread ${label}`}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </span>
                  <Icon aria-hidden="true" />
                </Link>
              );
            })}
            {plugins.navigation.map((item) => {
              const Icon = item.icon ?? Puzzle;
              return (
                <PluginBoundary
                  key={`${item.pluginId}:${item.href}`}
                  pluginId={item.pluginId}
                  pluginName={item.pluginName}
                >
                  <Link
                    className={`nav-link ${isActive(item.href) ? "active" : ""}`}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{item.label}</span>
                    <Icon aria-hidden="true" />
                  </Link>
                </PluginBoundary>
              );
            })}
            {accountItems.map(({ label, href, icon: Icon, badge }) => (
              <Link
                className={`nav-link ${isActive(href) ? "active" : ""}`}
                href={href}
                key={label}
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-label">
                  {label}
                  {badge ? (
                    <span
                      className="nav-badge"
                      aria-label={`${badge} items awaiting moderation`}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
                <Icon aria-hidden="true" />
              </Link>
            ))}
            {session ? (
              <div className="sidebar-session-actions">
                <Link
                  className={`nav-link ${isActive(`/user/${session.username}`) ? "active" : ""}`}
                  href={`/user/${session.username}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span>{t("profile")}</span>
                  {ownProfile.data?.avatarUpdated ? (
                    <UserAvatar
                      username={session.username}
                      avatarUpdated={ownProfile.data.avatarUpdated}
                      className="nav-profile-avatar"
                      size={28}
                    />
                  ) : (
                    <CircleUserRound aria-hidden="true" />
                  )}
                </Link>
                <Link
                  className="nav-link logout-link"
                  href="/logout"
                  onClick={() => setMenuOpen(false)}
                >
                  <span>{t("logout")}</span>
                  <LogOut aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </nav>

          <footer className="sidebar-footer">
            <p>
              {t("poweredBy")} <span className="mini-mark" />{" "}
              <strong>sqtracker</strong>
            </p>
            <span>v{clientPackage.version}</span>
          </footer>
        </aside>

        {menuOpen && (
          <button
            className="sidebar-scrim"
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label={t("closeNavigation")}
          />
        )}

        <div
          className={`app-content${config.contentCentered ? " content-centered" : ""}`}
        >
          <header className="topbar">
            <button
              className="menu-button"
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("openNavigation")}
            >
              <Menu />
            </button>
            {session ? (
              <form className="global-search" onSubmit={submitGlobalSearch}>
                <Search aria-hidden="true" />
                <input
                  name="query"
                  type="search"
                  maxLength={200}
                  aria-label={t("searchTracker")}
                  placeholder={t("search")}
                />
              </form>
            ) : (
              <span className="topbar-spacer" />
            )}
            {session ? <NotificationsBell /> : null}
            <div className="language-menu">
              <button
                className="language-trigger"
                type="button"
                title={t("language")}
                aria-label={t("language")}
                aria-expanded={languageOpen}
                onClick={() => setLanguageOpen((open) => !open)}
              >
                <Languages aria-hidden="true" />
                <span>{locale.toUpperCase()}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {languageOpen ? (
                <div className="language-options" role="menu">
                  {supportedLocales.map((option) => (
                    <button
                      className={
                        option === locale
                          ? "language-option active"
                          : "language-option"
                      }
                      key={option}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setLocale(option);
                        setLanguageOpen(false);
                      }}
                    >
                      <span>{localeNames[option]}</span>
                      <strong>{option.toUpperCase()}</strong>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              className="theme-button"
              type="button"
              onClick={toggleTheme}
              aria-label={t("toggleTheme")}
            >
              <Moon className="moon-icon" aria-hidden="true" />
              <Sun className="sun-icon" aria-hidden="true" />
            </button>
          </header>
          {children}
        </div>
      </div>
    </>
  );
}
