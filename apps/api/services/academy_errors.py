"""Safe, actionable gateway errors without echoing provider bodies or secrets."""
import httpx
import openai
from fastapi import HTTPException


def generation_error(exc: Exception) -> HTTPException:
    status = getattr(exc, "status_code", None)
    response = getattr(exc, "response", None)
    headers = {}
    if response is not None:
        request_id = response.headers.get("x-request-id") or response.headers.get("cf-ray")
        if request_id:
            headers["X-Request-Id"] = request_id[:200]
        retry_after = response.headers.get("retry-after")
        if retry_after and retry_after.isdigit():
            headers["Retry-After"] = retry_after
    if status == 429:
        code, message = 429, "Gateway đang giới hạn yêu cầu. Hãy chờ rồi thử lại."
    elif status == 504 or isinstance(exc, (openai.APITimeoutError, httpx.TimeoutException)):
        code, message = 504, "Gateway AI trả lời quá thời gian. Yêu cầu chưa được xác nhận hoàn tất."
    elif status in (401, 403):
        code, message = 502, "Gateway AI từ chối quyền truy cập. Quản trị viên cần kiểm tra API key và quyền dùng model."
    else:
        code, message = 502, "Chưa kết nối được gateway AI. Hãy kiểm tra dịch vụ rồi thử lại."
    return HTTPException(code, message + " Hệ thống không tự gửi lại yêu cầu sinh nội dung.", headers=headers)


async def generate_with_error_handling(awaitable):
    try:
        return await awaitable
    except (openai.APIError, httpx.HTTPError) as exc:
        raise generation_error(exc) from exc
