import type { Settings } from './types';
export const DEFAULT_SETTINGS: Settings = { enabled: { taobao: true, '1688': true }, manualRate: '' };
export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings, enabled: { ...DEFAULT_SETTINGS.enabled, ...settings?.enabled } };
}
