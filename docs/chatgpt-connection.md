# Kết nối ChatGPT cá nhân: local và máy chủ từ xa

Google tiếp tục xác thực quyền vào app. Trong ghi chú, mở **Trợ lý AI → ChatGPT — gói của bạn → Tiếp tục với ChatGPT**, rồi tự đăng nhập và cấp quyền trên trang OpenAI. Tạo câu hỏi từ CV/JD cũng dùng kết nối cá nhân này.

App lấy mô hình từ danh sách được tài khoản cho phép. Hạn mức phụ thuộc tài khoản và điều kiện chương trình Sign in with ChatGPT. Nếu chưa kết nối hoặc hết hạn mức, app báo lỗi và không tự chuyển sang API key. OpenAI API và DeepSeek là các lựa chọn dùng khóa của máy chủ, được chọn rõ ràng riêng trong bảng AI.

## Cấu hình

- `WEB_ORIGIN`: địa chỉ local của giao diện, mặc định `http://localhost:3000`, hoặc origin HTTPS của giao diện production.
- `CHATGPT_REDIRECT_URI`: mặc định `http://127.0.0.1:4000/chatgpt/callback`. Phải dùng HTTP loopback 127.0.0.1, đúng path này.
- `CHATGPT_TOKEN_SECRET`: khóa mã hóa tùy chọn; nếu bỏ trống dùng `JWT_SECRET`. Cần giữ khóa ổn định và bí mật. Đổi khóa này yêu cầu kết nối lại các tài khoản.
- `CHATGPT_CREDENTIALS_DIR`: thư mục riêng lưu token mã hóa và ID máy ổn định. Docker Compose dùng named volume `chatgpt-credentials` tại `/data/chatgpt`; không xóa volume khi khởi động lại.

Token không được trả về frontend. Mỗi tài khoản Google trong app có kết nối riêng; access token, refresh token và ID token được mã hóa AES-256-GCM, ghi nguyên tử với quyền file 0600. Kết nối dành cho một tiến trình API, local hoặc remote; không triển khai nhiều replica với cùng kho file này.

## Production trên Northflank: đăng nhập qua forwarding

Ứng dụng hỗ trợ gói ChatGPT cá nhân trên máy chủ, với một bước forwarding trong lúc kết nối/kết nối lại. Callback `127.0.0.1` luôn tới máy mở trình duyệt; chỉ đổi callback thành domain HTTPS không tương thích luồng đăng ký public client này. Website OAuth dành cho đăng nhập định danh là luồng riêng, không tự thay thế quyền dùng gói ChatGPT.

1. Deploy code API và web mới. Giữ `WEB_ORIGIN=https://app.interviewbase.site`, Google callback ở domain API production, và `CHATGPT_REDIRECT_URI=http://127.0.0.1:4000/chatgpt/callback`.
2. Gắn persistent volume vào API, ví dụ `/data/chatgpt`, đặt `CHATGPT_CREDENTIALS_DIR=/data/chatgpt` và khóa mã hóa riêng ổn định `CHATGPT_TOKEN_SECRET`. File `host-id` cũng phải tồn tại qua restart. Chỉ chạy **một API replica** để giữ state OAuth và khóa refresh trong cùng tiến trình.
3. Trên máy mở trình duyệt, chạy:

   ```bash
   northflank forward service --projectId default --serviceId interview-kb --skipHostnames
   ```

4. Giữ terminal này mở. Lấy địa chỉ loopback/cổng mà CLI in ra, ví dụ `127.0.0.1:36039`. Trong giao diện **production**, chọn ChatGPT và nhập `36039` vào **Cổng kết nối trên máy này**, rồi bấm **Tiếp tục với ChatGPT**. Phải forward tới API production, không phải API dev hoặc PostgreSQL.
5. Trình duyệt đi tới `/chatgpt/authorize` qua cổng local đã forward, nhận cookie ràng buộc browser rồi chuyển tới OpenAI. Callback quay lại chính cổng đó. Server đổi code bằng PKCE, xác minh danh tính và scope, mã hóa token trên volume rồi đưa trình duyệt về giao diện production.
6. Sau khi thấy kết nối thành công, có thể tắt forwarding. Inference và refresh token chạy trên API production. Nếu server restart trong lúc OAuth chưa xong, tạo lại yêu cầu kết nối. Lần kết nối lại có thể dùng cổng forwarding khác; URI chính xác được lưu riêng theo từng lần đăng nhập.

Không sao chép token vào trình duyệt, localStorage, repo hay URL. `authorize` và `callback` chỉ chấp nhận Host `127.0.0.1`; cổng truyền vào connect được xác thực trong khoảng 1024–65535. Vẫn giữ kiểm tra state, nonce, PKCE, cookie và return path. HTTP log bỏ query string để không ghi code/state/ticket.

Đây là hỗ trợ cho app cá nhân tự host; không phải đăng nhập một lần bấm cho mọi người dùng website mà không có bước local. Hướng dẫn [OpenAI cho máy chủ từ xa](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) mô tả đăng nhập local và bảo vệ phiên trên máy chủ; ứng dụng này dùng tunnel để callback local tới cùng API giữ phiên.

## Tránh local chuyển về production

Trong `.env` local dùng `WEB_ORIGIN=http://localhost:3000`, `NEXT_PUBLIC_API_URL=http://localhost:4000`, `GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback`. `apps/web/.env.local` cũng phải trỏ API local vì Next.js ưu tiên file này. Đăng ký Google callback local trong Google Console. Dùng PostgreSQL/Redis local và một thư mục credentials local riêng để không cùng xử lý job hay refresh token với production.

Ngắt kết nối xóa token trong app và yêu cầu OpenAI thu hồi refresh token. Nếu không xác nhận được việc thu hồi từ OpenAI, UI thông báo để bạn tự thu hồi trong cài đặt tài khoản. App giữ ID đăng ký và ID máy để các lần kết nối lại ổn định.

Responses API được gọi với `store: false` và stream; chỉ nhận kết quả khi có `response.completed`. Nội dung ghi chú hoặc tài liệu vẫn được gửi đến OpenAI khi bạn yêu cầu AI xử lý.

## Xác minh

Kiểm thử tự động mô phỏng OpenAI: mã hóa/cách ly người dùng, PKCE/state/browser binding, chữ ký JWT/issuer/audience/nonce/azp, code exchange, refresh đồng thời, disconnect khi refresh, stream bị ngắt và lỗi hạn mức. Đăng nhập/cấp quyền và inference thật cần kiểm tra bằng tài khoản đủ điều kiện của người dùng.

Tài liệu chính thức: [Quickstart](https://developers.openai.com/siwc/quickstart), [Sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).
