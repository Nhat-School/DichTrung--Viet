import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageTranslator } from '../lib/page-translator';

describe('PageTranslator lifecycle and stale invalidation', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'app-root';
    document.body.appendChild(root);
  });

  it('translates visible Chinese text nodes and stores original text', async () => {
    root.innerHTML = `
      <div class="product">
        <h1 class="title">夏季纯棉短袖T恤</h1>
        <div class="specs">颜色: 红色</div>
      </div>
    `;

    const mockTranslate = vi.fn().mockImplementation(async (text: string) => {
      if (text === '夏季纯棉短袖T恤') return 'Áo thun ngắn tay cotton mùa hè';
      if (text === '颜色: 红色') return 'Màu sắc: Đỏ';
      return `Dịch: ${text}`;
    });

    const translator = new PageTranslator(root, mockTranslate, () => {}, () => true);
    translator.start();
    await translator.scan();

    const titleNode = root.querySelector('.title')?.firstChild as Text;
    expect(titleNode.data).toBe('Áo thun ngắn tay cotton mùa hè');
    expect(translator.original(titleNode)).toBe('夏季纯棉短袖T恤');
    expect(translator.status().translated).toBe(2);

    translator.stop();
  });

  it('restores all original text nodes on stop()', async () => {
    root.innerHTML = `<div class="desc">现货 48小时内发货</div>`;

    const mockTranslate = vi.fn().mockResolvedValue('Hàng có sẵn, gửi trong 48 giờ');
    const translator = new PageTranslator(root, mockTranslate, () => {}, () => true);
    translator.start();
    await translator.scan();

    const descNode = root.querySelector('.desc')?.firstChild as Text;
    expect(descNode.data).toBe('Hàng có sẵn, gửi trong 48 giờ');

    translator.stop();
    expect(descNode.data).toBe('现货 48小时内发货');
    expect(translator.status().translated).toBe(0);
  });

  it('discards stale in-flight translation when node text changes before resolve (SKU switch)', async () => {
    root.innerHTML = `<span class="sku-variant">红色 M码</span>`;
    const textNode = root.querySelector('.sku-variant')?.firstChild as Text;

    let resolveFirstTranslate!: (val: string) => void;
    const firstPromise = new Promise<string>(resolve => {
      resolveFirstTranslate = resolve;
    });

    const mockTranslate = vi.fn().mockImplementation(async (text: string) => {
      if (text === '红色 M码') return firstPromise;
      if (text === '蓝色 L码') return 'Màu xanh size L';
      return text;
    });

    const translator = new PageTranslator(root, mockTranslate, () => {}, () => true);
    translator.start();

    // Start scan: begins translating "红色 M码"
    const scanPromise = translator.scan();

    // Page updates text before first translation finishes (user clicks Blue size L)
    textNode.data = '蓝色 L码';
    // Flush mutation observer
    await new Promise(r => setTimeout(r, 10));

    // Now first translation resolves with old "Màu đỏ size M"
    resolveFirstTranslate('Màu đỏ size M');
    await scanPromise;

    // The stale translation ("Màu đỏ size M") must NOT overwrite the new text "蓝色 L码"!
    expect(textNode.data).toBe('蓝色 L码');

    // Subsequent scan translates the new text "蓝色 L码"
    await translator.scan();
    expect(textNode.data).toBe('Màu xanh size L');
    expect(translator.original(textNode)).toBe('蓝色 L码');

    translator.stop();
  });

  it('originalsUnder returns focused original text for hover preview', async () => {
    root.innerHTML = `
      <div class="card">
        <button class="buy-btn">立即购买</button>
      </div>
    `;

    const mockTranslate = vi.fn().mockResolvedValue('Mua ngay');
    const translator = new PageTranslator(root, mockTranslate, () => {}, () => true);
    translator.start();
    await translator.scan();

    const btn = root.querySelector('.buy-btn') as HTMLElement;
    expect(btn.textContent).toBe('Mua ngay');

    const original = translator.originalsUnder(btn);
    expect(original).toBe('立即购买');

    translator.stop();
  });

  it('ignores excluded elements like inputs, textareas, and data-tc-owned', async () => {
    root.innerHTML = `
      <input type="text" value="输入搜索内容" />
      <textarea>买家留言内容</textarea>
      <div data-tc-owned><span>TranslateChina 标签</span></div>
      <p class="normal-text">正品保障</p>
    `;

    const mockTranslate = vi.fn().mockResolvedValue('Cam kết chính hãng');
    const translator = new PageTranslator(root, mockTranslate, () => {}, () => true);
    translator.start();
    await translator.scan();

    expect((root.querySelector('input') as HTMLInputElement).value).toBe('输入搜索内容');
    expect((root.querySelector('textarea') as HTMLTextAreaElement).value).toBe('买家留言内容');
    expect(root.querySelector('.normal-text')?.textContent).toBe('Cam kết chính hãng');

    translator.stop();
  });

  it('translates input placeholder and restores on stop()', async () => {
    root.innerHTML = `
      <input id="login-id" placeholder="账号名/邮箱/手机号" />
      <input id="login-pwd" placeholder="请输入登录密码" />
      <span id="badge" title="正品保证">商品图标</span>
    `;

    const mockTranslate = vi.fn().mockImplementation(async (text: string) => {
      if (text === '账号名/邮箱/手机号') return 'Tên tài khoản / Email / Số điện thoại';
      if (text === '请输入登录密码') return 'Vui lòng nhập mật khẩu đăng nhập';
      if (text === '正品保证') return 'Đảm bảo chính hãng';
      return `Dịch: ${text}`;
    });

    const translator = new PageTranslator(root, mockTranslate, () => {}, () => true);
    translator.start();
    await translator.scan();

    const idInput = root.querySelector('#login-id') as HTMLInputElement;
    const pwdInput = root.querySelector('#login-pwd') as HTMLInputElement;
    const badge = root.querySelector('#badge') as HTMLSpanElement;

    expect(idInput.getAttribute('placeholder')).toBe('Tên tài khoản / Email / Số điện thoại');
    expect(pwdInput.getAttribute('placeholder')).toBe('Vui lòng nhập mật khẩu đăng nhập');
    expect(badge.getAttribute('title')).toBe('Đảm bảo chính hãng');

    translator.stop();
    expect(idInput.getAttribute('placeholder')).toBe('账号名/邮箱/手机号');
    expect(pwdInput.getAttribute('placeholder')).toBe('请输入登录密码');
    expect(badge.getAttribute('title')).toBe('正品保证');
  });
});

