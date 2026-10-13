import type { ComponentType, ElementType } from "react";

export type PluginRole = "user" | "staff" | "admin";
export type PluginSettingValue = string | number | boolean | null;
export type PluginSettingOption = {
  label: string;
  value: string | number;
};
export type PluginSettingDescriptor = {
  key?: string;
  label?: string;
  description?: string;
  type:
    | "string"
    | "password"
    | "integer"
    | "number"
    | "boolean"
    | "select"
    | "textarea";
  default?: PluginSettingValue;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  public?: boolean;
  options?: readonly (PluginSettingOption | string | number)[];
};
export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion?: number;
  sqtrackr?: string;
  description?: string;
  permissions?: readonly string[];
  dependencies?: readonly string[];
  settings?:
    | readonly PluginSettingDescriptor[]
    | Readonly<Record<string, PluginSettingDescriptor>>;
  enabled?: boolean;
};
export type PluginAudience = {
  authenticated?: boolean;
  roles?: readonly PluginRole[];
};
export type PluginNavigationContribution = PluginAudience & {
  label: string;
  href: string;
  icon?: ElementType;
};
export type PluginPageProps = {
  slug: readonly string[];
};
export type PluginPageContribution = PluginAudience & {
  path: string;
  title: string;
  component: ComponentType<PluginPageProps>;
};
export type PluginSlotProps = {
  context: unknown;
};
export type PluginSlotContribution = PluginAudience & {
  name: string;
  component: ComponentType<PluginSlotProps>;
};
export type PluginTabProps = {
  context: unknown;
};
export type PluginTabContribution = PluginAudience & {
  slot: string;
  label: string;
  component: ComponentType<PluginTabProps>;
};
export type ClientPlugin = {
  manifest: PluginManifest;
  navigation?: readonly PluginNavigationContribution[];
  pages?: readonly PluginPageContribution[];
  slots?: readonly PluginSlotContribution[];
  tabs?: readonly PluginTabContribution[];
};
export declare function defineClientPlugin<const Plugin extends ClientPlugin>(
  plugin: Plugin,
): Plugin;
