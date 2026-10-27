# Thư viện cá nhân và Cộng đồng

- Mỗi tài khoản Google được phép đăng nhập có một UUID trong `app_user`. `note`, `topic`, `question` có `user_id`. Session JWT cũ vẫn dùng được; tài khoản được xác định từ email đã xác thực, không nhận user_id từ frontend.
- HTTP requests thiết lập account scope bằng AsyncLocalStorage sau authentication. Repository truy cập riêng tư phải có scope; thiếu scope sẽ bị từ chối. Raw SQL cho AI worker kiểm tra chủ sở hữu từ owner của job. DB kiểm tra liên kết cùng tài khoản và ngăn đổi user_id.
- Google allowlist `ADMIN_EMAILS` vẫn giữ nguyên. Cộng đồng dành cho tài khoản được phép đăng nhập, không mở anonymous hoặc tự mở đăng ký.

## Xuất bản và sao chép

Trong trang ghi chú, dùng `Xuất bản ghi chú`, `Cập nhật bản công khai`, `Gỡ xuất bản`. Phải lưu bản nháp trước khi xuất bản. Chỉ tiêu đề và Markdown được sao chụp; không chia sẻ chủ đề riêng, câu hỏi, tài liệu nhập, lịch sử AI hay credentials.

Tab `Cộng đồng` hiển thị bản xuất bản của tài khoản khác, mới nhất trước. Chọn một ghi chú để xem Markdown/Mermaid. `Lưu vào thư viện` sao chép nội dung và thông tin nguồn vào ghi chú riêng tư của bạn, có thể chọn một chủ đề riêng. Yêu cầu lưu lặp lại trả về cùng bản sao, không ghi đè nội dung đã sửa. Xóa bản sao cho phép lưu lại nếu bản gốc còn xuất bản. Gỡ/xóa bản gốc không xóa bản sao.

## Migration và vận hành

Trước lần chạy migration `PersonalLibraries1760000000008` trên database có dữ liệu cũ, đặt `LEGACY_OWNER_EMAIL` bằng email chủ sở hữu đã được xác nhận. Migration dừng nếu có dữ liệu mà chưa cấu hình chủ sở hữu; không tự đoán người dùng đầu tiên. Mọi ghi chú/chủ đề/câu hỏi cũ được gán cho tài khoản đó và giữ riêng tư.

Một bản sao lưu database trước migration được giữ trong `.local-backups/` (bị Git ignore). Migration không hỗ trợ tự gỡ quyền sở hữu vì sẽ làm mất tính riêng tư; rollback cần quy trình khôi phục backup đã kiểm tra.

## API

- `GET /topics/catalog`: toàn bộ chủ đề của tài khoản, gồm chủ đề con.
- `GET /notes/:id/publication`: trạng thái xuất bản của ghi chú thuộc tài khoản.
- `POST /notes/:id/publication`: xuất bản/cập nhật snapshot của phiên bản đã lưu.
- `DELETE /notes/:id/publication`: gỡ khỏi Cộng đồng.
- `GET /community/notes?page=1`: feed có phân trang.
- `GET /community/notes/:id`: chỉ đọc snapshot đang xuất bản.
- `POST /community/notes/:id/clone` body `{topicId?: uuid}`: tạo/lấy bản sao riêng tư.

Kiểm thử PostgreSQL và Redis chạy trên database/queue tạm riêng. Có thể bật bằng `RUN_LIBRARY_INTEGRATION=1` và `RUN_AI_JOBS_INTEGRATION=1`, với DATABASE_URL/REDIS_URL cho môi trường thử nghiệm cục bộ. Không gọi AI thật trong các test này.
