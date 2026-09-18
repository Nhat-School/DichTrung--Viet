import { describe, it, expect } from 'vitest';
import { protectTokens, GLOSSARY, hasChinese } from '../lib/glossary';

/**
 * 100 realistic shopping phrases collected from Taobao and 1688:
 * Covering prices, discounts, MOQ, shipping, specs, variants, stock, returns, and negation.
 */
export const SHOPPING_PHRASES: Array<{
  id: number;
  category: string;
  chinese: string;
  vietnameseExpected: string;
  tokensExpected: string[];
}> = [
  // 1. Pricing & Promotions (1-20)
  { id: 1, category: 'price', chinese: '券后价 ¥128.00', vietnameseExpected: 'Giá sau khi áp mã giảm ¥128.00', tokensExpected: ['128.00'] },
  { id: 2, category: 'price', chinese: '到手价 89.9元', vietnameseExpected: 'Giá sau ưu đãi 89.9元', tokensExpected: ['89.9'] },
  { id: 3, category: 'price', chinese: '原价 ¥299.00, 限时5折', vietnameseExpected: 'Giá gốc ¥299.00, giảm 50% có hạn', tokensExpected: ['299.00', '5'] },
  { id: 4, category: 'price', chinese: '满300减40元', vietnameseExpected: 'Đủ 300 giảm 40 tệ', tokensExpected: ['300', '40'] },
  { id: 5, category: 'price', chinese: '第二件半价 (5折)', vietnameseExpected: 'Sản phẩm thứ 2 nửa giá (50%)', tokensExpected: ['5'] },
  { id: 6, category: 'price', chinese: '买2送1件', vietnameseExpected: 'Mua 2 tặng 1 cái', tokensExpected: ['2', '1'] },
  { id: 7, category: 'price', chinese: '新客立减 15元', vietnameseExpected: 'Khách mới giảm ngay 15 tệ', tokensExpected: ['15'] },
  { id: 8, category: 'price', chinese: '店铺优惠券: 满199减20', vietnameseExpected: 'Phiếu giảm giá cửa hàng: Đủ 199 giảm 20', tokensExpected: ['199', '20'] },
  { id: 9, category: 'price', chinese: '定金 50元, 尾款 150元', vietnameseExpected: 'Tiền đặt cọc 50 tệ, số tiền còn lại 150 tệ', tokensExpected: ['50', '150'] },
  { id: 10, category: 'price', chinese: '拼团价 ¥39.90, 单买 ¥49.90', vietnameseExpected: 'Giá mua chung ¥39.90, mua lẻ ¥49.90', tokensExpected: ['39.90', '49.90'] },
  { id: 11, category: 'price', chinese: '限时秒杀价 ¥9.9包邮', vietnameseExpected: 'Giá săn chớp nhoáng ¥9.9 miễn phí vận chuyển', tokensExpected: ['9.9'] },
  { id: 12, category: 'price', chinese: '下单立减 8.8折', vietnameseExpected: 'Đặt đơn giảm ngay còn 88%', tokensExpected: ['8.8'] },
  { id: 13, category: 'price', chinese: '每满200减30, 上不封顶', vietnameseExpected: 'Mỗi 200 giảm 30, không giới hạn mức tối đa', tokensExpected: ['200', '30'] },
  { id: 14, category: 'price', chinese: '折后单价 ¥18.5/件', vietnameseExpected: 'Đơn giá sau giảm ¥18.5/cái', tokensExpected: ['18.5'] },
  { id: 15, category: 'price', chinese: 'VIP专享价 ¥168', vietnameseExpected: 'Giá dành riêng VIP ¥168', tokensExpected: ['168'] },
  { id: 16, category: 'price', chinese: '淘金币抵扣 3%', vietnameseExpected: 'Xu Taobao khấu trừ 3%', tokensExpected: ['3%'] },
  { id: 17, category: 'price', chinese: '批发参考价: 25.00 - 35.00元', vietnameseExpected: 'Giá sỉ tham khảo: 25.00 - 35.00 tệ', tokensExpected: ['25.00', '35.00'] },
  { id: 18, category: 'price', chinese: '预售价 ¥199 (省50元)', vietnameseExpected: 'Giá đặt trước ¥199 (tiết kiệm 50 tệ)', tokensExpected: ['199', '50'] },
  { id: 19, category: 'price', chinese: '加购立省 5元', vietnameseExpected: 'Thêm vào giỏ tiết kiệm ngay 5 tệ', tokensExpected: ['5'] },
  { id: 20, category: 'price', chinese: '跨店满减: 满300减50', vietnameseExpected: 'Giảm liên cửa hàng: Đủ 300 giảm 50', tokensExpected: ['300', '50'] },

  // 2. Wholesale & MOQ (21-35)
  { id: 21, category: 'wholesale', chinese: '起批量: ≥2件', vietnameseExpected: 'Số lượng đặt tối thiểu: ≥2 cái', tokensExpected: ['2'] },
  { id: 22, category: 'wholesale', chinese: '最小起订量: 100个', vietnameseExpected: 'Số lượng đặt tối thiểu: 100 cái', tokensExpected: ['100'] },
  { id: 23, category: 'wholesale', chinese: '阶梯价: 2-9件 ¥45, 10-49件 ¥38, ≥50件 ¥30', vietnameseExpected: 'Giá theo số lượng: 2-9 cái ¥45, 10-49 cái ¥38, ≥50 cái ¥30', tokensExpected: ['2', '9', '45', '10', '49', '38', '50', '30'] },
  { id: 24, category: 'wholesale', chinese: '支持一件代发', vietnameseExpected: 'Hỗ trợ giao thay từng đơn', tokensExpected: [] },
  { id: 25, category: 'wholesale', chinese: '混批条件: 满500元或满20件起批', vietnameseExpected: 'Điều kiện nhập lẫn: Đủ 500 tệ hoặc từ 20 cái trở lên', tokensExpected: ['500', '20'] },
  { id: 26, category: 'wholesale', chinese: '拿样价 ¥60/件 (二次进货返还样品费)', vietnameseExpected: 'Giá lấy mẫu ¥60/cái (nhập hàng lần 2 hoàn lại phí mẫu)', tokensExpected: ['60'] },
  { id: 27, category: 'wholesale', chinese: '整箱批发: 50件/箱, 箱起订', vietnameseExpected: 'Bán sỉ nguyên thùng: 50 cái/thùng, đặt từ 1 thùng', tokensExpected: ['50'] },
  { id: 28, category: 'wholesale', chinese: '支持定制LOGO, 起订量500件', vietnameseExpected: 'Hỗ trợ in ấn LOGO, đặt từ 500 cái', tokensExpected: ['LOGO', '500'] },
  { id: 29, category: 'wholesale', chinese: '深度验厂, 48小时出样', vietnameseExpected: 'Kiểm định nhà xưởng sâu, ra mẫu trong 48 giờ', tokensExpected: ['48'] },
  { id: 30, category: 'wholesale', chinese: '厂家直销, 货源充足', vietnameseExpected: 'Xưởng bán trực tiếp, nguồn hàng dồi dào', tokensExpected: [] },
  { id: 31, category: 'wholesale', chinese: '支持OEM/ODM贴牌加工', vietnameseExpected: 'Hỗ trợ gia công đóng gói OEM/ODM', tokensExpected: ['OEM', 'ODM'] },
  { id: 32, category: 'wholesale', chinese: '大额采购可议价, 联系客服', vietnameseExpected: 'Mua số lượng lớn thương lượng giá, liên hệ chăm sóc khách hàng', tokensExpected: [] },
  { id: 33, category: 'wholesale', chinese: '样品限购1件', vietnameseExpected: 'Hàng mẫu giới hạn mua 1 cái', tokensExpected: ['1'] },
  { id: 34, category: 'wholesale', chinese: '包装规格: 12包/打', vietnameseExpected: 'Quy cách đóng gói: 12 gói/tá', tokensExpected: ['12'] },
  { id: 35, category: 'wholesale', chinese: '起订金额: ¥1000元起', vietnameseExpected: 'Số tiền đặt tối thiểu: từ ¥1000 tệ', tokensExpected: ['1000'] },

  // 3. Shipping & Logistics (36-50)
  { id: 36, category: 'shipping', chinese: '全场包邮 (除偏远地区)', vietnameseExpected: 'Toàn sàn miễn phí vận chuyển (trừ vùng xa xôi)', tokensExpected: [] },
  { id: 37, category: 'shipping', chinese: '国内运费: ¥12.00', vietnameseExpected: 'Phí vận chuyển nội địa: ¥12.00', tokensExpected: ['12.00'] },
  { id: 38, category: 'shipping', chinese: '发货地: 浙江省杭州市', vietnameseExpected: 'Nơi gửi hàng: Thành phố Hàng Châu tỉnh Chiết Giang', tokensExpected: [] },
  { id: 39, category: 'shipping', chinese: '24小时内极速发货', vietnameseExpected: 'Gửi hàng siêu tốc trong 24 giờ', tokensExpected: ['24'] },
  { id: 40, category: 'shipping', chinese: '48小时发货, 顺丰特快', vietnameseExpected: 'Gửi hàng trong 48 giờ, chuyển phát SF Express', tokensExpected: ['48'] },
  { id: 41, category: 'shipping', chinese: '新疆、西藏、青海不包邮, 需补运费20元', vietnameseExpected: 'Tân Cương, Tây Tạng, Thanh Hải không miễn phí vận chuyển, cần bù 20 tệ', tokensExpected: ['20'] },
  { id: 42, category: 'shipping', chinese: '支持送货上门', vietnameseExpected: 'Hỗ trợ giao hàng tận nhà', tokensExpected: [] },
  { id: 43, category: 'shipping', chinese: '自提点免费自提', vietnameseExpected: 'Lấy hàng miễn phí tại điểm giao nhận', tokensExpected: [] },
  { id: 44, category: 'shipping', chinese: '赠送运费险, 退换无忧', vietnameseExpected: 'Tặng kèm bảo hiểm vận chuyển, đổi trả an tâm', tokensExpected: [] },
  { id: 45, category: 'shipping', chinese: '默认中通/圆通快递随机发送', vietnameseExpected: 'Mặc định gửi ngẫu nhiên ZTO/YTO Express', tokensExpected: [] },
  { id: 46, category: 'shipping', chinese: '承诺72小时内揽收', vietnameseExpected: 'Cam kết bưu tá lấy hàng trong 72 giờ', tokensExpected: ['72'] },
  { id: 47, category: 'shipping', chinese: '物流时效: 预计2-3天送达', vietnameseExpected: 'Thời gian vận chuyển: dự kiến 2-3 ngày nhận hàng', tokensExpected: ['2', '3'] },
  { id: 48, category: 'shipping', chinese: '大件物流发德邦, 运费到付', vietnameseExpected: 'Hàng cồng kềnh gửi Deppon, người nhận trả cước', tokensExpected: [] },
  { id: 49, category: 'shipping', chinese: '周日及节假日不发货', vietnameseExpected: 'Chủ nhật và ngày lễ không gửi hàng', tokensExpected: [] },
  { id: 50, category: 'shipping', chinese: '同城当日达, 次日必达', vietnameseExpected: 'Cùng thành phố giao trong ngày, chắc chắn đến ngày hôm sau', tokensExpected: [] },

  // 4. Specifications & Variants (51-70)
  { id: 51, category: 'specs', chinese: '颜色分类: 曜石黑 / 珍珠白 / 远峰蓝', vietnameseExpected: 'Phân loại màu: Đen đá / Trắng ngọc trai / Xanh sương mù', tokensExpected: [] },
  { id: 52, category: 'specs', chinese: '尺码: S (80-95斤), M (95-110斤), L (110-125斤), XL (125-140斤)', vietnameseExpected: 'Kích cỡ: S (40-47.5kg), M (47.5-55kg), L (55-62.5kg), XL (62.5-70kg)', tokensExpected: ['S', '80', '95', 'M', '95', '110', 'L', '110', '125', 'XL', '125', '140'] },
  { id: 53, category: 'specs', chinese: '材质成分: 100% 桑蚕丝', vietnameseExpected: 'Thành phần chất liệu: 100% lụa tơ tằm', tokensExpected: ['100%'] },
  { id: 54, category: 'specs', chinese: '净重: 500g ± 10g', vietnameseExpected: 'Trọng lượng tịnh: 500g ± 10g', tokensExpected: ['500g', '10g'] },
  { id: 55, category: 'specs', chinese: '产品尺寸: 210mm x 297mm (A4标准规格)', vietnameseExpected: 'Kích thước sản phẩm: 210mm x 297mm (quy cách chuẩn A4)', tokensExpected: ['210mm', '297mm', 'A4'] },
  { id: 56, category: 'specs', chinese: '额定功率: 65W, 支持 Type-C 快充', vietnameseExpected: 'Công suất định mức: 65W, hỗ trợ sạc nhanh Type-C', tokensExpected: ['65W', 'Type-C'] },
  { id: 57, category: 'specs', chinese: '电池容量: 5000mAh 大容量锂电池', vietnameseExpected: 'Dung lượng pin: pin lithium 5000mAh dung lượng lớn', tokensExpected: ['5000mAh'] },
  { id: 58, category: 'specs', chinese: '接口类型: USB 3.0 / HDMI 2.1', vietnameseExpected: 'Loại cổng kết nối: USB 3.0 / HDMI 2.1', tokensExpected: ['USB', '3.0', 'HDMI', '2.1'] },
  { id: 59, category: 'specs', chinese: '适用机型: iPhone 16 Pro Max / 15 Plus', vietnameseExpected: 'Dòng máy phù hợp: iPhone 16 Pro Max / 15 Plus', tokensExpected: ['iPhone', '16', 'Pro', 'Max', '15', 'Plus'] },
  { id: 60, category: 'specs', chinese: '内存配置: 16GB + 512GB 固态硬盘', vietnameseExpected: 'Cấu hình bộ nhớ: 16GB + 512GB ổ SSD', tokensExpected: ['16GB', '512GB'] },
  { id: 61, category: 'specs', chinese: '防水等级: IP68 级防尘防水', vietnameseExpected: 'Cấp chống nước: kháng bụi chống nước chuẩn IP68', tokensExpected: ['IP68'] },
  { id: 62, category: 'specs', chinese: '鞋码偏小半码, 建议拍大一码', vietnameseExpected: 'Cỡ giày hơi nhỏ nửa size, nên đặt lớn hơn 1 size', tokensExpected: [] },
  { id: 63, category: 'specs', chinese: '版型: 宽松型 / 修身型 / 标准型', vietnameseExpected: 'Phom dáng: dáng rộng / dáng ôm / dáng chuẩn', tokensExpected: [] },
  { id: 64, category: 'specs', chinese: '领型: 圆领 / V领 / 翻领', vietnameseExpected: 'Kiểu cổ áo: Cổ tròn / Cổ chữ V / Cổ bẻ', tokensExpected: ['V'] },
  { id: 65, category: 'specs', chinese: '保质期: 24个月, 生产日期见包装', vietnameseExpected: 'Hạn sử dụng: 24 tháng, ngày sản xuất xem trên bao bì', tokensExpected: ['24'] },
  { id: 66, category: 'specs', chinese: '执行标准: GB/T 22705-2019', vietnameseExpected: 'Tiêu chuẩn thực thi: GB/T 22705-2019', tokensExpected: ['GB/T', '22705', '2019'] },
  { id: 67, category: 'specs', chinese: '输入电压: AC 100-240V ~ 50/60Hz', vietnameseExpected: 'Điện áp đầu vào: AC 100-240V ~ 50/60Hz', tokensExpected: ['AC', '100', '240V', '50/60Hz'] },
  { id: 68, category: 'specs', chinese: '材质: 95%棉 + 5%氨纶 (高弹透气)', vietnameseExpected: 'Chất liệu: 95% cotton + 5% spandex (co giãn thoáng khí)', tokensExpected: ['95%', '5%'] },
  { id: 69, category: 'specs', chinese: '商品毛重: 1.25kg', vietnameseExpected: 'Trọng lượng cả bao bì: 1.25kg', tokensExpected: ['1.25kg'] },
  { id: 70, category: 'specs', chinese: '型号: XZ-9002B 升级版', vietnameseExpected: 'Mã model: bản nâng cấp XZ-9002B', tokensExpected: ['XZ-9002B'] },

  // 5. Stock & Availability (71-80)
  { id: 71, category: 'stock', chinese: '现货储备 50000+ 件', vietnameseExpected: 'Dự trữ hàng có sẵn hơn 50000 cái', tokensExpected: ['50000'] },
  { id: 72, category: 'stock', chinese: '库存紧张, 仅剩 3 件', vietnameseExpected: 'Tồn kho khan hiếm, chỉ còn 3 cái', tokensExpected: ['3'] },
  { id: 73, category: 'stock', chinese: '预售商品: 付款后15天内发货', vietnameseExpected: 'Hàng đặt trước: gửi hàng trong 15 ngày sau thanh toán', tokensExpected: ['15'] },
  { id: 74, category: 'stock', chinese: '已售 10万+ 件, 累计好评 4.9分', vietnameseExpected: 'Đã bán hơn 100.000 cái, đánh giá tốt 4.9 điểm', tokensExpected: ['10', '4.9'] },
  { id: 75, category: 'stock', chinese: '断货补货中, 预计下周到仓', vietnameseExpected: 'Đang hết hàng nhập thêm, dự kiến tuần sau về kho', tokensExpected: [] },
  { id: 76, category: 'stock', chinese: '热销 2000+ 件 / 30天内', vietnameseExpected: 'Bán chạy hơn 2000 cái / trong 30 ngày', tokensExpected: ['2000', '30'] },
  { id: 77, category: 'stock', chinese: '每人限购 5 件, 多拍不发货', vietnameseExpected: 'Mỗi người giới hạn mua 5 cái, đặt thêm không gửi', tokensExpected: ['5'] },
  { id: 78, category: 'stock', chinese: '工厂现货直供, 当天截单17:00', vietnameseExpected: 'Xưởng cung ứng sẵn, chốt đơn trong ngày lúc 17:00', tokensExpected: ['17:00'] },
  { id: 79, category: 'stock', chinese: '现货闪发, 缺货先行赔付', vietnameseExpected: 'Có sẵn giao ngay, thiếu hàng đền bù trước', tokensExpected: [] },
  { id: 80, category: 'stock', chinese: '预定期限: 2026年10月1日止', vietnameseExpected: 'Thời hạn đặt trước: đến hết ngày 1 tháng 10 năm 2026', tokensExpected: ['2026', '10', '1'] },

  // 6. Customer Service & Returns (81-90)
  { id: 81, category: 'service', chinese: '七天无理由退货 (包装完好未拆封)', vietnameseExpected: 'Trả hàng trong 7 ngày không cần lý do (bao bì nguyên vẹn)', tokensExpected: [] },
  { id: 82, category: 'service', chinese: '破损包赔, 假一赔十', vietnameseExpected: 'Vỡ hỏng đền bù, phát hiện giả đền gấp 10', tokensExpected: [] },
  { id: 83, category: 'service', chinese: '全国联保, 1年免费换新', vietnameseExpected: 'Bảo hành toàn quốc, 1 năm đổi mới miễn phí', tokensExpected: ['1'] },
  { id: 84, category: 'service', chinese: '正品保障, 支持官方专柜验货', vietnameseExpected: 'Cam kết chính hãng, hỗ trợ kiểm tra tại showroom chính hãng', tokensExpected: [] },
  { id: 85, category: 'service', chinese: '开具发票: 增值税普通发票 / 专用发票', vietnameseExpected: 'Xuất hóa đơn: Hóa đơn GTGT thông thường / Hóa đơn chuyên dụng', tokensExpected: [] },
  { id: 86, category: 'service', chinese: '含税价 (开票需加6%税点)', vietnameseExpected: 'Giá gồm thuế (xuất hóa đơn thêm 6% điểm thuế)', tokensExpected: ['6%'] },
  { id: 87, category: 'service', chinese: '专属客服 1对1 在线解答', vietnameseExpected: 'Chuyên viên tư vấn 1 kèm 1 giải đáp trực tuyến', tokensExpected: ['1', '1'] },
  { id: 88, category: 'service', chinese: '买家评价: 98% 满意度', vietnameseExpected: 'Đánh giá của người mua: 98% mức độ hài lòng', tokensExpected: ['98%'] },
  { id: 89, category: 'service', chinese: '支持退款不退货 (仅限小额破损)', vietnameseExpected: 'Hỗ trợ hoàn tiền không hoàn hàng (chỉ áp dụng hư hại nhỏ)', tokensExpected: [] },
  { id: 90, category: 'service', chinese: '退货保障卡已随箱附带', vietnameseExpected: 'Thẻ bảo đảm trả hàng đã kèm theo trong thùng', tokensExpected: [] },

  // 7. Negations & Terms / Conditions (91-100)
  { id: 91, category: 'negation', chinese: '非质量问题不退不换', vietnameseExpected: 'Không phải lỗi chất lượng thì không trả không đổi', tokensExpected: [] },
  { id: 92, category: 'negation', chinese: '贴身衣物一经试穿不支持退换', vietnameseExpected: 'Đồ lót một khi đã thử không hỗ trợ đổi trả', tokensExpected: [] },
  { id: 93, category: 'negation', chinese: '不含运费, 运费买家自理', vietnameseExpected: 'Không gồm tiền cước, phí vận chuyển người mua tự chịu', tokensExpected: [] },
  { id: 94, category: 'negation', chinese: '未满起订量暂不发货', vietnameseExpected: 'Chưa đủ số lượng đặt tối thiểu tạm thời không gửi hàng', tokensExpected: [] },
  { id: 95, category: 'negation', chinese: '不支持指定快递公司', vietnameseExpected: 'Không hỗ trợ chỉ định công ty chuyển phát', tokensExpected: [] },
  { id: 96, category: 'negation', chinese: '不包安装, 附赠安装工具和说明书', vietnameseExpected: 'Không bao lắp đặt, tặng kèm dụng cụ và sách hướng dẫn', tokensExpected: [] },
  { id: 97, category: 'negation', chinese: '定制款不支持退货退款', vietnameseExpected: 'Mẫu đặt theo yêu cầu không hỗ trợ hoàn hàng hoàn tiền', tokensExpected: [] },
  { id: 98, category: 'negation', chinese: '非偏远地区均可配送', vietnameseExpected: 'Khu vực không thuộc vùng sâu xa đều có thể giao', tokensExpected: [] },
  { id: 99, category: 'negation', chinese: '无特殊情况拍下即发', vietnameseExpected: 'Không có tình huống đặc biệt thì đặt là gửi ngay', tokensExpected: [] },
  { id: 100, category: 'negation', chinese: '不含税, 开票需联系客服另计税金', vietnameseExpected: 'Chưa gồm thuế, xuất hóa đơn cần liên hệ chăm sóc khách hàng tính riêng', tokensExpected: [] },
];

describe('100 Sample Shopping Phrases Suite', () => {
  it('contains exactly 100 realistic shopping phrases', () => {
    expect(SHOPPING_PHRASES).toHaveLength(100);
  });

  it('all phrases contain valid Chinese characters', () => {
    for (const item of SHOPPING_PHRASES) {
      expect(hasChinese(item.chinese)).toBe(true);
    }
  });

  it('protectTokens preserves numbers, units, and codes in every phrase', () => {
    for (const item of SHOPPING_PHRASES) {
      const shield = protectTokens(item.chinese, 'zh-vi');
      // Simulated translation that keeps placeholder tokens intact
      const restored = shield.restore(shield.text);
      expect(restored).toBe(item.chinese);

      const textWithoutPlaceholders = shield.text.replace(/ZXQ\d+QXZ/g, '');
      for (const token of item.tokensExpected) {
        expect(item.chinese).toContain(token);
        expect(textWithoutPlaceholders).not.toContain(token);
      }
    }
  });

  it('glossary maps core commercial keywords correctly', () => {
    // Check some key terms from the 100 phrases against GLOSSARY
    expect(GLOSSARY['起批量']).toBe('Số lượng đặt tối thiểu');
    expect(GLOSSARY['最小起订量']).toBe('Số lượng đặt tối thiểu');
    expect(GLOSSARY['阶梯价']).toBe('Giá theo số lượng');
    expect(GLOSSARY['一件代发']).toBe('Giao thay từng đơn');
    expect(GLOSSARY['包邮']).toBe('Miễn phí vận chuyển');
    expect(GLOSSARY['不包邮']).toBe('Không miễn phí vận chuyển');
    expect(GLOSSARY['券后价']).toBe('Giá sau khi áp mã giảm');
    expect(GLOSSARY['到手价']).toBe('Giá sau ưu đãi');
    expect(GLOSSARY['七天无理由退货']).toBe('Trả hàng trong 7 ngày không cần lý do');
    expect(GLOSSARY['不支持退货']).toBe('Không hỗ trợ trả hàng');
    expect(GLOSSARY['非质量问题不退不换']).toBeUndefined(); // Compound phrases go to translator engine with token protection
  });
});
