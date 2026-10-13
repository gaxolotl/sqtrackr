"use client";

import type {
  ClientPlugin,
  PluginAudience,
  PluginManifest,
  PluginNavigationContribution,
  PluginPageContribution,
  PluginRole,
  PluginSlotContribution,
  PluginTabContribution,
} from "@sqtrackr/plugin-sdk/client";
import {
  Component,
  createContext,
  useContext,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-context";
import { ApiState } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { clientPluginRegistry } from "@/lib/plugins/registry";

type RuntimePlugin =
  | PluginManifest
  | { enabled?: boolean; manifest: PluginManifest };
type PluginListResponse = RuntimePlugin[] | { plugins: RuntimePlugin[] };

type EnabledPlugin = {
  client: ClientPlugin;
  manifest: PluginManifest;
};

export type PluginNavigationItem = PluginNavigationContribution & {
  pluginId: string;
  pluginName: string;
};

type ResolvedPluginPage = {
  page: PluginPageContribution;
  pluginId: string;
  pluginName: string;
};

export type ResolvedPluginTab = {
  contribution: PluginTabContribution;
  pluginId: string;
  pluginName: string;
};

type PluginHostValue = {
  enabledManifests: readonly PluginManifest[];
  error: string;
  loading: boolean;
  navigation: readonly PluginNavigationItem[];
  resolvePage: (
    pluginId: string,
    slug: readonly string[],
  ) => ResolvedPluginPage | null;
  resolveTitle: (pathname: string) => string | null;
  slots: (name: string) => readonly {
    contribution: PluginSlotContribution;
    pluginId: string;
    pluginName: string;
  }[];
  tabs: (slot: string) => readonly ResolvedPluginTab[];
};

const PluginHostContext = createContext<PluginHostValue | null>(null);

function runtimePlugins(response: PluginListResponse) {
  return Array.isArray(response) ? response : response.plugins;
}

function runtimeManifest(plugin: RuntimePlugin) {
  return "manifest" in plugin ? plugin.manifest : plugin;
}

function runtimeEnabled(plugin: RuntimePlugin) {
  if ("manifest" in plugin && plugin.enabled === false) return false;
  return runtimeManifest(plugin).enabled !== false;
}

function canShow(
  contribution: PluginAudience,
  session: { role: PluginRole } | null,
) {
  if (contribution.authenticated && !session) return false;
  if (contribution.roles?.length) {
    return Boolean(session && contribution.roles.includes(session.role));
  }
  return true;
}

function normalizedPagePath(path: string) {
  if (!path || path === "/") return "/";
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

function slugPath(slug: readonly string[]) {
  return slug.length ? `/${slug.join("/")}` : "/";
}

function routeParts(pathname: string) {
  const match = pathname.match(/^\/plugins\/([^/]+)(?:\/(.*))?\/?$/);
  if (!match) return null;
  try {
    return {
      pluginId: decodeURIComponent(match[1]),
      slug: match[2]
        ? match[2].split("/").filter(Boolean).map(decodeURIComponent)
        : [],
    };
  } catch {
    return null;
  }
}

class PluginErrorBoundary extends Component<
  { children: ReactNode; pluginId: string; pluginName: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Client plugin ${this.props.pluginId} failed to render.`,
      error,
      info,
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="plugin-error" role="alert">
          {this.props.pluginName} could not render this section.
        </div>
      );
    }
    return this.props.children;
  }
}

export function PluginHostProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [manifests, setManifests] = useState<PluginManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPlugins() {
      try {
        const response = await apiFetch<PluginListResponse>("/plugins");
        if (!active) return;
        setManifests(
          runtimePlugins(response)
            .filter(runtimeEnabled)
            .map(runtimeManifest),
        );
        setError("");
      } catch (requestError) {
        if (!active) return;
        setManifests([]);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load plugins.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPlugins();
    return () => {
      active = false;
    };
  }, [session?.token]);

  const enabledPlugins: EnabledPlugin[] = manifests.flatMap((manifest) => {
    const client = clientPluginRegistry[manifest.id];
    if (!client) return [];
    return [{ client, manifest: { ...manifest, ...client.manifest } }];
  });

  function resolvePage(pluginId: string, slug: readonly string[]) {
    const plugin = enabledPlugins.find(
      ({ manifest }) => manifest.id === pluginId,
    );
    if (!plugin) return null;
    const page = plugin.client.pages?.find(
      (contribution) =>
        normalizedPagePath(contribution.path) === slugPath(slug) &&
        canShow(contribution, session),
    );
    return page
      ? { page, pluginId, pluginName: plugin.manifest.name }
      : null;
  }

  function resolveTitle(pathname: string) {
    const parts = routeParts(pathname);
    if (!parts) return null;
    return resolvePage(parts.pluginId, parts.slug)?.page.title ?? null;
  }

  function slots(name: string) {
    return enabledPlugins.flatMap(({ client, manifest }) =>
      (client.slots ?? [])
        .filter(
          (contribution) =>
            contribution.name === name && canShow(contribution, session),
        )
        .map((contribution) => ({
          contribution,
          pluginId: manifest.id,
          pluginName: manifest.name,
        })),
    );
  }

  function tabs(slot: string): readonly ResolvedPluginTab[] {
    return enabledPlugins.flatMap(({ client, manifest }) =>
      (client.tabs ?? [])
        .filter(
          (contribution) =>
            contribution.slot === slot && canShow(contribution, session),
        )
        .map((contribution) => ({
          contribution,
          pluginId: manifest.id,
          pluginName: manifest.name,
        })),
    );
  }

  const navigation = enabledPlugins.flatMap(({ client, manifest }) =>
    (client.navigation ?? [])
      .filter((contribution) => canShow(contribution, session))
      .map((contribution) => ({
        ...contribution,
        pluginId: manifest.id,
        pluginName: manifest.name,
      })),
  );

  return (
    <PluginHostContext.Provider
      value={{
        enabledManifests: enabledPlugins.map(({ manifest }) => manifest),
        error,
        loading,
        navigation,
        resolvePage,
        resolveTitle,
        slots,
        tabs,
      }}
    >
      {children}
    </PluginHostContext.Provider>
  );
}

export function usePluginHost() {
  const context = useContext(PluginHostContext);
  if (!context) {
    throw new Error("usePluginHost must be used inside PluginHostProvider");
  }
  return context;
}

export function PluginBoundary({
  children,
  pluginId,
  pluginName,
}: {
  children: ReactNode;
  pluginId: string;
  pluginName: string;
}) {
  return (
    <PluginErrorBoundary pluginId={pluginId} pluginName={pluginName}>
      {children}
    </PluginErrorBoundary>
  );
}

export function PluginSlot({
  name,
  context,
}: {
  name: string;
  context: unknown;
}) {
  const host = usePluginHost();
  return (
    <>
      {host.slots(name).map(
        ({ contribution, pluginId, pluginName }, index) => {
          const SlotComponent = contribution.component;
          return (
            <PluginErrorBoundary
              key={`${pluginId}:${name}:${index}`}
              pluginId={pluginId}
              pluginName={pluginName}
            >
              <SlotComponent context={context} />
            </PluginErrorBoundary>
          );
        },
      )}
    </>
  );
}

export function PluginTab({
  tab,
  context,
}: {
  tab: ResolvedPluginTab;
  context: unknown;
}) {
  const TabComponent = tab.contribution.component;
  return (
    <PluginErrorBoundary pluginId={tab.pluginId} pluginName={tab.pluginName}>
      <TabComponent context={context} />
    </PluginErrorBoundary>
  );
}

export function PluginRoute({
  pluginId,
  slug,
}: {
  pluginId: string;
  slug: readonly string[];
}) {
  const host = usePluginHost();
  const resolved = host.resolvePage(pluginId, slug);

  if (host.loading) {
    return (
      <main className="page">
        <ApiState loading>{null}</ApiState>
      </main>
    );
  }
  if (!resolved) {
    return (
      <main className="page">
        <ApiState error={host.error || "Plugin page not found."}>
          {null}
        </ApiState>
      </main>
    );
  }

  const PageComponent = resolved.page.component;
  return (
    <PluginErrorBoundary
      key={`${resolved.pluginId}:${slugPath(slug)}`}
      pluginId={resolved.pluginId}
      pluginName={resolved.pluginName}
    >
      <PageComponent slug={slug} />
    </PluginErrorBoundary>
  );
}
