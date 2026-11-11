# Chat để hiểu nội dung note

Mở một note đã lưu, chọn **Hỏi về note** phía trên phần soạn thảo. Chọn ChatGPT, OpenAI hoặc DeepSeek, nhập câu hỏi rồi bấm **Gửi câu hỏi** (hoặc Ctrl/Cmd + Enter). ChatGPT cần kết nối tài khoản; OpenAI/DeepSeek cần cấu hình khóa API tương ứng hiện có của ứng dụng.

Lịch sử lưu riêng theo note và tài khoản trong PostgreSQL. Đóng bằng **Đóng chat** hoặc Esc; mở lại để tiếp tục. Đóng cửa sổ không hủy lượt đang xử lý. Nếu mất kết nối, dùng **Tải lại lịch sử** trước khi thử gửi lại. Nút **Xóa lịch sử** yêu cầu xác nhận và không sửa nội dung note.

AI chỉ nhận nội dung note đã lưu khi bạn gửi câu hỏi; hãy lưu chỉnh sửa trước. AI đọc văn bản, chưa phân tích ảnh trong note. Câu trả lời dùng Markdown và không tự áp dụng vào note. Lịch sử chat không đi kèm khi xuất bản hoặc clone note; xóa note sẽ xóa lịch sử chat của nó.

## Giới hạn

- 2.000 ký tự/câu hỏi; 40.000 ký tự văn bản note.
- Tối đa 50 lượt hoàn tất mỗi cuộc trò chuyện; xóa lịch sử để bắt đầu lại.
- Toàn bộ lịch sử được lưu, nhưng AI chỉ nhận tối đa 12 lượt gần nhất trong ngân sách 24.000 ký tự. Nhắc lại chi tiết cũ khi cần.
- Các lượt gửi chạy trong request hiện tại (không phải background job). Nếu backend khởi động lại, lượt chưa hoàn tất có thể thất bại; sau tối đa 3 phút có thể thử lại. Chỉ các lượt hoàn tất được lưu.

## Triển khai và kiểm tra

Chạy `npm run migration:run -w api` trước khi khởi động bản API mới. Migration `NoteChat1760000000012` tạo bảng riêng, không thay đổi nội dung note.

`npm test` chạy tests thông thường. `RUN_NOTE_CHAT_INTEGRATION=1 npm run test -w api -- --runInBand note-chat.integration.spec.ts` tạo và xóa database test riêng, cần PostgreSQL với quyền tạo database. Test không gọi nhà cung cấp AI thật.
