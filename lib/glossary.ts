/** Exact shopping labels only: replacing substrings can invert an offer's meaning. */
export const GLOSSARY: Record<string, string> = {
  '首页': 'Trang chủ', '新闻': 'Tin tức', '文章': 'Bài viết', '目录': 'Mục lục',
  '上一页': 'Trang trước', '下一页': 'Trang sau', '阅读更多': 'Đọc thêm', '返回': 'Quay lại',
  '登录': 'Đăng nhập', '注册': 'Đăng ký', '设置': 'Cài đặt', '联系我们': 'Liên hệ',
  '提交': 'Gửi', '取消': 'Hủy', '确定': 'Xác nhận', '加载更多': 'Tải thêm',
  '起批量': 'Số lượng đặt tối thiểu', '最小起订量': 'Số lượng đặt tối thiểu', '起订量': 'Số lượng đặt tối thiểu',
  '批发价': 'Giá bán sỉ', '阶梯价': 'Giá theo số lượng', '一件代发': 'Giao thay từng đơn',
  '现货': 'Hàng có sẵn', '预售': 'Đặt trước', '定金': 'Tiền đặt cọc', '尾款': 'Số tiền còn lại',
  '券后价': 'Giá sau khi áp mã giảm', '到手价': 'Giá sau ưu đãi', '原价': 'Giá gốc',
  '运费': 'Phí vận chuyển', '包邮': 'Miễn phí vận chuyển', '不包邮': 'Không miễn phí vận chuyển',
  '国内运费': 'Phí vận chuyển nội địa', '库存': 'Tồn kho', '已售': 'Đã bán',
  '颜色分类': 'Phân loại màu', '颜色': 'Màu sắc', '尺码': 'Kích cỡ', '规格': 'Quy cách',
  '材质': 'Chất liệu', '商品详情': 'Chi tiết sản phẩm', '产品参数': 'Thông số sản phẩm',
  '累计评价': 'Đánh giá', '买家评价': 'Đánh giá của người mua', '商品评价': 'Đánh giá sản phẩm',
  '加入购物车': 'Thêm vào giỏ hàng', '立即购买': 'Mua ngay', '购物车': 'Giỏ hàng',
  '全选': 'Chọn tất cả', '数量': 'Số lượng', '单价': 'Đơn giá', '小计': 'Tạm tính',
  '合计': 'Tổng cộng', '结算': 'Thanh toán', '收藏': 'Yêu thích', '客服': 'Chăm sóc khách hàng',
  '搜索': 'Tìm kiếm', '销量': 'Số lượng đã bán', '价格': 'Giá', '综合': 'Tổng hợp',
  '默认排序': 'Sắp xếp mặc định', '发货地': 'Nơi gửi hàng', '发货时间': 'Thời gian gửi hàng',
  '支持退货': 'Hỗ trợ trả hàng', '不支持退货': 'Không hỗ trợ trả hàng',
  '七天无理由退货': 'Trả hàng trong 7 ngày không cần lý do', '不含税': 'Chưa gồm thuế', '含税': 'Đã gồm thuế',
  // Captcha & Security verification
  '请选择符合描述的所有图片': 'Vui lòng chọn tất cả ảnh phù hợp mô tả',
  '请选择所有符合描述的图片': 'Vui lòng chọn tất cả ảnh phù hợp mô tả',
  '没有新图片可以点后，请点击“提交”': 'Khi không còn ảnh mới, hãy bấm "Xác nhận"',
  '没有新图片可以点后，请点击"提交"': 'Khi không còn ảnh mới, hãy bấm "Xác nhận"',
  '没有新图片可以点后请点击提交': 'Khi không còn ảnh mới, hãy bấm Xác nhận',
  '请点击“提交”': 'Vui lòng bấm "Xác nhận"',
  '请点击提交': 'Vui lòng bấm Xác nhận',
  '点我反馈': 'Bấm để phản hồi',
  '反馈码': 'Mã phản hồi',
  '请按住滑块，拖动到最右边': 'Vui lòng giữ thanh trượt và kéo sang phải',
  '按住滑块，拖动到最右边': 'Giữ thanh trượt và kéo sang phải',
  '拖动滑块完成拼图': 'Kéo thanh trượt để hoàn thành ghép hình',
  '请按顺序点击': 'Vui lòng bấm theo thứ tự',
  '点击图中文字': 'Bấm vào chữ trong ảnh',
  '请在图中找到': 'Vui lòng tìm trong ảnh',
  '验证通过': 'Xác thực thành công',
  '验证失败': 'Xác thực thất bại, thử lại',
  '验证失败，请重试': 'Xác thực thất bại, vui lòng thử lại',
  '点击刷新': 'Bấm để làm mới',
  '安全验证': 'Xác thực bảo mật',
  // Login & Authentication
  '短信登录': 'Đăng nhập bằng SMS',
  '密码登录': 'Đăng nhập bằng mật khẩu',
  '扫码登录': 'Quét mã để đăng nhập',
  '账号密码登录': 'Đăng nhập bằng tài khoản & mật khẩu',
  '手机无感登录': 'Đăng nhập nhanh số điện thoại',
  '请输入手机号': 'Vui lòng nhập số điện thoại',
  '请输入账号名': 'Vui lòng nhập tên tài khoản',
  '请输入登录密码': 'Vui lòng nhập mật khẩu',
  '请输入验证码': 'Vui lòng nhập mã xác thực',
  '获取验证码': 'Lấy mã xác thực',
  '重新获取': 'Lấy lại mã',
  '忘记密码': 'Quên mật khẩu',
  '忘记账号名': 'Quên tên tài khoản',
  '找回密码': 'Tìm lại mật khẩu',
  '免费注册': 'Đăng ký miễn phí',
  '立即登录': 'Đăng nhập ngay',
  '免费开店': 'Mở shop miễn phí',
  '千牛卖家中心': 'Trung tâm người bán Qianniu',
  '我的淘宝': 'Taobao của tôi',
  '已买到的宝贝': 'Đơn mua',
  '我的阿里': 'Ali của tôi',
  '进货单': 'Giỏ hàng nhập',
  '我的收藏': 'Bộ sưu tập',
  '诚信通': 'Thành Tín Thông',
  '源头好货': 'Nguồn hàng xưởng',
  '超级工厂': 'Siêu nhà máy',
  '实力商家': 'Shop thực lực',
  '切换企业版': 'Bản doanh nghiệp',
  '网页无障碍': 'Hỗ trợ tiếp cận',
};
export const hasChinese = (text: string) => /[\p{Script=Han}]/u.test(text);

/** Check numbers before accepting a fluent, unmasked translation. */
export function preservesFacts(original: string, translated: string, direction: 'zh-vi' | 'vi-zh'): boolean {
  const numbers = (value: string): string[] => Array.from(value.match(/\d+(?:[.,]\d+)*(?:%|％)?/g) || []).sort();
  const remaining = numbers(translated);
  for (const number of numbers(original)) {
    const norm = number.replace('％', '%');
    const index = remaining.findIndex(n => n.replace('％', '%') === norm);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  const codes = original.match(direction === 'zh-vi' ? /[A-Za-z][A-Za-z0-9_.\/-]*/g : /\b[A-Z][A-Z0-9_.\/-]*\d[A-Za-z0-9_.\/-]*\b/g) || [];
  const normTrans = translated.toLowerCase().replace(/[\s_.\/-]+/g, '');
  return codes.every(code => {
    const normCode = code.toLowerCase().replace(/[\s_.\/-]+/g, '');
    if (!normCode) return true;
    if (normTrans.includes(normCode)) return true;
    // Common unit translations in e-commerce
    if (normCode === 'cc' && (normTrans.includes('cm3') || normTrans.includes('phânkhối') || normTrans.includes('pk'))) return true;
    if (normCode === 'v' && (normTrans.includes('volt') || normTrans.includes('vôn'))) return true;
    if (normCode === 'w' && (normTrans.includes('watt') || normTrans.includes('oát'))) return true;
    return false;
  });
}

export function protectTokens(text: string, direction: 'zh-vi' | 'vi-zh') {
  const tokens: string[] = [];
  // For Vietnamese input, ordinary Latin words must remain translatable.
  const pattern = direction === 'zh-vi'
    ? /https?:\/\/[^\s]+|[A-Za-z][A-Za-z0-9_.\/-]*|\d+(?:[.,]\d+)*(?:%|％)?/g
    : /https?:\/\/[^\s]+|\b[A-Z][A-Z0-9_.\/-]*\d[A-Za-z0-9_.\/-]*\b|\d+(?:[.,]\d+)*(?:%|％)?/g;
  const protectedText = text.replace(pattern, token => {
    const index = tokens.push(token) - 1;
    return `ZXQ${index}QXZ`;
  });
  return {
    text: protectedText,
    restore(translated: string) {
      let result = translated;
      for (let i = 0; i < tokens.length; i++) {
        // Regex accommodates casing (zxq0qxz) and spacing (ZXQ 0 QXZ) produced by translation engines
        const pattern = new RegExp(`Z\\s*X\\s*Q\\s*${i}\\s*Q\\s*X\\s*Z`, 'i');
        if (!pattern.test(result)) {
          throw new Error('Bản dịch làm thay đổi số liệu hoặc mã hàng. Đã giữ nguyên văn để bạn đối chiếu.');
        }
        result = result.replace(pattern, () => tokens[i]);
      }
      if (/Z\s*X\s*Q\s*\d+\s*Q\s*X\s*Z/i.test(result)) {
        throw new Error('Bản dịch chứa mã bảo vệ không hợp lệ.');
      }
      return result;
    },
  };
}
