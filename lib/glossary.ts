/** Exact shopping labels only: replacing substrings can invert an offer's meaning. */
export const GLOSSARY: Record<string, string> = {
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
};
export const hasChinese = (text: string) => /[\p{Script=Han}]/u.test(text);

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
        const key = `ZXQ${i}QXZ`;
        if (result.split(key).length !== 2) throw new Error('Bản dịch làm thay đổi số liệu hoặc mã hàng. Đã giữ nguyên văn để bạn đối chiếu.');
        result = result.replace(key, () => tokens[i]);
      }
      if (/ZXQ\d+QXZ/.test(result)) throw new Error('Bản dịch chứa mã bảo vệ không hợp lệ.');
      return result;
    },
  };
}
