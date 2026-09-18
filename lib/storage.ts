import type { Settings } from './types';
export const DEFAULT_SETTINGS: Settings = { enabled: { taobao: true, '1688': true }, manualRate: '', onlineFallback: false, ocrLanguage: 'chi_sim' };

/** Chrome exposes storage in extension pages, but keeping this guard makes a
 * stale/partially reloaded page fail gracefully instead of showing the raw
 * `Cannot read properties of undefined (reading 'local')` error. */
export function localStorageArea(): chrome.storage.StorageArea | undefined {
  return globalThis.chrome?.storage?.local;
}

export async function getSettings(): Promise<Settings> {
  const storage = localStorageArea();
  if (!storage) return { ...DEFAULT_SETTINGS, enabled: { ...DEFAULT_SETTINGS.enabled } };
  const { settings } = (await storage.get('settings')) as { settings?: Partial<Settings> };
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    enabled: { ...DEFAULT_SETTINGS.enabled, ...(settings?.enabled || {}) },
  };
}
