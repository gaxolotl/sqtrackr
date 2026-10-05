"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { PluginSettings } from "@/components/plugin-settings";
import {
  ActionMessage,
  ApiState,
  Field,
  PageHeader,
  SignInRequired,
} from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { useTrackerConfig } from "@/hooks/use-tracker-config";
import { usePluginHost } from "@/components/plugin-host";
import { apiFetch } from "@/lib/api";
import {
  mergeTorrentActionOrder,
  moveActionKey,
  torrentActionLabel,
} from "@/lib/torrents";

type AdminSettings = {
  SQ_SITE_NAME: string;
  SQ_SITE_DESCRIPTION: string;
  SQ_SHOW_PAGE_IN_TITLE: boolean;
  SQ_CONTENT_CENTERED: boolean;
  SQ_CONTENT_MAX_WIDTH: number;
  SQ_SHORTEN_MATCHED_TORRENT_NAMES: boolean;
  SQ_TORRENT_NAME_MAX_LENGTH: number;
  SQ_CONTENT_TITLE_MAX_LENGTH: number;
  SQ_CONTENT_BODY_MAX_LENGTH: number;
  SQ_COMMENT_MAX_LENGTH: number;
  SQ_MESSAGE_MAX_LENGTH: number;
  SQ_PROFILE_BIO_MAX_LENGTH: number;
  SQ_PROFILE_LOCATION_MAX_LENGTH: number;
  SQ_MEDIA_INFO_MAX_LENGTH: number;
  SQ_TORRENT_TAGS_MAX_LENGTH: number;
  SQ_TORRENT_FILE_MAX_SIZE_KB: number;
  SQ_ALLOW_REGISTER: "open" | "invite" | "closed";
  SQ_ALLOW_ANONYMOUS_UPLOADS: boolean;
  SQ_TORRENT_PREMODERATION: boolean;
  SQ_MINIMUM_RATIO: number;
  SQ_MAXIMUM_HIT_N_RUNS: number;
  SQ_MIN_SEEDTIME_HOURS: number;
  SQ_HNR_GRACE_HOURS: number;
  SQ_TORRENT_CATEGORIES: Record<string, string[]>;
  SQ_BP_EARNED_PER_GB: number;
  SQ_BP_EARNED_PER_FILLED_REQUEST: number;
  SQ_BP_COST_PER_INVITE: number;
  SQ_BP_COST_PER_GB: number;
  SQ_SITE_WIDE_FREELEECH: boolean;
  SQ_ALLOW_UNREGISTERED_VIEW: boolean;
  SQ_EXTENSION_BLACKLIST: string[];
  SQ_CLIENT_BLACKLIST: string[];
  SQ_SITE_DEFAULT_LOCALE: string;
  SQ_CUSTOM_THEME: Record<string, string>;
  SQ_AVATAR_MAX_RESOLUTION: number;
  SQ_AVATAR_MAX_SIZE_KB: number;
  SQ_ALLOW_GIF_AVATARS: boolean;
  SQ_ENABLE_RSS_READERS: boolean;
  SQ_TORRENT_ACTION_ORDER: string[];
};

const numberFields = [
  "SQ_MINIMUM_RATIO",
  "SQ_MAXIMUM_HIT_N_RUNS",
  "SQ_MIN_SEEDTIME_HOURS",
  "SQ_HNR_GRACE_HOURS",
  "SQ_BP_EARNED_PER_GB",
  "SQ_BP_EARNED_PER_FILLED_REQUEST",
  "SQ_BP_COST_PER_INVITE",
  "SQ_BP_COST_PER_GB",
  "SQ_AVATAR_MAX_RESOLUTION",
  "SQ_AVATAR_MAX_SIZE_KB",
  "SQ_CONTENT_MAX_WIDTH",
  "SQ_TORRENT_NAME_MAX_LENGTH",
  "SQ_CONTENT_TITLE_MAX_LENGTH",
  "SQ_CONTENT_BODY_MAX_LENGTH",
  "SQ_COMMENT_MAX_LENGTH",
  "SQ_MESSAGE_MAX_LENGTH",
  "SQ_PROFILE_BIO_MAX_LENGTH",
  "SQ_PROFILE_LOCATION_MAX_LENGTH",
  "SQ_MEDIA_INFO_MAX_LENGTH",
  "SQ_TORRENT_TAGS_MAX_LENGTH",
  "SQ_TORRENT_FILE_MAX_SIZE_KB",
] as const;

const contentLimitFields: Array<{
  name: (typeof numberFields)[number];
  label: string;
  min: number;
  max: number;
}> = [
  { name: "SQ_TORRENT_NAME_MAX_LENGTH", label: "Torrent name characters", min: 20, max: 1000 },
  { name: "SQ_CONTENT_TITLE_MAX_LENGTH", label: "Title characters", min: 20, max: 500 },
  { name: "SQ_CONTENT_BODY_MAX_LENGTH", label: "Long-form body characters", min: 500, max: 200000 },
  { name: "SQ_COMMENT_MAX_LENGTH", label: "Comment and report characters", min: 100, max: 50000 },
  { name: "SQ_MESSAGE_MAX_LENGTH", label: "Private message characters", min: 500, max: 100000 },
  { name: "SQ_PROFILE_BIO_MAX_LENGTH", label: "Profile bio characters", min: 50, max: 5000 },
  { name: "SQ_PROFILE_LOCATION_MAX_LENGTH", label: "Profile location characters", min: 20, max: 300 },
  { name: "SQ_MEDIA_INFO_MAX_LENGTH", label: "MediaInfo characters", min: 1000, max: 500000 },
  { name: "SQ_TORRENT_TAGS_MAX_LENGTH", label: "Torrent tag input characters", min: 50, max: 5000 },
  { name: "SQ_TORRENT_FILE_MAX_SIZE_KB", label: ".torrent file size (KB)", min: 64, max: 10240 },
];

export function SettingsPage() {
  const { session } = useAuth();
  const { updateConfig } = useTrackerConfig();
  const settings = useApiData<AdminSettings>(
    session?.role === "admin" ? "/admin/settings" : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"main" | "plugins">("main");
  const mainTab = useRef<HTMLButtonElement>(null);
  const pluginsTab = useRef<HTMLButtonElement>(null);
  const [editorSource, setEditorSource] = useState<AdminSettings | null>(null);
  const [categories, setCategories] = useState<
    Array<{ name: string; sources: string[] }>
  >([]);
  const [blockedExtensions, setBlockedExtensions] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newSource, setNewSource] = useState<Record<number, string>>({});
  const [newExtension, setNewExtension] = useState("");
  const [blockedClients, setBlockedClients] = useState<string[]>([]);
  const [newClient, setNewClient] = useState("");
  const [actionOrder, setActionOrder] = useState<string[]>([]);
  const pluginHost = usePluginHost();
  const activePluginIds = pluginHost.enabledManifests.map(
    (manifest) => manifest.id,
  );
  const visibleActionOrder = mergeTorrentActionOrder(
    actionOrder,
    activePluginIds,
  );
  const pluginNames = new Map(
    pluginHost.enabledManifests.map((manifest) => [manifest.id, manifest.name]),
  );
  const [themeColors, setThemeColors] = useState<Record<string, string> | null>(
    null,
  );

  // Sync the editors when fresh settings arrive (initial load or after save).
  if (settings.data && editorSource !== settings.data) {
    setEditorSource(settings.data);
    setCategories(
      Object.entries(settings.data.SQ_TORRENT_CATEGORIES).map(
        ([name, sources]) => ({ name, sources: [...sources] }),
      ),
    );
    setBlockedExtensions([...settings.data.SQ_EXTENSION_BLACKLIST]);
    setBlockedClients([...(settings.data.SQ_CLIENT_BLACKLIST ?? [])]);
    setActionOrder([
      ...(settings.data.SQ_TORRENT_ACTION_ORDER ?? []),
    ]);
    setThemeColors({ ...settings.data.SQ_CUSTOM_THEME });
  }
  const editorsReady = editorSource !== null && themeColors !== null;

  function handleTabKey(
    event: KeyboardEvent<HTMLButtonElement>,
    tab: "main" | "plugins",
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "main"
        : event.key === "End"
          ? "plugins"
          : tab === "main"
            ? "plugins"
            : "main";
    setActiveTab(next);
    (next === "main" ? mainTab : pluginsTab).current?.focus();
  }

  if (!session)
    return (
      <main className="page">
        <SignInRequired />
      </main>
    );
  if (session.role !== "admin")
    return (
      <main className="page">
        <div className="state-panel error">
          Only admins can access site settings.
        </div>
      </main>
    );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings.data) return;
    if (!editorsReady) {
      setError("Settings are still loading. Please try again.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const categoryRecord: Record<string, string[]> = {};
      for (const category of categories) {
        const name = category.name.trim();
        if (!name) {
          setError("Category names cannot be empty.");
          setSaving(false);
          return;
        }
        if (categoryRecord[name] !== undefined) {
          setError(`Duplicate category "${name}".`);
          setSaving(false);
          return;
        }
        const sources = category.sources
          .map((source) => source.trim())
          .filter(Boolean);
        if (new Set(sources).size !== sources.length) {
          setError(`Sources in category "${name}" must be unique.`);
          setSaving(false);
          return;
        }
        categoryRecord[name] = sources;
      }
      const customTheme = Object.fromEntries(
        ["primary", "background", "sidebar", "border", "text", "grey"]
          .map((key) => [key, String(form.get(`theme_${key}`) ?? "").trim()])
          .filter(([, value]) => value),
      );
      const next: AdminSettings = {
        ...settings.data,
        SQ_SITE_NAME: String(form.get("SQ_SITE_NAME")),
        SQ_SITE_DESCRIPTION: String(form.get("SQ_SITE_DESCRIPTION")),
        SQ_ALLOW_REGISTER: String(
          form.get("SQ_ALLOW_REGISTER"),
        ) as AdminSettings["SQ_ALLOW_REGISTER"],
        SQ_SITE_DEFAULT_LOCALE: String(form.get("SQ_SITE_DEFAULT_LOCALE")),
        SQ_TORRENT_CATEGORIES: categoryRecord,
        SQ_EXTENSION_BLACKLIST: blockedExtensions,
        SQ_CLIENT_BLACKLIST: blockedClients,
        SQ_CUSTOM_THEME: customTheme,
        SQ_ALLOW_ANONYMOUS_UPLOADS: form.has("SQ_ALLOW_ANONYMOUS_UPLOADS"),
        SQ_TORRENT_PREMODERATION: form.has("SQ_TORRENT_PREMODERATION"),
        SQ_SHOW_PAGE_IN_TITLE: form.has("SQ_SHOW_PAGE_IN_TITLE"),
        SQ_CONTENT_CENTERED: form.has("SQ_CONTENT_CENTERED"),
        SQ_SHORTEN_MATCHED_TORRENT_NAMES: form.has(
          "SQ_SHORTEN_MATCHED_TORRENT_NAMES",
        ),
        SQ_SITE_WIDE_FREELEECH: form.has("SQ_SITE_WIDE_FREELEECH"),
        SQ_ALLOW_UNREGISTERED_VIEW: form.has("SQ_ALLOW_UNREGISTERED_VIEW"),
        SQ_ALLOW_GIF_AVATARS: form.has("SQ_ALLOW_GIF_AVATARS"),
        SQ_ENABLE_RSS_READERS: form.has("SQ_ENABLE_RSS_READERS"),
        SQ_TORRENT_ACTION_ORDER: visibleActionOrder.slice(0, 50),
      };
      for (const key of numberFields) next[key] = Number(form.get(key));
      const saved = await apiFetch<AdminSettings>("/admin/settings", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      settings.setData(saved);
      setNewCategory("");
      setNewSource({});
      setNewExtension("");
      updateConfig({
        siteName: saved.SQ_SITE_NAME,
        siteDescription: saved.SQ_SITE_DESCRIPTION,
        showPageInTitle: saved.SQ_SHOW_PAGE_IN_TITLE,
        contentCentered: saved.SQ_CONTENT_CENTERED,
        contentMaxWidth: saved.SQ_CONTENT_MAX_WIDTH,
        shortenMatchedTorrentNames: saved.SQ_SHORTEN_MATCHED_TORRENT_NAMES,
        contentLimits: {
          torrentName: saved.SQ_TORRENT_NAME_MAX_LENGTH,
          title: saved.SQ_CONTENT_TITLE_MAX_LENGTH,
          body: saved.SQ_CONTENT_BODY_MAX_LENGTH,
          comment: saved.SQ_COMMENT_MAX_LENGTH,
          message: saved.SQ_MESSAGE_MAX_LENGTH,
          profileBio: saved.SQ_PROFILE_BIO_MAX_LENGTH,
          profileLocation: saved.SQ_PROFILE_LOCATION_MAX_LENGTH,
          mediaInfo: saved.SQ_MEDIA_INFO_MAX_LENGTH,
          torrentTags: saved.SQ_TORRENT_TAGS_MAX_LENGTH,
          torrentFileSizeKb: saved.SQ_TORRENT_FILE_MAX_SIZE_KB,
        },
        allowRegister: saved.SQ_ALLOW_REGISTER,
        allowAnonymousUploads: saved.SQ_ALLOW_ANONYMOUS_UPLOADS,
        torrentPremoderation: saved.SQ_TORRENT_PREMODERATION,
        categories: saved.SQ_TORRENT_CATEGORIES,
        siteWideFreeleech: saved.SQ_SITE_WIDE_FREELEECH,
        allowUnregisteredView: saved.SQ_ALLOW_UNREGISTERED_VIEW,
        defaultLocale: saved.SQ_SITE_DEFAULT_LOCALE,
        customTheme: saved.SQ_CUSTOM_THEME,
        avatarMaxResolution: saved.SQ_AVATAR_MAX_RESOLUTION,
        avatarMaxSizeKb: saved.SQ_AVATAR_MAX_SIZE_KB,
        allowGifAvatars: saved.SQ_ALLOW_GIF_AVATARS,
        rssReadersEnabled: saved.SQ_ENABLE_RSS_READERS,
        torrentActionOrder: saved.SQ_TORRENT_ACTION_ORDER,
      });
      setMessage("Site settings saved and applied.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page settings-page">
      <PageHeader
        title="Site settings"
        info="Runtime-safe changes apply immediately and persist in the database."
      />
      <div className="settings-tabs" role="tablist" aria-label="Site settings">
        <button
          ref={mainTab}
          id="main-settings-tab"
          type="button"
          role="tab"
          aria-controls="main-settings-panel"
          aria-selected={activeTab === "main"}
          tabIndex={activeTab === "main" ? 0 : -1}
          onClick={() => setActiveTab("main")}
          onKeyDown={(event) => handleTabKey(event, "main")}
        >
          Main settings
        </button>
        <button
          ref={pluginsTab}
          id="plugin-settings-tab"
          type="button"
          role="tab"
          aria-controls="plugin-settings-panel"
          aria-selected={activeTab === "plugins"}
          tabIndex={activeTab === "plugins" ? 0 : -1}
          onClick={() => setActiveTab("plugins")}
          onKeyDown={(event) => handleTabKey(event, "plugins")}
        >
          Plugins
        </button>
      </div>
      <section
        id="main-settings-panel"
        role="tabpanel"
        aria-labelledby="main-settings-tab"
        hidden={activeTab !== "main"}
      >
        <ActionMessage message={message} error={error} />
        <ApiState
          loading={settings.loading}
          error={settings.error}
          empty={!settings.data}
        >
          {settings.data ? (
            <form className="settings-form" onSubmit={save}>
            <section className="account-section">
              <h2>Identity and access</h2>
              <div className="settings-grid">
                <Field
                  label="Site name"
                  hint="Used in the sidebar and browser tabs."
                >
                  <input
                    name="SQ_SITE_NAME"
                    defaultValue={settings.data.SQ_SITE_NAME}
                    maxLength={20}
                    required
                  />
                </Field>
                <Field label="Default locale">
                  <select
                    name="SQ_SITE_DEFAULT_LOCALE"
                    defaultValue={settings.data.SQ_SITE_DEFAULT_LOCALE}
                  >
                    {["en", "bg", "es", "it", "ru", "de", "zh", "eo", "fr"].map(
                      (locale) => (
                        <option key={locale} value={locale}>
                          {locale.toUpperCase()}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Site description">
                  <input
                    name="SQ_SITE_DESCRIPTION"
                    defaultValue={settings.data.SQ_SITE_DESCRIPTION}
                    maxLength={80}
                    required
                  />
                </Field>
                <Field label="Registration">
                  <select
                    name="SQ_ALLOW_REGISTER"
                    defaultValue={settings.data.SQ_ALLOW_REGISTER}
                  >
                    <option value="open">Open</option>
                    <option value="invite">Invite only</option>
                    <option value="closed">Closed</option>
                  </select>
                </Field>
              </div>
              <div className="settings-checks">
                <label>
                  <input
                    name="SQ_SHOW_PAGE_IN_TITLE"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_SHOW_PAGE_IN_TITLE}
                  />
                  Show the localized page name in browser tabs
                </label>
              </div>
            </section>

            <section className="account-section">
              <h2>Content layout</h2>
              <p>Control the alignment and desktop width of page content.</p>
              <div className="settings-grid">
                <Field
                  label="Maximum content width (px)"
                  hint="Applies to page headers, tables, forms, forums, and detail cards."
                >
                  <input
                    name="SQ_CONTENT_MAX_WIDTH"
                    type="number"
                    min="640"
                    max="2560"
                    step="10"
                    defaultValue={settings.data.SQ_CONTENT_MAX_WIDTH}
                    required
                  />
                </Field>
              </div>
              <div className="settings-checks">
                <label>
                  <input
                    name="SQ_CONTENT_CENTERED"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_CONTENT_CENTERED}
                  />{" "}
                  Center page content
                </label>
                <label>
                  <input
                    name="SQ_SHORTEN_MATCHED_TORRENT_NAMES"
                    type="checkbox"
                    defaultChecked={
                      settings.data.SQ_SHORTEN_MATCHED_TORRENT_NAMES
                    }
                  />{" "}
                  Shorten matched torrent names to movie and TV titles
                </label>
              </div>
            </section>

            <section className="account-section">
              <h2>Content limits</h2>
              <p>
                Maximum lengths are enforced in both the browser and API.
                Security identifiers and search queries keep fixed limits.
              </p>
              <div className="settings-grid">
                {contentLimitFields.map((field) => (
                  <Field label={field.label} key={field.name}>
                    <input
                      name={field.name}
                      type="number"
                      min={field.min}
                      max={field.max}
                      defaultValue={settings.data![field.name]}
                      required
                    />
                  </Field>
                ))}
              </div>
            </section>

            <section className="account-section">
              <h2>Tracker rules</h2>
              <div className="settings-grid">
                <Field label="Minimum ratio (-1 disables)">
                  <input
                    name="SQ_MINIMUM_RATIO"
                    type="number"
                    step="0.01"
                    min="-1"
                    defaultValue={settings.data.SQ_MINIMUM_RATIO}
                    required
                  />
                </Field>
                <Field label="Maximum hit 'n' runs (-1 disables)">
                  <input
                    name="SQ_MAXIMUM_HIT_N_RUNS"
                    type="number"
                    min="-1"
                    defaultValue={settings.data.SQ_MAXIMUM_HIT_N_RUNS}
                    required
                  />
                </Field>
                <Field label="Minimum seedtime hours">
                  <input
                    name="SQ_MIN_SEEDTIME_HOURS"
                    type="number"
                    min="0"
                    defaultValue={settings.data.SQ_MIN_SEEDTIME_HOURS}
                    required
                  />
                </Field>
                <Field label="Hit 'n' run grace hours">
                  <input
                    name="SQ_HNR_GRACE_HOURS"
                    type="number"
                    min="0"
                    defaultValue={settings.data.SQ_HNR_GRACE_HOURS}
                    required
                  />
                </Field>
              </div>
              <div className="settings-checks">
                <label>
                  <input
                    name="SQ_ALLOW_ANONYMOUS_UPLOADS"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_ALLOW_ANONYMOUS_UPLOADS}
                  />{" "}
                  Allow anonymous uploads
                </label>
                <label>
                  <input
                    name="SQ_TORRENT_PREMODERATION"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_TORRENT_PREMODERATION}
                  />{" "}
                  Require staff approval for user uploads
                </label>
                <label>
                  <input
                    name="SQ_SITE_WIDE_FREELEECH"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_SITE_WIDE_FREELEECH}
                  />{" "}
                  Site-wide freeleech
                </label>
                <label>
                  <input
                    name="SQ_ALLOW_UNREGISTERED_VIEW"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_ALLOW_UNREGISTERED_VIEW}
                  />{" "}
                  Public torrent and wiki viewing
                </label>
              </div>
              <div className="field">
                <span>Torrent categories</span>
                <small>
                  Categories uploaders pick from, each with its own source
                  list. Reorder with the arrow buttons.
                </small>
                <div className="category-editor">
                  {categories.map((category, index) => (
                    <div className="category-edit-card" key={index}>
                      <div className="category-edit-head">
                        <input
                          aria-label={`Category ${index + 1} name`}
                          value={category.name}
                          maxLength={60}
                          onChange={(event) => {
                            const name = event.target.value;
                            setCategories((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, name }
                                  : entry,
                              ),
                            );
                          }}
                        />
                        <div className="category-edit-order">
                          <button
                            className="icon-action compact-button"
                            type="button"
                            disabled={index === 0}
                            onClick={() =>
                              setCategories((current) => {
                                const next = [...current];
                                [next[index - 1], next[index]] = [
                                  next[index],
                                  next[index - 1],
                                ];
                                return next;
                              })
                            }
                            aria-label={`Move ${category.name || "category"} up`}
                          >
                            <ArrowUp aria-hidden="true" />
                          </button>
                          <button
                            className="icon-action compact-button"
                            type="button"
                            disabled={index === categories.length - 1}
                            onClick={() =>
                              setCategories((current) => {
                                const next = [...current];
                                [next[index + 1], next[index]] = [
                                  next[index],
                                  next[index + 1],
                                ];
                                return next;
                              })
                            }
                            aria-label={`Move ${category.name || "category"} down`}
                          >
                            <ArrowDown aria-hidden="true" />
                          </button>
                          <button
                            className="icon-action compact-button danger-action"
                            type="button"
                            onClick={() =>
                              setCategories((current) =>
                                current.filter((_, entryIndex) => entryIndex !== index),
                              )
                            }
                            aria-label={`Delete ${category.name || "category"}`}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      {category.sources.length ? (
                        <ul className="source-list">
                          {category.sources.map((source, sourceIndex) => (
                            <li className="source-row" key={sourceIndex}>
                              <span>{source}</span>
                              <button
                                className="icon-action compact-button"
                                type="button"
                                onClick={() =>
                                  setCategories((current) =>
                                    current.map((entry, entryIndex) =>
                                      entryIndex === index
                                        ? {
                                            ...entry,
                                            sources: entry.sources.filter(
                                              (_, candidate) =>
                                                candidate !== sourceIndex,
                                            ),
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                aria-label={`Remove source ${source}`}
                              >
                                <X aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="source-empty">No sources yet.</p>
                      )}
                      <div className="source-add">
                        <input
                          aria-label={`New source for ${category.name || "category"}`}
                          placeholder="New source"
                          maxLength={60}
                          value={newSource[index] ?? ""}
                          onChange={(event) =>
                            setNewSource((current) => ({
                              ...current,
                              [index]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            const value = (newSource[index] ?? "").trim();
                            if (!value) return;
                            setCategories((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, sources: [...entry.sources, value] }
                                  : entry,
                              ),
                            );
                            setNewSource((current) => ({ ...current, [index]: "" }));
                          }}
                        />
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => {
                            const value = (newSource[index] ?? "").trim();
                            if (!value) return;
                            setCategories((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, sources: [...entry.sources, value] }
                                  : entry,
                              ),
                            );
                            setNewSource((current) => ({ ...current, [index]: "" }));
                          }}
                        >
                          <Plus aria-hidden="true" /> Add source
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="source-add">
                    <input
                      aria-label="New category name"
                      placeholder="New category"
                      maxLength={60}
                      value={newCategory}
                      onChange={(event) => setNewCategory(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        const value = newCategory.trim();
                        if (!value) return;
                        setCategories((current) => [
                          ...current,
                          { name: value, sources: [] },
                        ]);
                        setNewCategory("");
                      }}
                    />
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => {
                        const value = newCategory.trim();
                        if (!value) return;
                        setCategories((current) => [
                          ...current,
                          { name: value, sources: [] },
                        ]);
                        setNewCategory("");
                      }}
                    >
                      <Plus aria-hidden="true" /> Add category
                    </button>
                  </div>
                </div>
              </div>
              <div className="field">
                <span>Blocked file extensions</span>
                <small>
                  Torrents containing files with these extensions fail to
                  upload. The leading dot is added automatically.
                </small>
                {blockedExtensions.length ? (
                  <ul className="source-list">
                    {blockedExtensions.map((extension) => (
                      <li className="source-row" key={extension}>
                        <span>.{extension}</span>
                        <button
                          className="icon-action compact-button"
                          type="button"
                          onClick={() =>
                            setBlockedExtensions((current) =>
                              current.filter((candidate) => candidate !== extension),
                            )
                          }
                          aria-label={`Remove blocked extension ${extension}`}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="source-empty">No blocked extensions.</p>
                )}
                <div className="source-add">
                  <input
                    aria-label="New blocked extension"
                    placeholder="exe"
                    maxLength={20}
                    value={newExtension}
                    onChange={(event) => setNewExtension(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      const value = newExtension
                        .trim()
                        .toLowerCase()
                        .replace(/^\./, "");
                      if (!value || blockedExtensions.includes(value)) return;
                      setBlockedExtensions((current) => [...current, value]);
                      setNewExtension("");
                    }}
                  />
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => {
                      const value = newExtension
                        .trim()
                        .toLowerCase()
                        .replace(/^\./, "");
                      if (!value || blockedExtensions.includes(value)) return;
                      setBlockedExtensions((current) => [...current, value]);
                      setNewExtension("");
                    }}
                  >
                    <Plus aria-hidden="true" /> Add extension
                  </button>
                </div>
              </div>
              <div className="field">
                <span>Banned client prefixes</span>
                <small>
                  Announces from clients whose peer ID starts with one of
                  these prefixes are denied. Example: -AZ3020-
                </small>
                {blockedClients.length ? (
                  <ul className="source-list">
                    {blockedClients.map((client) => (
                      <li className="source-row" key={client}>
                        <span>{client}</span>
                        <button
                          className="icon-action compact-button"
                          type="button"
                          onClick={() =>
                            setBlockedClients((current) =>
                              current.filter((candidate) => candidate !== client),
                            )
                          }
                          aria-label={`Remove banned client ${client}`}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="source-empty">No banned clients.</p>
                )}
                <div className="source-add">
                  <input
                    aria-label="New banned client prefix"
                    placeholder="-AZ3020-"
                    maxLength={20}
                    value={newClient}
                    onChange={(event) => setNewClient(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      const value = newClient.trim();
                      if (!value || blockedClients.includes(value)) return;
                      setBlockedClients((current) => [...current, value]);
                      setNewClient("");
                    }}
                  />
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => {
                      const value = newClient.trim();
                      if (!value || blockedClients.includes(value)) return;
                      setBlockedClients((current) => [...current, value]);
                      setNewClient("");
                    }}
                  >
                    <Plus aria-hidden="true" /> Add client
                  </button>
                </div>
              </div>
            </section>

            <section className="account-section">
              <h2>Bonus economy</h2>
              <div className="settings-grid">
                <Field label="Points earned per GB">
                  <input
                    name="SQ_BP_EARNED_PER_GB"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={settings.data.SQ_BP_EARNED_PER_GB}
                    required
                  />
                </Field>
                <Field label="Points per filled request">
                  <input
                    name="SQ_BP_EARNED_PER_FILLED_REQUEST"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={settings.data.SQ_BP_EARNED_PER_FILLED_REQUEST}
                    required
                  />
                </Field>
                <Field label="Invite cost">
                  <input
                    name="SQ_BP_COST_PER_INVITE"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={settings.data.SQ_BP_COST_PER_INVITE}
                    required
                  />
                </Field>
                <Field label="Upload GB cost">
                  <input
                    name="SQ_BP_COST_PER_GB"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={settings.data.SQ_BP_COST_PER_GB}
                    required
                  />
                </Field>
              </div>
            </section>

            <section className="account-section">
              <h2>Profile pictures</h2>
              <p>Every upload is resized as needed and stored as WebP.</p>
              <div className="settings-grid">
                <Field label="Maximum resolution (px)">
                  <input
                    name="SQ_AVATAR_MAX_RESOLUTION"
                    type="number"
                    min="64"
                    max="2048"
                    defaultValue={settings.data.SQ_AVATAR_MAX_RESOLUTION}
                    required
                  />
                </Field>
                <Field label="Maximum stored size (KB)">
                  <input
                    name="SQ_AVATAR_MAX_SIZE_KB"
                    type="number"
                    min="32"
                    max="5120"
                    defaultValue={settings.data.SQ_AVATAR_MAX_SIZE_KB}
                    required
                  />
                </Field>
              </div>
              <div className="settings-checks">
                <label>
                  <input
                    name="SQ_ALLOW_GIF_AVATARS"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_ALLOW_GIF_AVATARS}
                  />{" "}
                  Allow animated GIF uploads
                </label>
              </div>
            </section>

            <section className="account-section">
              <h2>RSS</h2>
              <p>
                Control the shortcuts that help users add their private feed
                to a feed reader.
              </p>
              <div className="settings-checks">
                <label>
                  <input
                    name="SQ_ENABLE_RSS_READERS"
                    type="checkbox"
                    defaultChecked={settings.data.SQ_ENABLE_RSS_READERS}
                  />{" "}
                  Show feed reader shortcuts
                </label>
              </div>
            </section>

            <section className="account-section">
              <h2>Torrent actions</h2>
              <p>
                Button order for the actions row on torrent pages. Reorder
                with the arrow buttons. Plugin buttons appear here while
                their plugin is installed.
              </p>
              <ul className="source-list">
                {visibleActionOrder.map((key, index) => (
                  <li className="source-row" key={key}>
                    <span>
                      {torrentActionLabel(
                        key,
                        key.startsWith("plugin:")
                          ? pluginNames.get(key.slice(7))
                          : undefined,
                      )}
                    </span>
                    <div className="category-edit-order">
                      <button
                        className="icon-action compact-button"
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                          setActionOrder((current) =>
                            moveActionKey(
                              mergeTorrentActionOrder(
                                current,
                                activePluginIds,
                              ),
                              index,
                              -1,
                            ),
                          )
                        }
                        aria-label={`Move ${key} up`}
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        className="icon-action compact-button"
                        type="button"
                        disabled={index === visibleActionOrder.length - 1}
                        onClick={() =>
                          setActionOrder((current) =>
                            moveActionKey(
                              mergeTorrentActionOrder(
                                current,
                                activePluginIds,
                              ),
                              index,
                              1,
                            ),
                          )
                        }
                        aria-label={`Move ${key} down`}
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="account-section">
              <h2>Theme</h2>
              <p>
                Pick a colour with the swatch or type a hex value. Only the
                primary colour is required; leave the rest empty for the
                default light and dark themes.
              </p>
              <div className="settings-grid color-settings">
                {[
                  "primary",
                  "background",
                  "sidebar",
                  "border",
                  "text",
                  "grey",
                ].map((key) => {
                  const value = themeColors?.[key] ?? "";
                  const swatch = /^#[a-fA-F0-9]{6}$/.test(value)
                    ? value
                    : key === "primary"
                      ? "#f45d48"
                      : "#000000";
                  return (
                    <Field label={key[0].toUpperCase() + key.slice(1)} key={key}>
                      <div className="color-row">
                        <input
                          type="color"
                          value={swatch}
                          onChange={(event) =>
                            setThemeColors((current) => ({
                              ...(current ?? {}),
                              [key]: event.target.value,
                            }))
                          }
                          aria-label={`Pick ${key} colour`}
                        />
                        <input
                          name={`theme_${key}`}
                          type="text"
                          pattern="#[a-fA-F0-9]{6}"
                          placeholder="#000000"
                          value={value}
                          onChange={(event) =>
                            setThemeColors((current) => ({
                              ...(current ?? {}),
                              [key]: event.target.value,
                            }))
                          }
                          required={key === "primary"}
                        />
                      </div>
                    </Field>
                  );
                })}
              </div>
            </section>

            <section className="settings-restart-note">
              <strong>Restart-only settings stay in config.js</strong>
              <span>
                Database, URLs, ports, email transport, and secrets are
                intentionally never sent to the browser.
              </span>
            </section>
            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
            </form>
          ) : null}
        </ApiState>
      </section>
      <section
        id="plugin-settings-panel"
        role="tabpanel"
        aria-labelledby="plugin-settings-tab"
        hidden={activeTab !== "plugins"}
      >
        {activeTab === "plugins" ? <PluginSettings /> : null}
      </section>
    </main>
  );
}
