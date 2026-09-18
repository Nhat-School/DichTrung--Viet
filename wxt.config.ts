import { defineConfig } from 'wxt';

export default defineConfig({
  outDirTemplate: '',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TranslateChina — Trung → Việt',
    description: 'Dịch Trung–Việt trên website bạn chọn, đọc chữ trong ảnh và quy đổi giá Taobao/1688. Không tài khoản hay API key.',
    permissions: ['storage', 'offscreen', 'sidePanel', 'activeTab', 'contextMenus', 'alarms', 'tabs', 'scripting'],
    host_permissions: [
      '*://*.taobao.com/*',
      '*://*.tmall.com/*',
      '*://*.1688.com/*',
      '*://*.alibaba.com/*',
      '*://*.aliapp.org/*',
      '*://*.alipay.com/*',
      'https://api.frankfurter.dev/*',
      'https://translate.googleapis.com/*',
    ],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'; connect-src 'self' https://api.frankfurter.dev https://translate.googleapis.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'",
    },
    action: { default_title: 'TranslateChina' },
    side_panel: { default_path: 'sidepanel.html' },
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  },
});
