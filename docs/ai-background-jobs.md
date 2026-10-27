# AI jobs nền

App dùng BullMQ + Redis để gọi AI ngoài request HTTP, PostgreSQL lưu job/input/kết quả, SSE để thông báo và REST để khôi phục khi mất sự kiện. Áp dụng cho cả 5 thao tác AI ghi chú và tạo câu hỏi từ CV/JD.

## Chạy

`docker-compose up -d --build api web` khởi động Redis nội bộ (AOF, named volume, noeviction) và chạy migration. API dùng Node 24 để đồng nhất khả năng chạy NestJS 12/Jest ESM; TypeScript được build trong image, runtime chạy dist/main.js để không giữ compiler trong RAM. Khi chạy API ngoài Docker, cấu hình `DATABASE_URL`, `REDIS_URL` và thông tin đăng nhập như trước. Redis không được publish ra host trong Compose.

Một consumer chạy trong API process, concurrency 1. Giữ một API replica vì token ChatGPT hiện có khóa refresh trong process và kho file mã hóa. Tách worker/scale replica cần chuyển cơ chế refresh token sang khóa phân tán trước.

## API

- `POST /notes/:id/ai-jobs`: RunAiDto hiện tại; header `Idempotency-Key` là UUID; trả `202`, jobId, trạng thái và Location sau khi ghi job/outbox thành công.
- `POST /practice/import-jobs`: multipart PDF/DOCX tối đa 5MB, source/lang/level, cùng Idempotency-Key; trả `202`.
- `GET /ai-jobs`: active/recent jobs của tài khoản hiện tại; `?status=active` lọc job chưa kết thúc.
- `GET /ai-jobs/events`: SSE cookie JWT, event `job.updated`; heartbeat mỗi 15 giây; đóng khi JWT hết hạn.
- `GET /ai-jobs/:id`: trạng thái/metadata; `GET /ai-jobs/:id/result`: kết quả thành công.
- `POST /ai-jobs/:id/retry`: tạo yêu cầu mới từ job thất bại, cần Idempotency-Key mới. Với ghi chú, lấy snapshot mới.
- `POST /ai-jobs/:id/apply`: áp dụng markdown trong transaction khi source hash vẫn khớp. Nếu nội dung đã thay đổi trả 409, giữ preview để người dùng tự xử lý.

Tất cả endpoint đều xác thực bằng phiên hiện tại; job/draft/result và SSE chỉ thuộc owner đã tạo. Không nhận owner từ body hoặc truyền token trong URL/queue. Route `/notes/:id/ai` và `/practice/imports` cũ được giữ để tương thích; frontend mới dùng các endpoint job.

## Vòng đời và giới hạn

queued → running → succeeded, hoặc retrying/failed. Job đã được nhận vẫn chạy khi chuyển trang/đóng tab. Frontend không tự chuyển trang hoặc tự ghi đè editor khi có kết quả. Kết quả văn bản cần xem preview và bấm áp dụng. Sinh câu hỏi lưu câu hỏi trong transaction, không tải lại title/body đang chỉnh sửa.

Mỗi owner tối đa 3 job chưa kết thúc. Hạn xử lý tổng 5 phút, gồm thời gian chờ queue. Lỗi tạm thời được thử lại tối đa một lần với exponential backoff+jitter; quota ChatGPT, lỗi xác thực và dữ liệu không hợp lệ không tự retry. Provider timeout giữ giới hạn hiện có; hết deadline job sẽ thất bại và không được áp dụng kết quả muộn.

Outbox được scan mỗi giây; nếu Redis không khả dụng, job đã ghi PostgreSQL vẫn giữ pending để phục hồi. Cleanup và kiểm tra deadline chạy trước Redis dispatch để giữ retention ngay cả khi Redis lỗi. Kết quả ghi chú lưu 7 ngày. File import được lưu tạm trong input PostgreSQL (không đưa vào Redis), xóa khỏi job khi thành công; job import và draft hết hạn sau khoảng 1 giờ. Cleanup cần API process hoạt động. Draft có owner, đáp án không trả về trước chấm; grade và ghi câu hỏi được commit cùng marker để việc gửi grade lặp không lưu trùng.

BullMQ delivery là at-least-once. Kết quả AI được lưu trước finalization, finalization khóa job row và commit câu hỏi/job success cùng transaction. Nếu worker bị ngắt sau khi đã lưu output, khôi phục không gọi AI lại. Nếu ngắt sau khi provider tạo xong nhưng trước khi output được ghi, vẫn có thể gọi AI thêm lần nữa; không có bảo đảm exactly-once inference.

## Frontend

AiJobsProvider giữ một EventSource cho mỗi app tab. REST sync lúc mount/reconnect/focus và định kỳ ~30 giây khi kết nối tốt. Mất SSE thì polling backoff 3–15 giây kèm jitter; tab ẩn tạm dừng REST polling. Merge theo revision để bỏ sự kiện trùng hoặc đến sai thứ tự. Job gần đây mở qua khay AI góc dưới; toast chỉ là thông báo, kết quả được giữ ở backend. JWT hết hạn sẽ yêu cầu đăng nhập lại và đóng stream.

SSE không gửi notification hệ điều hành khi trình duyệt đã đóng; Web Push nằm ngoài phiên bản này.

## Kiểm thử

- Unit: `npm run test -w api -- --runInBand`
- Frontend: `npm run test -w web`
- Tích hợp: `docker-compose exec -T -e RUN_AI_JOBS_INTEGRATION=1 api npm test -- --runInBand ai-jobs.integration.spec.ts`

Integration suite tự tạo database riêng tên `ai_job_test_*`, queue Redis riêng `test-ai-*`, dùng AI giả lập, rồi dọn riêng tài nguyên kiểm thử. Bao phủ HTTP202 trước inference, idempotency, phân quyền, source snapshot, apply conflict, worker replay, question finalization trùng, file/draft restart và cleanup khi Redis lỗi. Không dùng hạn mức ChatGPT thật.

### Markdown results and diagrams

Note editors provide Chỉnh sửa / Xem trước for the current unsaved draft. The AI result modal renders Markdown without a source editor. Both use the shared MarkdownPreview, including GFM tables and Mermaid code fences. Invalid diagrams show an error and the original source. Mermaid runs locally in strict mode; sanitized SVG is displayed as an isolated image.

New note-generation and translation jobs capture Markdown/Mermaid formatting instructions; JSON question/import tasks retain their existing format. Existing jobs retain their original captured prompt.

The web predev/prebuild scripts prepare the self-hosted Mermaid ESM distribution from the installed dependency. Run `npm run dev --workspace apps/web` or the normal Docker stack so this preparation runs. Generated assets are ignored by Git. No external diagram rendering service is used.

### Output token budgets

New `expand` and `generate-content` jobs capture a maximum output budget of 20,000 tokens. `summarize` and `translate-note` retain 2,500 tokens; question generation retains 2,000. Existing jobs keep their captured request and results; create a new job to use a changed budget. The upstream provider's model limits still apply.
