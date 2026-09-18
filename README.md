# TranslateChina — Tiện ích Chrome Mua Hàng Trung Quốc Bằng Tiếng Việt

**TranslateChina** là tiện ích mở rộng (Chrome Extension) dành cho máy tính, giúp bạn mua sắm trực tiếp trên **Taobao** và **1688** bằng tiếng Việt, quy đổi giá tiền sang **VNĐ** theo thời gian thực và hỗ trợ **dịch chữ trong ảnh** bằng nhận diện OCR trên máy.

---

## 🌟 Điểm Nổi Bật

- **100% Xử lý trên máy (On-Device)**: Không cần tạo tài khoản, không cần API key, không gửi dữ liệu người dùng hay nội dung trang web về máy chủ trung gian.
- **Dịch trực tiếp trên trang**: Dịch tiêu đề, thông số kỹ thuật, mô tả, phân loại màu sắc, kích thước và đánh giá sản phẩm.
- **Giữ bản gốc & Chống hiển thị nhầm (Stale Invalidation)**: Rê chuột lên đoạn đã dịch để đối chiếu bản gốc tiếng Trung. Khi bạn đổi mẫu, đổi phân loại (SKU), số lượng hoặc cuộn tải thêm, tiện ích tự động hủy kết quả dịch đã lỗi thời để đảm bảo không hiển thị nhầm thông số hay giá tiền.
- **Quy đổi CNY → VNĐ**: Tự động tính giá VNĐ hiển thị cạnh giá tệ gốc dựa trên tỷ giá Frankfurter (cập nhật hàng ngày, lưu đệm 6 tiếng). Có chức năng nhập tỷ giá riêng để đối chiếu với bên mua hộ.
- **Đọc chữ trong ảnh (OCR tiếng Trung)**: Sử dụng Tesseract.js / WebAssembly tích hợp sẵn trong extension (offline). Bạn chỉ cần khoanh vùng hoặc bấm vào ảnh trên màn hình để nhận diện và dịch sang tiếng Việt.
- **Tìm hàng & Soạn tin nhắn**: Nhập tiếng Việt để dịch sang tiếng Trung (tìm kiếm sản phẩm hoặc nhắn tin thương lượng với người bán) kèm nút sao chép nhanh một chạm.

---

## 🚀 Hướng Dẫn Cài Đặt (Load Unpacked)

Extension sẵn sàng để cài đặt trực tiếp vào trình duyệt Google Chrome thông qua tính năng **Tải tiện ích đã giải nén (Load unpacked)**:

### Bước 1: Chuẩn bị mã nguồn và build tiện ích

Mở Terminal tại thư mục dự án và chạy:

```bash
# Cài đặt các gói phụ thuộc (nếu chưa cài)
npm install

# Kiểm tra mã nguồn, chạy 50 bài kiểm thử tự động và build tiện ích
npm run check
```

Thư mục tiện ích sau khi build sẽ nằm tại: `.output/chrome-mv3`.

### Bước 2: Cài vào Google Chrome

1. Mở trình duyệt Google Chrome trên máy tính.
2. Truy cập vào đường dẫn: `chrome://extensions` (hoặc vào menu Chrome → **Tiện ích mở rộng** → **Quản lý tiện ích mở rộng**).
3. Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải màn hình.
4. Bấm nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
5. Chọn thư mục `.output/chrome-mv3` trong thư mục dự án này.
6. Tiện ích **TranslateChina — Trung → Việt** sẽ xuất hiện trên thanh công cụ của Chrome. Bạn nên ghim (Pin) biểu tượng tiện ích để dễ thao tác.

---

## 📖 Hướng Dẫn Sử Dụng

### 1. Dịch trang Taobao / 1688
- Khi bạn truy cập trang chi tiết sản phẩm hoặc tìm kiếm trên Taobao hoặc 1688, tiện ích sẽ tự động dịch các văn bản tiếng Trung sang tiếng Việt.
- **Xem lại bản gốc**: Rê chuột (hover) vào bất kỳ đoạn văn bản nào đã dịch để xem chú thích bản gốc tiếng Trung.
- **Bật/Tắt theo website**: Bấm vào biểu tượng extension trên thanh công cụ để bật/tắt tính năng tự dịch riêng cho Taobao hoặc 1688. Khi tắt, trang sẽ phục hồi nguyên văn bản gốc tiếng Trung.

### 2. Xem giá quy đổi VNĐ
- Bên cạnh các mức giá tiếng Trung (`¥...`, `...元`), tiện ích hiển thị nhãn giá ước tính bằng VNĐ (ví dụ: `≈ 385.000 ₫`).
- Hỗ trợ đầy đủ giá đơn, khoảng giá (`¥19.90 - 39.90`), giá theo bậc số lượng (bán sỉ 1688) và phí vận chuyển nội địa.
- Để cập nhật tỷ giá mới nhất hoặc nhập tỷ giá mua hộ riêng, bấm vào biểu tượng extension → tab **Thiết lập** (hoặc bấm nút làm mới tỷ giá `↻`).

### 3. Dịch chữ trong ảnh (OCR)
1. Trên trang mua hàng, bấm biểu tượng extension hoặc click chuột phải vào ảnh chọn **TranslateChina: Dịch vùng ảnh đang thấy**.
2. Chọn **⌗ Khoanh vùng** để kéo chọn vùng chữ trên màn hình, hoặc **▧ Chọn ảnh** để bấm trực tiếp vào ảnh.
3. Bảng công cụ bên phải (Side Panel) sẽ hiển thị ảnh đã cắt, chữ tiếng Trung nhận diện được (cho phép bạn sửa nếu ảnh mờ) và bản dịch tiếng Việt tương ứng.
4. Ảnh và kết quả tạm thời sẽ tự động dọn dẹp sau 5 phút để bảo vệ quyền riêng tư.

### 4. Tìm hàng & Nhắn người bán
- Mở bảng công cụ tiện ích, chọn tab **Tìm & nhắn**.
- **Tìm hàng**: Nhập tên sản phẩm bạn muốn tìm bằng tiếng Việt (ví dụ: `áo sơ mi nam vải đũi cộc tay`) → Bấm **Dịch sang tiếng Trung** → Bấm **Sao chép** để dán vào ô tìm kiếm của Taobao/1688.
- **Nhắn người bán**: Soạn câu hỏi bằng tiếng Việt (ví dụ: `Sản phẩm này còn hàng không? Tôi mua 50 chiếc có giảm giá không?`) → Nhận bản dịch tiếng Trung chuẩn xác để gửi người bán.

---

## 🛠 Lệnh Phát Triển & Kiểm Thử

Dự án sử dụng **TypeScript**, **WXT Framework**, **React 19**, **Decimal.js**, **Tesseract.js** và **Vitest**:

```bash
# Khởi động môi trường phát triển (Hot reload)
npm run dev

# Chuẩn bị asset offline (tải mô hình OCR tiếng Trung và tạo icon)
npm run assets

# Kiểm tra kiểu dữ liệu TypeScript
npm run typecheck

# Chạy toàn bộ 50 unit test (tiền tệ, bộ lọc giá, từ điển, 100 câu mẫu, stale invalidation, OCR)
npm test

# Chạy kiểm thử tự động End-to-End với Playwright
npm run test:e2e

# Chạy quy trình kiểm tra toàn diện trước khi đóng gói
npm run check

# Đóng gói file ZIP để phân phối
npm run zip
```

---

## 🔒 Cam Kết Quyền Riêng Tư & An Toàn

- **Không tài khoản, không theo dõi**: Không lưu lịch sử duyệt web hay hành vi người dùng.
- **Nguồn tỷ giá mở**: Sử dụng Frankfurter API công khai để lấy tỷ giá ngoại tệ, không yêu cầu API key.
- **Bảo toàn số liệu**: Hệ thống Token Shield tự động bảo vệ các con số, mã sản phẩm, đường link và đơn vị đo lường trong quá trình dịch, chống việc dịch sai lệch số lượng hoặc giá cả hàng hóa.
