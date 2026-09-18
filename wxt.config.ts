import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TranslateChina — Trung → Việt',
    description: 'Dịch Taobao, 1688, chữ trong ảnh và quy đổi CNY sang VNĐ. Xử lý trên máy, không tài khoản hay API key.',
    minimum_chrome_version: '138',
    permissions: ['storage', 'offscreen', 'sidePanel', 'activeTab', 'contextMenus', 'alarms'],
    host_permissions: ['https://*.taobao.com/*', 'https://*.1688.com/*', 'https://api.frankfurter.dev/*'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'; connect-src 'self' https://api.frankfurter.dev; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'",
    },
    action: { default_title: 'TranslateChina' },
    side_panel: { default_path: 'sidepanel.html' },
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  },
});
