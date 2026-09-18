# TranslateChina 0.2 — Dịch Trung–Việt trên Chrome

Extension miễn phí cho Chrome máy tính: dịch website tiếng Trung, hỗ trợ mua hàng Taobao/1688, quy đổi CNY → VNĐ và đọc chữ trong ảnh. Không cần tài khoản hay API key.

## Cài hoặc cập nhật

Bản build sẵn nằm trong `.output/chrome-mv3`.

1. Mở `chrome://extensions`, bật **Developer mode**.
2. Nếu cài lần đầu, chọn **Load unpacked** và chọn thư mục trên.
3. Nếu đã cài, bấm **Reload / Tải lại** trên thẻ TranslateChina, đóng bảng công cụ cũ và tải lại các tab đang dùng.
4. Ghim biểu tượng extension trên thanh công cụ. Trong **Thiết lập**, bấm **Khởi tạo** cho hai chiều ngôn ngữ nếu Chrome yêu cầu tải mô hình.

Chrome quản lý khả năng cung cấp/tải mô hình; không thể coi việc có API là mô hình đã sẵn sàng. Extension báo đúng trạng thái, không tự gửi văn bản ra ngoài nếu bộ dịch trên máy lỗi.

## Dịch website tiếng Trung khác

Taobao và 1688 tự bật theo cài đặt. Trên một website HTTP/HTTPS khác:

1. Mở website, bấm biểu tượng TranslateChina.
2. Bấm **Cho phép dịch website này** và chấp nhận quyền cho đúng địa chỉ đó.
3. Website được ghi nhớ và tự dịch ở các lần mở sau. Bật/tắt riêng trong popup hoặc Thiết lập.

Quyền bổ sung là tùy chọn theo địa chỉ, không yêu cầu đọc mọi website khi cài đặt. Trang nội bộ Chrome, Chrome Web Store, PDF của trình duyệt, khung nhúng khác nguồn và nội dung Shadow DOM đóng có thể không cho phép chèn dịch; dùng khoanh ảnh nếu Chrome cho phép chụp. Tiện ích ưu tiên phần đang nhìn thấy và nội dung mới khi cuộn, giữ nguyên ô người dùng đang nhập, dịch thêm placeholder/title/aria-label/alt và xử lý đoạn văn dài. Rê chuột để đối chiếu bản gốc; tắt để phục hồi.

Quy đổi tiền chỉ bật trên **Taobao/1688**, tránh nhầm số hoặc ký hiệu tiền ở website khác. Frankfurter cung cấp tỷ giá theo ngày; kiểm tra lại khi dùng nếu cache quá 6 giờ. Có tỷ giá tự nhập và trạng thái dùng dữ liệu cũ khi mất mạng. Giá quy đổi là ước tính, chưa tự tính các khoản phí không hiển thị.

## Dịch chữ trong ảnh

Đây là **OCR + dịch văn bản**, không phải tìm sản phẩm tương tự bằng hình ảnh.

- Bấm biểu tượng extension → **Khoanh vùng** hoặc **Chọn ảnh**; cũng có menu chuột phải trên ảnh.
- Chọn **giản thể** cho Taobao/1688; chọn **phồn thể** khi đọc ảnh từ Đài Loan/Hong Kong.
- OCR sử dụng mô hình LSTM độ chính xác cao đóng gói cục bộ, chế độ chữ rải, phóng ảnh có giới hạn, hai lượt xử lý màu/tương phản và đối chiếu vị trí dòng. Ảnh không tải lên máy chủ OCR.
- Bảng công cụ hiển thị ảnh gốc, chữ nhận diện có thể sửa, các dòng cần kiểm tra và nút **Dịch sang tiếng Việt**. Khoanh sát chữ thường tốt hơn chọn cả ảnh sản phẩm nhiều chi tiết.
- Ảnh dài chỉ chụp phần đang nhìn thấy. Ảnh mờ, font cách điệu hoặc chữ quá nhỏ vẫn có thể đọc sai, kể cả khi điểm tin cậy cao. Không tự sửa từ dựa trên phỏng đoán.
- Nếu Chrome từ chối chụp, bấm biểu tượng extension trên chính tab đó rồi chọn lại. Công cụ kiểm tra tab trước/sau chụp để không nhận nhầm ảnh từ tab khác.
- Có thể hủy; ảnh và kết quả nhận diện trong bộ nhớ phiên tự xóa sau 5 phút.

## Tìm hàng, nhắn người bán

Tab **Tìm & nhắn** giữ riêng bản nháp tìm kiếm và lời nhắn. Có từ khóa gợi ý, mẫu hỏi shop và nút sao chép. Bạn tự dán vào ô tìm kiếm hoặc tự gửi tin; extension không gửi thay bạn.

## Bộ dịch và quyền riêng tư

Mặc định dùng Chrome Translator API trên thiết bị và từ điển nhãn thông dụng. Nội dung được dịch nguyên câu trước; nếu số liệu hoặc mã hàng bị thay đổi, công cụ thử bảo vệ các giá trị rồi dịch lại. Bộ kiểm tra này không thay thế việc đối chiếu nội dung và không bảo đảm mọi ý nghĩa đều chính xác.

**Dịch trực tuyến là tùy chọn tắt mặc định.** Chỉ khi bạn bật rõ ràng trong Thiết lập và cấp quyền cho `translate.googleapis.com`, văn bản có thể được gửi đến Google khi bộ dịch trên máy chưa sẵn sàng. Nguồn trực tuyến miễn phí không chính thức có thể bị giới hạn hoặc thay đổi; không có cam kết hoạt động liên tục. Giao diện hiển thị khi tùy chọn này đang bật. Có thể tắt bất cứ lúc nào. Kể cả khi bật, ảnh vẫn chỉ nhận diện trên máy; chỉ phần chữ yêu cầu dịch mới có thể ra ngoài.

Không có tài khoản, telemetry hay quảng cáo. Cài đặt lưu cục bộ; bản nháp lưu trong phiên bảng công cụ. Tỷ giá gọi Frankfurter; Chrome tự quản lý tải mô hình dịch.

## Phát triển và kiểm thử

```sh
npm install
npm run assets      # tải tài nguyên OCR miễn phí một lần
npm run check       # TypeScript, unit tests, bản build
npm run test:e2e    # kiểm thử trình duyệt (chạy npm run build trước)
npm run zip         # ZIP cài bằng Load unpacked sau khi giải nén
```

Công nghệ: WXT, Manifest V3, React, TypeScript, Chrome Translator API, Decimal.js, Tesseract.js/WebAssembly. Mô hình OCR đóng gói khiến bản cài lớn hơn extension chỉ gọi API, đổi lại nhận diện ảnh không cần mạng.

Các bài kiểm thử gồm tiền tệ, bảo toàn số liệu/mã hàng, lỗi bộ dịch và opt-in trực tuyến, chia văn bản dài, DOM động và thuộc tính bị thay đổi khi đang dịch, cấp phạm vi website, cắt ảnh theo tỷ lệ màn hình và ghép dòng OCR. Bộ 100 câu là kiểm tra bảo toàn token, **không phải** chứng nhận chất lượng dịch máy của 100 câu.

Kiểm thử trình duyệt tải bản extension đã build trong Chromium riêng, kiểm tra OCR thực trên ảnh xe đẩy được báo lỗi, dịch website ngoài hai sàn, phục hồi nguyên văn và bản nháp độc lập. Quyền cho website giả lập được cấp trong manifest tạm của bài test; hộp thoại cấp quyền Chrome cần kiểm tra tương tác khi cài thật. Không dùng tài khoản mua hàng và không thực hiện giao dịch.

Ảnh hồi quy đã khôi phục bốn dòng thông số bị bỏ sót; chữ trắng cách điệu như `白色` vẫn có thể bị OCR nhầm thành `日色`. Vì vậy luôn giữ ảnh gốc và khả năng sửa chữ, không tuyên bố OCR chính xác 100%.
