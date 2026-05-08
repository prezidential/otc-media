import type { IntegrationPlugin, IntegrationListItem } from "./types";

const plugins = new Map<string, IntegrationPlugin>();

export function registerPlugin(plugin: IntegrationPlugin): void {
  plugins.set(plugin.id, plugin);
}

export function getPlugin(id: string): IntegrationPlugin | null {
  return plugins.get(id) ?? null;
}

export function listPlugins(): IntegrationListItem[] {
  return Array.from(plugins.values()).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    features: p.features,
    enabled: p.isEnabled(),
  }));
}

export function getRegisteredPlugins(): IntegrationPlugin[] {
  return Array.from(plugins.values());
}
