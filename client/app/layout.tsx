import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-context";
import { I18nProvider } from "@/components/i18n-context";
import { PluginHostProvider } from "@/components/plugin-host";
import { ToastProvider } from "@/components/toast-context";
import { TrackerConfigProvider } from "@/hooks/use-tracker-config";
import {
  FALLBACK_TRACKER_CONFIG,
  mergeTrackerConfig,
} from "@/lib/tracker-config";
import type { TrackerConfig } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  description: "A focused, private torrent tracker.",
  appleWebApp: {
    capable: true,
    title: "sqtrackr",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#f0644c",
};

async function loadTrackerConfig() {
  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  ).replace(/\/+$/, "");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl}/config`, { cache: "no-store" });
      if (response.ok) {
        return mergeTrackerConfig(
          (await response.json()) as Partial<TrackerConfig>,
        );
      }
    } catch {
      // The API may still be loading persisted settings during a joint restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return FALLBACK_TRACKER_CONFIG;
}

function configStyles(config: TrackerConfig) {
  const theme = config.customTheme ?? {};
  return {
    ...(theme.primary
      ? {
          "--accent": theme.primary,
          "--accent-hover": theme.primary,
          "--accent-soft": `color-mix(in srgb, ${theme.primary} 12%, transparent)`,
        }
      : {}),
    ...(theme.background ? { "--page": theme.background } : {}),
    ...(theme.sidebar ? { "--sidebar": theme.sidebar } : {}),
    ...(theme.border ? { "--border": theme.border } : {}),
    ...(theme.text ? { "--text": theme.text } : {}),
    ...(theme.grey ? { "--muted": theme.grey } : {}),
    "--content-max-width": `${Math.min(
      2560,
      Math.max(640, config.contentMaxWidth),
    )}px`,
  } as CSSProperties;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const config = await loadTrackerConfig();

  return (
    <html
      lang={config.defaultLocale}
      data-theme="dark"
      style={configStyles(config)}
      suppressHydrationWarning
    >
      <body>
        <TrackerConfigProvider initialConfig={config}>
          <AuthProvider>
            <I18nProvider defaultLocale={config.defaultLocale}>
              <ToastProvider>
                <PluginHostProvider>
                  <AppShell>{children}</AppShell>
                </PluginHostProvider>
              </ToastProvider>
            </I18nProvider>
          </AuthProvider>
        </TrackerConfigProvider>
      </body>
    </html>
  );
}
