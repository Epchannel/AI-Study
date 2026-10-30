# Học Cùng trên Windows VPS và Cloudflare Tunnel

Trạng thái ghi nhận ngày 2026-10-30. Website hiện tại: **https://chatbotvido.io.vn**. Đây là hướng dẫn vận hành instance đã triển khai; hướng dẫn cài đặt từ source nằm ở [Windows native support](windows-native-support.md).

## Kiến trúc và tài khoản

Cloudflare Tunnel chuyển HTTPS tới Next.js tại `127.0.0.1:3003`. Next.js proxy API tới FastAPI tại `127.0.0.1:8000`. Hai tiến trình chỉ lắng nghe loopback; không cần mở cổng ứng dụng ra Internet. Tunnel có tên `chatbotvido-ai-study`.

Chủ cài đặt đã khởi tạo tài khoản giáo viên trước khi mở đăng ký công khai. Mỗi người đăng ký sau đó có tài khoản học sinh riêng, với lịch sử và tiến độ riêng; không dùng mật khẩu chung. `/workspace` là giao diện cũ, không phải workspace được hỗ trợ trên domain công khai này.

## Cấu hình riêng

Instance Windows dùng `native-data/settings.env`. Ví dụ dưới đây chỉ mô tả các giá trị cần có; thay placeholder bằng secret được tạo riêng trước khi chạy, không ghi đè secret đang dùng:

```dotenv
ENVIRONMENT=production
AUTH_ENABLED=true
DEPLOYMENT_MODE=multi_user
JWT_SECRET_KEY=<persistent-random-secret>
CORS_ORIGINS=https://chatbotvido.io.vn
TRUST_PROXY_HEADERS=true
APP_AUTO_CREATE_TABLES=false
CODE_SANDBOX_BACKEND=disabled
LLM_PROVIDER=custom
LLM_MODEL=gpt-5.6-luna
CUSTOM_LLM_BASE_URL=https://apihnq.hnquan.com/v1
CUSTOM_LLM_MODEL=gpt-5.6-luna
API_HNQ_KEY=<private-client-key>
CUSTOM_LLM_API_KEY=
LLM_REQUIRED=true
EMBEDDING_MODE=skip
```

Giữ nguyên JWT secret và khóa mã hóa hiện có qua các lần restart. Xem [HNQ gateway](../hnq-gateway.md) về thứ tự ưu tiên key. Không đưa secret vào biến frontend, Git, ảnh chụp hoặc log. Thư mục `native-data` và `local-backups` chứa dữ liệu riêng; ACL của instance hiện tại chỉ cho người vận hành, SYSTEM và Administrators truy cập.

## Ingress bắt buộc cho domain công khai

Không chuyển tiếp toàn bộ `/api/*`: các API workspace cũ có thao tác cấu hình LLM dùng chung. Cấu hình tunnel hiện tại xét các rule sau theo thứ tự, trong phạm vi hostname của website:

| Thứ tự | Biểu thức đường dẫn | Đích |
| --- | --- | --- |
| 1 | `[\x00-\x20\x7f\\]` | HTTP 404 |
| 2 | `.*%.*` | HTTP 404 |
| 3 | `(^|/)[.]{1,2}(/|$)` | HTTP 404 |
| 4 | `^/api/academy(/.*)?$` | `http://127.0.0.1:3003` |
| 5 | `^/api/health/(live|ready)$` | `http://127.0.0.1:3003` |
| 6 | `(?i)^/+api(/.*)?$` | HTTP 404 |
| 7 | Các đường dẫn còn lại của hostname | `http://127.0.0.1:3003` |
| 8 | Catch-all ngoài hostname | HTTP 404 |

Ba rule đầu chặn các cách biểu diễn đường dẫn có thể được Cloudflared và Next.js chuẩn hóa khác nhau. Không đổi thứ tự allow/deny khi chỉnh ingress. Cấu hình này chủ động từ chối cả đường dẫn chứa percent encoding. Kiểm tra bằng `cloudflared tunnel ingress validate` với file cấu hình thực tế trước khi restart, rồi kiểm tra lại qua domain.

## Khởi động và giới hạn tự phục hồi

Các Scheduled Task hiện có:

- `OpenTutor Production Runtime Guard`: kiểm tra mỗi phút.
- `OpenTutor Production Runtime Logon`: chạy khi PC-PC đăng nhập, có StartWhenAvailable.
- `ChatbotVido Cloudflare Tunnel`: chạy khi đăng nhập và kiểm tra mỗi phút.

Các task chạy theo phiên người dùng hiện tại. Sau cold reboot cần PC-PC đăng nhập; khả năng tự chạy trước đăng nhập **chưa được xác minh** vì đăng ký task SYSTEM bị AccessDenied. Cloudflared service có sẵn cho ứng dụng khác không thuộc triển khai này.

Các helper `native-data/deployment-start.ps1`, `deployment-restart-api.ps1`, `deployment-restart-web.ps1`, `deployment-switch-web.ps1`, `deployment-web.cjs`, `web-release.json` và `native-data/cloudflare/start-tunnel.ps1` là file vận hành riêng, bị Git ignore. Chúng **không được phân phối trong source checkout mới**. Kiểm tra file tại instance trước khi sử dụng. `Start-OpenTutor.cmd` / `Stop-OpenTutor.cmd` theo cấu hình native mặc định dùng cổng 3001, không đại diện cho runtime production cổng 3003 này.

## Cập nhật, sao lưu và rollback

1. Sao lưu nhất quán SQLite cùng thư mục upload, private settings, cấu hình tunnel và release manifest. Dừng ghi hoặc dùng cơ chế SQLite backup; không chỉ copy file DB đang ghi. Bản sao lưu có dữ liệu học sinh và secret, cần bảo vệ như bản gốc.
2. Giữ release đang chạy. Build frontend ngoài các file đang được phục vụ; đóng gói đầy đủ standalone, static và public vào thư mục mới dưới `.runtime/releases/`.
3. Chạy thử release mới trên loopback cổng 4004, kiểm tra trang chủ, static assets và API proxy. Không khởi động backend thứ hai cùng ghi DB production để kiểm thử.
4. Dùng cơ chế switch manifest/restart riêng của instance để chuyển frontend. Backend chỉ nạp thay đổi Python sau restart; restart đúng tiến trình đã xác định.
5. Kiểm tra domain và chức năng bên dưới. Nếu lỗi, chuyển manifest về release trước và restart frontend; với backend khôi phục source tương thích và restart. Nếu có migration mới, lập rollout/rollback riêng trước khi chạy; lần bổ sung ảnh chat này không đổi schema DB.

Backup phải bao gồm `UPLOAD_DIR/academy-chat-images`, không chỉ DB: lịch sử lưu metadata tham chiếu file ảnh. Không xóa upload khi rollback frontend.

## Kiểm tra sau triển khai

- `/` và các JS/CSS assets trả thành công; `/api/health/live` và `/api/health/ready` báo khỏe, LLM sẵn sàng.
- API Academy yêu cầu bearer token; API workspace cũ và các biến thể đường dẫn phải bị từ chối, không redirect sang API cũ.
- Dùng tài khoản kiểm thử riêng: gửi ảnh tổng hợp, nhận trả lời, tải lại lịch sử và kiểm tra thumbnail. Tải ảnh không có token phải trả 401; tài khoản khác không được truy cập ảnh của người dùng đó.
- Giữ nguyên dữ liệu người dùng khi dọn dữ liệu kiểm thử. Không dùng endpoint health thay cho nghiệm thu tương tác.

Ngày 2026-10-30 đã kiểm tra luồng ảnh qua Edge headless trên domain: upload 200, ảnh lịch sử tải được với xác thực, không token trả 401; Luna nhận ra hình vuông đỏ và hình tròn xanh. Bộ 33 biến thể đường dẫn bị chặn (404, riêng NUL mã hóa bị parser từ chối 400). Đây không phải nghiệm thu đầy đủ giáo viên/mobile. Xem [audit](../academy-audit.md) và [acceptance](../academy-acceptance.md).

Đăng ký đang mở. Các route sinh nội dung Academy dùng giới hạn chung 120 request/phút/IP; chưa xác minh quota theo tài khoản, CAPTCHA, xác thực email hoặc spending cap tại provider. Không coi rate limit chung là bảo đảm giới hạn chi phí. Chat dùng khóa in-memory theo thread trong một tiến trình; chưa hỗ trợ scale nhiều backend worker cho cùng luồng này.
