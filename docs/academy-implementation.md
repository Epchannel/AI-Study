# Học Cùng AI implementation

Kế hoạch mở rộng quản lý giáo viên: [teacher-management-plan.md](teacher-management-plan.md).

### Điểm danh giáo viên

- Bổ sung bảng chuyên cần theo lớp/học sinh/ngày, trạng thái có mặt/vắng/đi muộn/có phép và ghi chú.
- API kiểm tra giáo viên sở hữu lớp và học sinh thuộc lớp; cập nhật cùng ngày sửa bản ghi hiện có.
- Giao diện cho chọn ngày, lưu từng học sinh và giữ rõ trạng thái chưa điểm danh; bỏ qua phản hồi cũ khi đổi ngày.
- Kiểm chứng sau thay đổi: 37 kiểm thử backend Academy/HNQ/career/error và 20 kiểm thử frontend đạt; TypeScript, ESLint trên thành phần thay đổi và production build đạt. Bộ backend chạy bằng môi trường `apps/api/.venv`, không áp dụng ngưỡng coverage toàn repository cho nhóm kiểm thử này.
- Chưa nghiệm thu trực quan trên trình duyệt/điện thoại và chưa khởi động lại dịch vụ đang chạy trong đợt thay đổi này.

The agreed product is a Vietnamese educational chatbot for school subjects from foundation to advanced, career exploration, personalized schedules, quizzes, flashcards and learning streaks. Teachers manage classes and upload, review, version and publish source material; students only access their classes' published content. Existing OpenTutor routes remain available under `/workspace`.

Delivery checklist (completion requires runtime and regression evidence):

- [ ] Account registration/login, teacher bootstrap, student roles and class membership authorization.
- [ ] Teacher classes, join codes, upload PDF/DOCX/PPTX/TXT/Markdown, extraction preview/edit, classification, publish/archive/version, source downloads.
- [ ] Chat-centered responsive Vietnamese interface with persistent subject conversations, profile, foundation/standard/advanced teaching and source citations.
- [ ] Diagnostic quiz and topic mastery; generated quizzes/flashcards; teacher approval and class assignments; scored attempts, explanations and wrong-answer review.
- [ ] FSRS flashcard scheduling with per-student state.
- [ ] Study schedule from goals, exam dates and availability, completion and rescheduling, daily streak based on completed work in Asia/Ho_Chi_Minh.
- [ ] Career interview/profile, reasoned alternatives, preparation paths, sourced references and dates for admissions information.
- [ ] Teacher progress/assignment reports, mobile layout, request/error/cancellation behavior, durable data and HNQ gateway integration.
- [ ] Authorization, scheduling, streak, quiz and upload regression tests; typecheck; live teacher/student workflow.

Implementation uses additive SQLAlchemy tables and SQLite upgrades with backups, FastAPI `/api/academy` routes, the existing HNQ client, local file storage, and the existing FSRS scheduler. Academy accounts always require bearer authentication even when legacy local workspace auth is disabled. First academy account bootstraps the teacher role; later registrations are students. No model key is sent to browsers.

## Bổ sung kế hoạch: khu vực tài liệu giảng viên

Mục tiêu: giảng viên đưa giáo trình, bài giảng và đề ôn tập lên hệ thống để học sinh học theo tài liệu của lớp. Chatbot dùng nội dung đã xuất bản làm nguồn giải thích, tạo quiz và flashcard, đồng thời dẫn nguồn để học sinh mở lại tài liệu gốc.

### Luồng sử dụng

1. Giảng viên vào **Lớp học → Tài liệu → Tải lên**, chọn một hoặc nhiều file PDF, DOCX, PPTX, TXT hoặc Markdown.
2. Khai báo tên tài liệu, môn học, khối/lớp, chủ đề, mức độ cơ bản–nâng cao và lớp được sử dụng.
3. Hệ thống hiển thị trạng thái xử lý và bản xem trước nội dung trích xuất. Giảng viên kiểm tra, sửa lỗi và lưu bản nháp trước khi xuất bản. PDF dạng ảnh cần OCR; giao diện phải báo rõ nếu chưa đọc được nội dung.
4. Giảng viên xuất bản tài liệu cho lớp. Học sinh đã tham gia lớp mới có thể xem, tải xuống và chọn tài liệu đó khi học với chatbot.
5. Từ tài liệu, giảng viên tạo bản nháp quiz/flashcard, kiểm tra câu hỏi và đáp án rồi xuất bản hoặc giao cho lớp; học sinh có thể tạo bộ ôn tập cá nhân.
6. Khi cập nhật giáo trình, tạo phiên bản mới, giữ thông tin phiên bản nguồn của bài tập đã tạo và cho phép lưu trữ tài liệu cũ.

### Các màn hình cần có

- **Thư viện giảng viên:** danh sách tài liệu, tìm kiếm và lọc theo lớp/môn/chủ đề/trạng thái; thao tác tải lên, chỉnh sửa, xuất bản, lưu trữ và xem phiên bản.
- **Chi tiết tài liệu:** thông tin phân loại, file gốc, nội dung trích xuất, lỗi xử lý, nguồn trang/slide và nút tạo quiz/flashcard.
- **Tài liệu lớp cho học sinh:** nội dung đã xuất bản, nút tải xuống, hỏi chatbot về tài liệu và mở bài ôn tập liên quan.

### Thứ tự triển khai và tiêu chí nghiệm thu

| Giai đoạn | Phạm vi | Tiêu chí nghiệm thu |
| --- | --- | --- |
| 1 — Tài khoản và tài liệu | Phân quyền giảng viên/học sinh, lớp học, tải file, trích xuất, nháp và xuất bản | Giảng viên tải lên và xem trước được các định dạng hỗ trợ; học sinh không đọc được bản nháp hoặc tài liệu lớp khác; lỗi file có thông báo rõ ràng. |
| 2 — Chatbot theo giáo trình | Chọn nguồn theo lớp/môn/chủ đề, dẫn nguồn trang/slide khi có | Câu trả lời truy ngược được tới tài liệu; thiếu dữ liệu phải nói rõ; nội dung trong file không được thay đổi quyền truy cập hay chỉ dẫn hệ thống. |
| 3 — Quiz và flashcard | Sinh bài từ nguồn, duyệt trước khi giao lớp, lưu phiên bản nguồn | Giảng viên sửa và duyệt được bài; học sinh làm bài và nhận giải thích; không lộ đáp án quiz trước khi nộp. |
| 4 — Quản lý và tiến độ | Phiên bản, lưu trữ, báo cáo hoàn thành bài giao | Cập nhật tài liệu không làm mất lịch sử học; báo cáo theo lớp không tiết lộ trò chuyện riêng hoặc hồ sơ hướng nghiệp. |

Giới hạn ban đầu: 25 MB/file, lưu file ở máy chủ và kiểm tra quyền cho mỗi lần đọc/tải. Không gửi API key xuống trình duyệt. OCR tự động, kho tài liệu dùng chung toàn trường và tích hợp Google Drive/OneDrive là các hạng mục sau MVP. Đây là phạm vi và tiêu chí của kế hoạch; trạng thái hoàn thành vẫn theo bằng chứng kiểm thử bên dưới.

## Kế hoạch nâng cấp trang giáo viên: trung tâm quản lý lớp

Mục tiêu của phiên bản tiếp theo là giúp giáo viên theo dõi và điều hành lớp từ một nơi, trong khi vẫn giữ riêng hội thoại, hồ sơ hướng nghiệp và các dữ liệu cá nhân của học sinh.

### 1. Trang tổng quan

- Thẻ nhanh: số lớp, số học sinh đang hoạt động, bài sắp đến hạn, tài liệu nháp, tỷ lệ hoàn thành và chuỗi học trung bình.
- Bộ lọc theo lớp, môn, khối, khoảng thời gian và trạng thái bài giao.
- Danh sách việc cần xử lý: duyệt quiz/flashcard, xem tài liệu lỗi trích xuất, học sinh cần hỗ trợ, bài quá hạn.
- Biểu đồ xu hướng theo tuần: lượt học, quiz đã nộp, điểm trung bình, chủ đề yếu và tỷ lệ duy trì chuỗi học.

### 2. Quản lý lớp và học sinh

- Tạo, đổi tên, lưu trữ lớp; mã tham gia có thể tạo lại và có ngày hết hạn.
- Danh sách học sinh với trạng thái tham gia, lần hoạt động gần nhất, tiến độ, điểm quiz, thẻ đã ôn và buổi học hoàn thành.
- Trang chi tiết từng học sinh chỉ hiển thị dữ liệu học tập thuộc lớp: mục tiêu học tập do học sinh chia sẻ, chủ đề yếu, bài chưa hoàn thành và lịch sử bài giao.
- Ghi chú riêng của giáo viên, nhãn hỗ trợ như “cần củng cố nền tảng” hoặc “đang ôn thi”; học sinh không nhìn thấy ghi chú nội bộ.
- Thao tác hàng loạt: giao bài, gia hạn hạn nộp, gửi nhắc học, xuất báo cáo CSV/PDF.

### 3. Bài tập và đánh giá

- Tạo bài quiz, flashcard và bài tự luận; lấy nguồn từ một hoặc nhiều tài liệu đã xuất bản.
- Cấu hình số câu, mức độ, thời lượng, số lần làm, hạn nộp, điểm đạt và cho phép làm lại.
- Quy trình bản nháp → giáo viên duyệt → giao lớp → đóng bài; lưu lịch sử chỉnh sửa và phiên bản.
- Chấm tự động phần trắc nghiệm; giáo viên chấm và nhận xét câu trả lời mở, có trạng thái “chưa chấm/đã chấm”.
- Bảng phân tích theo câu hỏi: tỷ lệ đúng, lựa chọn sai phổ biến, thời gian làm và chủ đề cần dạy lại.

### 4. Học liệu và chương trình

- Thư viện theo thư mục/chương/bài/chủ đề, tìm kiếm toàn văn và lọc theo trạng thái.
- Gắn nhiều tài liệu vào một bài học; xem phiên bản, người cập nhật, ngày xuất bản và nguồn của quiz/flashcard.
- Kéo thả sắp xếp thứ tự bài, đánh dấu tài liệu bắt buộc/tùy chọn, đặt điều kiện hoàn thành trước khi mở bài tiếp theo.
- Cảnh báo tài liệu chưa có nội dung, lỗi OCR hoặc bản cũ đang được bài tập sử dụng.
- Mẫu chương trình theo khối và môn để giáo viên sao chép rồi tùy chỉnh theo lớp.

### 5. Lịch, điểm danh và hỗ trợ

- Lịch dạy, hạn bài, kỳ kiểm tra và các mốc ôn tập trên một lịch lớp.
- Điểm danh thủ công hoặc đánh dấu “đã tham gia buổi học”; ghi lý do vắng và kế hoạch bù.
- Gửi thông báo trong lớp: bài mới, thay đổi hạn nộp, tài liệu cập nhật và lời nhắc học tập.
- Hộp hỗ trợ để giáo viên đánh dấu học sinh cần trao đổi riêng; không tự động chia sẻ nội dung chat riêng cho giáo viên.

### 6. Quyền và an toàn dữ liệu

- Vai trò `owner`, `teacher` và `assistant`; quyền xem, sửa, duyệt, giao bài và xuất báo cáo cấu hình theo lớp.
- Nhật ký thao tác: ai tải lên, sửa, xuất bản, giao bài, chấm hoặc xuất dữ liệu; hỗ trợ khôi phục bản trước.
- Báo cáo chỉ truy vấn học sinh đang thuộc lớp và tài sản được giao trong lớp đó; không đưa career report, chat riêng, email hoặc token vào dữ liệu xuất.
- Xóa mềm lớp, bài và tài liệu; xác nhận trước thao tác xóa hàng loạt; giới hạn tốc độ với xuất báo cáo và gửi thông báo.

### Lộ trình và tiêu chí nghiệm thu

| Giai đoạn | Phạm vi | Tiêu chí nghiệm thu |
| --- | --- | --- |
| A — Tổng quan và danh sách | Dashboard, bộ lọc, danh sách lớp/học sinh, việc cần xử lý | Giáo viên lọc được theo lớp/thời gian; số liệu khớp endpoint chi tiết; không lộ dữ liệu ngoài lớp |
| B — Bài giao và chấm | Cấu hình bài, quy trình duyệt/giao/đóng, chấm và phân tích câu hỏi | Hai giáo viên thao tác đồng thời không mất phiên bản; học sinh chỉ thấy bài được giao; điểm và hạn nộp nhất quán |
| C — Chương trình và lịch | Thư viện có cấu trúc, điều kiện mở bài, lịch lớp, điểm danh, nhắc học | Cập nhật tài liệu giữ lịch sử; bài cũ vẫn truy được nguồn; lịch không tạo trùng và hoạt động được tính đúng |
| D — Cộng tác và báo cáo | Trợ giảng, nhật ký thao tác, xuất CSV/PDF, khôi phục bản trước | Mỗi thao tác có người thực hiện; quyền trợ giảng đúng phạm vi; báo cáo có thể kiểm tra lại từ dữ liệu nguồn |

MVP ưu tiên A và B. Điểm danh nâng cao, trợ giảng nhiều cấp, PDF báo cáo thiết kế đẹp và mẫu chương trình dùng chung toàn trường sẽ triển khai sau khi mô hình dữ liệu và quyền truy cập ổn định.

### Tiến độ triển khai trang giáo viên — giai đoạn A

- Đã thêm `GET /api/academy/teacher/overview`, chỉ tổng hợp các lớp do giảng viên sở hữu: số lớp, học sinh, học sinh đã có bài nộp, tài liệu theo trạng thái, bài nháp, bài đến hạn trong 7 ngày và các bài nộp gần đây.
- Góc giảng viên hiển thị các thẻ tổng quan trước danh sách lớp và việc cần xử lý. Dữ liệu được tải từ API thật, không dùng số liệu cố định.
- Regression test xác nhận không lấy lớp của giảng viên khác hoặc dữ liệu ngoài quyền; frontend test vẫn giữ được luồng chọn lớp, upload và lọc học liệu.
- Bộ backend hiện tại: **60 passed**; frontend academy: **9 passed**; TypeScript, ESLint và production build đang được xác nhận sau thay đổi này.

### Tiến độ triển khai trang giáo viên — giai đoạn B

- Báo cáo lớp nay trả thêm số bài đã nộp, tổng số học sinh và tỷ lệ hoàn thành cho từng bài giao; giáo viên nhìn thấy hạn nộp và trạng thái nháp/đã giao/lưu trữ ngay trong trang lớp.
- Backend tính số liệu theo học sinh đang tham gia lớp và tài sản thuộc đúng lớp, không đưa bài cá nhân hoặc bài lớp khác vào thống kê.
- Giao diện hiển thị danh sách bài giao dưới bảng học sinh, giữ các thao tác duyệt nội dung và tạo bài từ tài liệu hiện có.
- Full regression sau thay đổi: **60 backend tests passed**, **9 frontend tests passed**, TypeScript, ESLint và production build passed.
- Danh sách bài giao có bộ lọc theo quy trình `Nháp`, `Đã giao`, `Lưu trữ`, hiển thị tỷ lệ nộp theo từng bài và trạng thái hạn nộp. Frontend test xác nhận lọc đúng và không làm mất số liệu hoàn thành.
- Bảng học sinh có tìm kiếm theo tên, số quiz đã nộp, điểm trung bình, ngày hoạt động gần nhất và số thẻ đã ôn. Trường `last_activity` và `average_score` được tính từ các bài thuộc đúng lớp; không đọc hội thoại hoặc hồ sơ riêng.
- Regression lớp/báo cáo sau mở rộng: **20 tests passed**; teacher panel frontend: **4 tests passed**.
- Thêm nút **Xuất CSV** cho lớp đang chọn. File gồm bảng học sinh và bảng bài giao với tỷ lệ hoàn thành; endpoint kiểm tra quyền giảng viên trước khi xuất và không bao gồm chat, hồ sơ hướng nghiệp hay dữ liệu lớp khác.
- Sửa thống kê bài giao để đếm học sinh duy nhất thay vì số lượt nộp; học sinh làm lại nhiều lần không thể làm tỷ lệ hoàn thành vượt 100%. Hạn bài có trạng thái `Quá hạn`, `Sắp đến hạn` hoặc `Hạn` trong giao diện.
- Full backend regression sau sửa thống kê: **60 passed**; teacher frontend suite: **5 passed**; TypeScript và ESLint passed.
- Thêm endpoint phân tích bài giao theo câu: số lượt làm, số đúng, tỷ lệ đúng và các lựa chọn sai phổ biến. Trang giáo viên có nút **Phân tích** cạnh từng bài; chỉ người tạo bài giao cho lớp mới được xem.
- Regression API cho quyền phân tích và frontend teacher suite đều đạt; dữ liệu phân tích chỉ lấy các lượt nộp của học sinh trong lớp đó.
- Dashboard giáo viên hiển thị thêm 5 bài nộp gần đây với ngày, điểm và phần trăm, giúp ưu tiên xử lý mà không mở từng lớp. Dữ liệu lấy từ các bài giao thuộc lớp của giáo viên.
- Bài nộp gần đây nay hiển thị cả tên học sinh và tên bài, giúp nhận diện ngay nội dung cần xem; API chỉ lấy tên của học sinh thuộc các lớp sở hữu.
- Hạn nộp của bài mới hoặc khi chỉnh sửa không được đặt trong quá khứ; dữ liệu bài cũ quá hạn vẫn được giữ để báo cáo lịch sử.
- Biểu mẫu frontend đặt `min` theo ngày Việt Nam (UTC+7) cho cả tạo bài và chỉnh sửa bài; backend vẫn là lớp kiểm tra cuối cùng.

## Current evidence and remaining verification

The account/class/material/chat/quiz/flashcard/schedule/streak/report routes and Vietnamese responsive interface are implemented. Runtime API import and schema upgrade passed; TypeScript and scoped ESLint passed. Eight academy integration/policy tests pass, and the combined academy/HNQ/FSRS run passed 36 tests before the latest chat-action addition. Four frontend transport/student-practice tests pass. An isolated live HNQ smoke run passed teacher/student registration, class enrollment, published document grounding and persistent chat, teacher-generated/approved quiz with student answer secrecy and 3/3 scoring, personal FSRS review, 14 scheduled sessions and a one-day streak; its temporary data was removed.

Still required before claiming the entire plan complete: browser-level visual/mobile and navigation verification, production frontend build, document-format coverage beyond Markdown/text, chat-triggered exercise regression, career guidance quality/source checks, concurrency/cancellation hardening and completion audit against each checkbox. Computer Use ended because it could not confidently determine the Windows browser URL; no further UI automation was attempted. No real academy account was provisioned on the user's persistent database: the owner should create the first teacher account at `/`.

### Follow-up verification, 2026-10-30

- Production `npm run build` passed, including TypeScript, prerendering and trace collection.
- Combined academy/HNQ/FSRS suite: **41 passed**. Added actual DOCX/PPTX/PDF extraction fixtures with page/slide references; saved chat-generated quiz/action coverage; partial-stream failure persistence/lock cleanup coverage.
- Fixed lock cleanup even if upstream generator closing raises, and repeated scheduling now subtracts existing study minutes from each day's budget.
- Remaining: browser visual/mobile/navigation verification, career guidance quality/source checks, concurrent write/cancellation audit and full requirement-by-requirement completion audit. The checklist remains open until those are evidenced.

### Career and concurrency follow-up

- Added private saved career reports with 3–5 alternatives, reasons tied to profile, subjects/preparation, practical experiments, tradeoffs, a staged plan and further interview questions. The career chat now includes an expandable report panel and profile-change warning.
- Reports carry creation dates and the input snapshot. Current admissions cutoffs, fees and deadlines are excluded without verified source data. The MOET reference is labeled as a general lookup resource, not evidence for a school-specific claim.
- Malformed or duplicate-option AI output returns 502 and preserves the prior saved report. Missing interview data prevents generation. Private report access and invalid-result preservation are covered by integration tests.
- Short profile, quiz, FSRS and schedule writes now obtain a database write lock before reading mutable state. Concurrent quiz submissions preserve all mastery increments; concurrent schedule generation respects the daily budget without overlaps. No LLM call runs inside that lock.
- Latest combined academy/career/HNQ/FSRS suite: **44 passed**. Frontend academy transport/practice/career suite: **6 passed**. TypeScript, scoped ESLint and production build passed.
- Remaining verification: browser visual/mobile/navigation, career content quality with actual model output, stream cancellation under a disconnected client, and the final requirement audit. No completion claim is made for those items.

### Teacher library and client disconnect follow-up

- Teacher library now supports text search across title/file/chapter/lesson, publication-state and level filters, and class-based subject/grade selection. Each non-archived document can create a quiz or flashcard draft directly, passing its material ID and opening the saved exercise editor for review.
- Library loading ignores stale responses when switching classes; class selection is disabled during uploads/generation so a completed action cannot target a newly selected class.
- Added an ASGI client-disconnect test that receives the first content event, disconnects, and verifies upstream generator cleanup, no terminal success event, no saved partial conversation and a released thread lock. This targeted test passed.
- Frontend academy tests: **8 passed**, covering library filtering and exact material selection in addition to transport, practice and career reports.
- Computer Use remains unable to verify whether the current browser URL is allowed; visual/mobile/navigation checks remain unverified. This does not block API or component-level progress.
- Combined backend suite after the disconnect addition: **45 passed**. An additional selected-material regression passed separately: draft generation stores the chosen source version and rejects material from a different class before calling the model.
- A real HNQ career report generation was attempted with a synthetic profile. Cloudflare returned HTTP 504 (`origin_gateway_timeout`, ray `a523d14b794e04ce`, 2026-10-29 17:15 UTC). No generation retry was sent. Actual career-output quality is still unverified; offline schema/privacy coverage does not establish that quality.

### Gateway failure and streaming integrity follow-up

- Academy generation errors now map upstream timeouts, rate limits and authorization failures to Vietnamese messages without forwarding provider response bodies. `X-Request-Id` (or Cloudflare ray) and numeric `Retry-After` are preserved. HTTP and SSE frontend errors display the request ID, with no implicit generation retry.
- HNQ chat streaming reads raw SSE through the existing SDK streaming-response context and requires the real `[DONE]` event. A finish-reason chunk followed by EOF is rejected; partial output cannot pass through as completed chat. The response context also closes on cancellation.
- Offline HNQ tests exercise complete and truncated streams, exact discovered model IDs, bearer authentication, one POST only and retained request IDs. Error tests cover 401/403/429/503/504, timeout mapping, redaction and absence of retries.
- Latest combined backend run: **54 passed**; frontend academy suite: **9 passed**. TypeScript and scoped ESLint passed after error-display changes. The earlier production build predates the latest library/error changes; it is not treated as verification of those changes.
- A fresh production build subsequently passed with the library/error changes. Requirement-by-requirement status and remaining gaps are recorded in [academy-audit.md](academy-audit.md).

### Schedule edits and teacher reports

- Rescheduling now recalculates minutes and normalizes saved times to Vietnam time. Invalid or cross-day durations are rejected. Restoring a skipped session checks overlaps even without new timestamps. Completed sessions remain immutable, and repeated completion does not add a second learning event.
- Teacher report attempts are sorted by submission timestamp so the last score represents the latest submission. New submissions record subsecond timestamps to avoid same-second ambiguity.
- Two focused integration tests passed: schedule edit/ownership/completion and a report fixture containing class, other-class and private attempts/cards. The latter deliberately inserts recent attempts before older ones and confirms that private/other-class activity is excluded.
- Combined backend suite after schedule/report changes: **56 passed**. HNQ health subsequently returned HTTP 200. Long non-streaming caller operations now aggregate an upstream SSE response, returning the full string only after `[DONE]`, to avoid waiting silently for long JSON generations through Cloudflare. A new synthetic-profile career generation is being checked; the earlier 504 is not treated as resolved merely from health status.
- The subsequent real career generation completed successfully through the SSE aggregation path and passed `CareerReport` validation. Reviewed synthetic profile: grade 10, programming/illustration interests, logical thinking/patience and cost constraints. Three alternatives (software/web, UI/UX, illustration) each included preparation, free experiments and tradeoffs, followed by three measurable stages and interview questions. No current admissions, salary or employment guarantees appeared. This is sample-level evidence only.
- A real three-question diagnostic sample also passed generation validation and manual mathematical review: `3x−5=7` (x=4), `x²−5x+6=0` ({2,3}), and a 54 m² rectangle with length three metres greater than width (width 6 m). Difficulty labels increased foundation → standard → advanced; the last label is relative to this short diagnostic, not evidence of advanced mathematics coverage as a whole.
- Latest combined backend suite: **58 passed**, including aggregate-call rejection of streams without `[DONE]`. Live career/diagnostic checks used synthetic inputs and created no persistent user accounts or records.

### Individual-document chat sources

- Added a class/document source picker, with all-class retrieval or one exact document. The selected ID persists in the thread, is restored from history and propagates to chat-generated exercises. A changed source starts a new conversation.
- Source resolution checks class membership and current publication/archive state for every request. Unavailable selected documents return an explicit error rather than silently falling back. Source loading ignores stale responses after class changes.
- Selected-document backend regression passed: only the selected document appears in the prompt/citations, the ID survives reload, and archive revocation prevents another model call. Cross-class and missing-class selections are rejected.
- Frontend academy suite: **13 passed**, including exact-document selection, stale-load handling, source restoration from history and student page navigation. Visual/mobile interaction still requires a browser check.
- Combined backend suite: **59 passed**; production build and scoped ESLint passed. The selected-source regression was then extended and passed again to verify that an exercise requested inside that conversation inherits the exact document. No additional model call was made by these offline tests.
