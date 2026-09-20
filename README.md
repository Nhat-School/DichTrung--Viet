# TranslateChina 0.2 — Dịch Trung–Việt trên Chrome

Extension miễn phí cho Chrome máy tính: dịch website tiếng Trung, đọc và duyệt web Taobao/1688, quy đổi CNY → VNĐ và đọc chữ trong ảnh. Global is the only one. Hoạt động trên thiết bị (on-device), không cần tài khoản hay API key.

## Cài hoặc cập nhật

Bản build sẵn nằm trực tiếp trong thư mục `.output` (chứa file `manifest.json`).

1. Mở `chrome://extensions` trên trình duyệt Chrome, bật **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
2. Bấm nút **Load unpacked (Tải tiện ích đã giải nén)** và chọn trực tiếp thư mục `.output` của dự án (không cần file zip hay thư mục con).
3. Nếu đã cài trước đó, bấm biểu tượng **Reload / Tải lại (🔄)** trên thẻ tiện ích TranslateChina, sau đó tải lại (F5) tab Taobao/1688 đang mở.
4. Ghim biểu tượng extension lên thanh công cụ. Trong tab **Thiết lập**, bấm **Khởi tạo** cho hai chiều ngôn ngữ nếu Chrome yêu cầu tải mô hình dịch trên máy.

Chrome tự quản lý khả năng cung cấp và tải mô hình; tiện ích báo đúng trạng thái thực tế và không tự gửi văn bản ra ngoài nếu chưa được người dùng cho phép.

## Dịch Taobao, 1688 và mọi website tiếng Trung

Mặc định, TranslateChina tự dịch chữ tiếng Trung trên **mọi trang HTTP/HTTPS**, gồm cả nội dung được tải sau, menu, popup đăng nhập và iframe. Không cần bật từng tên miền. Trong tab **Thiết lập**, dùng công tắc **Tự động dịch mọi website tiếng Trung** để tắt/bật toàn bộ tính năng; công tắc của trang hiện tại vẫn cho phép loại trừ một website cụ thể.

**Tính năng dịch trang web:**
- **Dịch theo lô chịu lỗi (Fault-tolerant batching):** Xử lý văn bản theo từng lô 60 đoạn với cơ chế cách ly lỗi; nếu một tiêu đề có mã sản phẩm đặc biệt chưa xử lý được thì vẫn giữ nguyên văn bản gốc của tiêu đề đó và tiếp tục dịch toàn bộ các sản phẩm còn lại trên trang mà không bị đứng hay ngắt quãng.
- **Bảo toàn thông số kỹ thuật & quy cách:** Cơ chế `preservesFacts` và `protectTokens` thông minh, tự động nhận diện mã hàng (như `LC135260`, `Em5-pro`, `CQR300`), phân khối động cơ (`200CC`, `49cc`, `phân khối`), thông số điện (`60v`, `5600w`), tỷ lệ `%`, số lượng và URL, không phân biệt hoa/thường hay khoảng trắng do bộ dịch sinh ra.
- **Dịch thuộc tính trực quan:** Tự động dịch các thuộc tính hiển thị như `placeholder`, `title`, `aria-label` và thẻ ảnh `alt`.
- **Popup và biểu mẫu đăng nhập:** Dịch nhanh nội dung dialog, placeholder và nhãn của nút `Đăng nhập`/`Gửi`, kể cả trong iframe `about:blank`, `srcdoc` hoặc Shadow DOM mở mà Chrome cho phép extension truy cập.
- **Rê chuột xem bản gốc:** Di chuột vào bất kỳ đoạn văn bản hoặc ô giá nào đã dịch để xem tooltip đối chiếu văn bản gốc tiếng Trung.
- **Tự động theo dõi nội dung cuộn:** Bộ theo dõi `MutationObserver` liên tục quét và dịch các sản phẩm mới xuất hiện khi người dùng cuộn trang.

Chrome không cho extension đọc nội dung trong Shadow DOM đóng, iframe bị sandbox hoàn toàn, hoặc chữ đã vẽ trực tiếp vào ảnh/canvas. Với chữ trong ảnh, dùng **Khoanh vùng** hoặc **Chọn ảnh** để OCR rồi dịch.

## Quy đổi giá CNY sang VNĐ

Chỉ tự động kích hoạt trên **Taobao** và **1688** để tránh nhầm lẫn với các website khác:

- Tự động tìm kiếm các thẻ giá sản phẩm và thay thế trực tiếp bằng giá tiền Việt Nam Đồng (VNĐ).
- Hiển thị nổi bật với kiểu dáng thẻ tương phản cao (nền kem, viền cam nhạt, chữ đỏ đậm).
- Tỷ giá ngoại tệ tự động cập nhật hàng ngày từ API Frankfurter, kèm cơ chế lưu tạm (cache) 6 giờ.
- Hỗ trợ nhập tỷ giá thủ công trong tab **Thiết lập** (hữu ích khi muốn tính theo tỷ giá thanh toán thực tế của đơn vị vận chuyển hoặc khi không có mạng).
- Rê chuột vào giá tiền để xem giá gốc Nhân Dân Tệ (CNY) và tỷ giá đang áp dụng.

## Dịch chữ trong ảnh (OCR)

Tính năng **OCR + dịch văn bản trong ảnh**, xử lý hoàn toàn offline trên máy tính:

- Bấm biểu tượng extension → chọn **Khoanh vùng** (kéo khung chữ nhật quanh vùng cần đọc) hoặc **Chọn ảnh** (bấm trực tiếp vào ảnh sản phẩm); cũng có thể bấm chuột phải vào ảnh và chọn menu TranslateChina.
- Tùy chọn nhận diện chữ **Giản thể** (cho Taobao, 1688) hoặc **Phồn thể** (cho hàng nội địa Đài Loan, Hong Kong).
- Sử dụng mô hình Tesseract LSTM tối ưu đóng gói sẵn cục bộ (`public/vendor/`), không gửi ảnh lên bất kỳ máy chủ nào.
- Bảng công cụ hiển thị ảnh vừa chụp, văn bản đã nhận diện (có thể chỉnh sửa trực tiếp) và nút **Dịch sang tiếng Việt**.

## Tìm hàng & Nhắn người bán

Tab **Tìm & nhắn** trong bảng công cụ (Sidepanel) cung cấp không gian soạn thảo độc lập:

- Lưu riêng từ khóa tìm kiếm và nội dung cần trao đổi với shop.
- Cung cấp sẵn các từ khóa mua sắm thông dụng và các câu hỏi mẫu hỏi người bán (hỏi hàng sẵn, kích thước, phí ship, chiết khấu...).
- Nút sao chép 1 chạm để dán nhanh vào khung chat WangWang hoặc ô tìm kiếm sàn.

## Bộ dịch và Quyền riêng tư

- **Mặc định:** Sử dụng Chrome Translator API cục bộ trên máy và từ điển thuật ngữ mua sắm tích hợp. Không gửi dữ liệu người dùng ra bên ngoài.
- **Tùy chọn Dịch trực tuyến:** Mặc định luôn **TẮT**. Chỉ khi bạn chủ động bật trong tab **Thiết lập**, extension mới sử dụng nguồn dịch dự phòng khi bộ dịch trên máy chưa sẵn sàng. Ảnh chụp OCR luôn được xử lý tại máy, không bao giờ gửi ra ngoài.
- Không thu thập dữ liệu (no telemetry), không quảng cáo, không yêu cầu tạo tài khoản.

## Phát triển và kiểm thử

```sh
npm install
npm run assets      # tải tài nguyên mô hình OCR một lần
npm run build       # build tiện ích trực tiếp vào thư mục .output (để Load unpacked)
npm test            # chạy toàn bộ 71 unit tests với vitest
npm run typecheck   # kiểm tra kiểu dữ liệu TypeScript (tsc --noEmit)
npm run check       # kiểm tra toàn diện: typecheck + unit tests + build
npm run test:e2e    # kiểm thử trình duyệt tự động với Playwright
npm run zip         # (tùy chọn) đóng gói thành file .zip để phân phối nếu cần
```

Dự án xây dựng trên: **WXT**, **Manifest V3**, **React 19**, **TypeScript**, **Chrome Built-in AI APIs**, **Decimal.js**, **Tesseract.js / WebAssembly**.
