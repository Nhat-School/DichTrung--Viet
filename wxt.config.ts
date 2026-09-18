import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TranslateChina — Trung → Việt',
    description: 'Dịch Taobao, 1688, chữ trong ảnh và quy đổi CNY sang VNĐ. Xử lý trên máy, không tài khoản hay API key.',
    permissions: ['storage', 'offscreen', 'sidePanel', 'activeTab', 'contextMenus', 'alarms', 'tabs'],
    host_permissions: [
      '*://*.taobao.com/*',
      '*://*.1688.com/*',
      'https://api.frankfurter.dev/*',
      'https://translate.googleapis.com/*',
      '<all_urls>',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self' blob:; connect-src 'self' data: blob: https://api.frankfurter.dev https://translate.googleapis.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'",
    },
    web_accessible_resources: [
      {
        resources: ['vendor/*', 'vendor/**/*', 'icon/*'],
        matches: ['*://*.taobao.com/*', '*://*.1688.com/*', '<all_urls>'],
      },
    ],
    action: { default_title: 'TranslateChina' },
    side_panel: { default_path: 'sidepanel.html' },
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  },
});
