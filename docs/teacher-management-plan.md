# Kế hoạch mở rộng trang giáo viên

Mục tiêu: quản lý lớp, học liệu và bài giao; phát hiện học sinh cần hỗ trợ và theo dõi kết quả.

| Đợt | Phạm vi | Trạng thái |
| --- | --- | --- |
| 1 | Tổng quan lớp/học sinh, học liệu cần duyệt, bài đến hạn và bài nộp gần đây | Đã triển khai; chờ nghiệm thu trình duyệt |
| 1 | Tìm/lọc học liệu, phiên bản, xuất bản, tạo quiz/flashcard từ tài liệu | Đã triển khai; chờ nghiệm thu trình duyệt |
| 1 | Tìm học sinh, điểm trung bình, lượt nộp, hoạt động trong lớp, phân tích câu hỏi và CSV | Đã triển khai; chờ nghiệm thu trình duyệt |
| 2 | Điểm danh theo ngày: có mặt, vắng, đi muộn, có phép; ghi chú và sửa bản ghi | API và giao diện đã triển khai; chờ nghiệm thu trình duyệt |
| 3 | Hồ sơ học sinh trong lớp: lịch sử bài nộp, tiến bộ theo chủ đề, tổng hợp chuyên cần theo khoảng ngày | Dự kiến |
| 3 | Ghi chú sư phạm riêng, mục tiêu hỗ trợ, ngày hẹn và trạng thái xử lý | Dự kiến |
| 4 | Cảnh báo thiếu bài, điểm giảm, vắng nhiều; quy tắc và khoảng thời gian rõ ràng | Dự kiến |
| 4 | Lịch lớp, thông báo, quản lý hạn nộp và giao bài theo nhóm/trình độ | Dự kiến |
| 5 | Báo cáo tuần/tháng, bảng điểm và chuyên cần; tổng hợp hiệu quả hỗ trợ | Dự kiến |

## Tổ chức giao diện

Chuyển trang dài thành các mục: Tổng quan, Lớp & học sinh, Học liệu, Bài tập, Điểm danh, Báo cáo. Giữ lớp đang chọn khi đổi mục; mỗi mục có trạng thái đang tải, trống và lỗi riêng.

## Quy tắc dữ liệu

- Kiểm tra quyền sở hữu lớp ở API cho mọi thao tác.
- Hội thoại cá nhân và tư vấn riêng không xuất hiện trong báo cáo lớp. Chia sẻ hồ sơ cần lựa chọn rõ ràng của học sinh.
- Không suy diễn điểm danh từ đăng nhập hoặc hoạt động chatbot.
- Ghi chú sư phạm cần phân quyền, lịch sử chỉnh sửa và chính sách lưu giữ trước khi sử dụng.
- Cảnh báo phải giải thích được bằng số liệu; giáo viên xem xét đề xuất hỗ trợ trước khi liên hệ.

## Nghiệm thu

Kiểm thử quyền truy cập, dữ liệu rỗng, lỗi tải/lưu, đổi lớp/ngày nhanh và số liệu tổng hợp. Kiểm tra trực tiếp trên máy tính và điện thoại trước khi xác nhận hoàn tất giao diện. Chưa có bằng chứng kiểm tra trực quan trong phiên này.
