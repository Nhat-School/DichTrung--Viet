export interface CaptchaResolution {
  zh: string;
  vi: string;
}

const CAPTCHA_OBJECTS: { patterns: RegExp[]; zh: string; vi: string }[] = [
  { patterns: [/监控/i, /摄像头/i, /摄像/i, /探头/i, /监控器/i], zh: '监控摄像头', vi: 'camera giám sát' },
  { patterns: [/灭火器/i, /灭火/i, /火器/i], zh: '灭火器', vi: 'bình chữa cháy' },
  { patterns: [/消火栓/i, /消防栓/i, /水栓/i], zh: '消火栓', vi: 'trụ cứu hỏa' },
  { patterns: [/电话亭/i, /话亭/i], zh: '电话亭', vi: 'bốt điện thoại' },
  { patterns: [/方形开关/i, /开关/i, /墙壁开关/i], zh: '方形开关', vi: 'công tắc vuông' },
  { patterns: [/红绿灯/i, /交通灯/i, /信号灯/i], zh: '红绿灯', vi: 'đèn giao thông' },
  { patterns: [/斑马线/i, /人行横道/i], zh: '斑马线', vi: 'vạch kẻ đường' },
  { patterns: [/自行车/i, /单车/i, /脚踏车/i], zh: '自行车', vi: 'xe đạp' },
  { patterns: [/公交车/i, /公共汽车/i, /巴士/i, /大巴/i], zh: '公交车', vi: 'xe buýt' },
  { patterns: [/汽车/i, /小轿车/i, /轿车/i, /小汽车/i], zh: '汽车', vi: 'ô tô' },
  { patterns: [/摩托车/i, /机车/i, /电瓶车/i], zh: '摩托车', vi: 'xe máy' },
  { patterns: [/卡车/i, /货车/i], zh: '卡车', vi: 'xe tải' },
  { patterns: [/雨伞/i, /雨遮/i], zh: '雨伞', vi: 'cây dù' },
  { patterns: [/六个人/i, /6个人/i, /有六/i, /有6/i, /(?<![灭消])人/i], zh: '人', vi: 'người' },
  { patterns: [/楼梯/i, /台阶/i], zh: '楼梯', vi: 'cầu thang' },
  { patterns: [/水龙头/i, /龙头/i], zh: '水龙头', vi: 'vòi nước' },
  { patterns: [/长椅/i, /长凳/i], zh: '长椅', vi: 'ghế dài' },
  { patterns: [/椅子/i, /板凳/i], zh: '椅子', vi: 'ghế' },
  { patterns: [/床/i], zh: '床', vi: 'giường' },
  { patterns: [/杯子/i, /水杯/i], zh: '杯子', vi: 'chiếc cốc' },
  { patterns: [/门/i], zh: '门', vi: 'cánh cửa' },
  { patterns: [/窗户/i], zh: '窗户', vi: 'cửa sổ' },
  { patterns: [/船/i], zh: '船', vi: 'con thuyền' },
  { patterns: [/桥/i], zh: '桥', vi: 'cây cầu' },
  { patterns: [/烟囱/i], zh: '烟囱', vi: 'ống khói' },
];

const CAPTCHA_QUANTITIES: { patterns: RegExp[]; zh: string; vi: string }[] = [
  { patterns: [/正好1/i, /正.*1.*个/i, /正好.*1/i], zh: '正好1个', vi: 'Đúng 1' },
  { patterns: [/正好2/i, /正.*2.*个/i, /正好.*2/i], zh: '正好2个', vi: 'Đúng 2' },
  { patterns: [/正好3/i, /正.*3.*个/i, /正好.*3/i], zh: '正好3个', vi: 'Đúng 3' },
  { patterns: [/正好4/i, /正.*4.*个/i, /正好.*4/i], zh: '正好4个', vi: 'Đúng 4' },
  { patterns: [/只有2/i, /只.*2.*个/i, /只.*2/i, /有2个/i, /(?:只|有).*2/i, /(?<!\d)2个/i, /两/i], zh: '只有2个', vi: 'Chỉ có 2' },
  { patterns: [/只有3/i, /只.*3.*个/i, /只.*3/i, /有3个/i, /(?:只|有).*3/i, /(?<!\d)3个/i], zh: '只有3个', vi: 'Chỉ có 3' },
  { patterns: [/只有4/i, /只.*4.*个/i, /只.*4/i, /有4个/i, /(?:只|有).*4/i, /(?<!\d)4个/i], zh: '只有4个', vi: 'Chỉ có 4' },
  { patterns: [/只有5/i, /只.*5.*个/i, /只.*5/i, /有5个/i, /(?:只|有).*5/i, /(?<!\d)5个/i], zh: '只有5个', vi: 'Chỉ có 5' },
  { patterns: [/只有1/i, /只.*1.*个/i, /只.*1/i, /有1个/i, /(?:只|有).*1/i, /(?<!\d)1个/i, /只.*[|!liI]/i, /^只/i, /只有/i], zh: '只有1个', vi: 'Chỉ có 1' },
  { patterns: [/有六/i, /有6/i, /六个/i, /6个/i, /六人/i, /6人/i], zh: '有六个', vi: 'Có 6' },
];

export function resolveCaptchaPrompt(rawText: string): CaptchaResolution | null {
  if (!rawText || !rawText.trim()) return null;
  const cleaned = rawText.replace(/[\s\-_—·.,:;!?'"|/\\+*~]/g, '');

  let targetObj = CAPTCHA_OBJECTS.find(o => o.patterns.some(p => p.test(rawText) || p.test(cleaned)));
  if (!targetObj) {
    if (cleaned.includes('控')) targetObj = CAPTCHA_OBJECTS.find(o => o.zh === '监控摄像头');
    else if (cleaned.includes('栓')) targetObj = CAPTCHA_OBJECTS.find(o => o.zh === '消火栓');
    else if (cleaned.includes('伞')) targetObj = CAPTCHA_OBJECTS.find(o => o.zh === '雨伞');
    else if (cleaned.includes('梯')) targetObj = CAPTCHA_OBJECTS.find(o => o.zh === '楼梯');
  }

  const targetQty = CAPTCHA_QUANTITIES.find(q => q.patterns.some(p => p.test(rawText) || p.test(cleaned)));

  if (targetObj && targetQty) {
    const vi = `${targetQty.vi} ${targetObj.vi}`;
    const zh = `${targetQty.zh}${targetObj.zh}`;
    return { zh, vi: vi.charAt(0).toUpperCase() + vi.slice(1) };
  }

  if (targetObj) {
    const vi = targetObj.vi;
    return { zh: targetObj.zh, vi: vi.charAt(0).toUpperCase() + vi.slice(1) };
  }

  if (targetQty) {
    return { zh: targetQty.zh, vi: targetQty.vi };
  }

  return null;
}
