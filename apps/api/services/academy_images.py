"""Private, normalized image attachments for Academy chat."""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_FILES = 3
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000
ALLOWED = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}
_NORMALIZATION_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="academy-image")
_normalization_loop = None
_normalization_semaphore: asyncio.Semaphore | None = None


@dataclass
class ChatImage:
    id: str
    name: str
    media_type: str
    size_bytes: int
    width: int
    height: int
    data: bytes
    extension: str

    def metadata(self):
        return {k: getattr(self, k) for k in ("id", "name", "media_type", "size_bytes", "width", "height")}


def _normalization_limit() -> asyncio.Semaphore:
    global _normalization_loop, _normalization_semaphore
    loop = asyncio.get_running_loop()
    if _normalization_loop is not loop:
        _normalization_loop = loop
        _normalization_semaphore = asyncio.Semaphore(2)
    return _normalization_semaphore


def _normalize_image(raw: bytes, filename: str | None, content_type: str | None) -> ChatImage:
    try:
        source = Image.open(BytesIO(raw))
        source.verify()
        image = Image.open(BytesIO(raw))
        source_format = image.format
        if getattr(image, "is_animated", False) or source_format not in ALLOWED:
            raise ValueError("unsupported")
        if image.width * image.height > MAX_PIXELS:
            raise ValueError("too many pixels")
        image = ImageOps.exif_transpose(image)
        image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Ảnh không hợp lệ hoặc không được hỗ trợ.") from exc
    media_type, extension = ALLOWED[source_format]
    if content_type != media_type:
        raise HTTPException(415, "Kiểu tệp ảnh không khớp với nội dung thực tế.")
    output = BytesIO()
    # Re-encoding strips EXIF and other uploaded metadata.
    save_format = "JPEG" if source_format == "JPEG" else source_format
    if save_format == "JPEG" and image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    image.save(output, format=save_format)
    normalized = output.getvalue()
    if len(normalized) > MAX_FILE_BYTES:
        raise HTTPException(413, "Ảnh vượt quá dung lượng cho phép.")
    return ChatImage(str(uuid.uuid4()), Path(filename or "image").name[:120], media_type, len(normalized), image.width, image.height, normalized, extension)


async def normalize_image(raw: bytes, filename: str | None, content_type: str | None) -> ChatImage:
    """Run Pillow off the request loop without allowing cancelled work to exceed the cap."""
    semaphore = _normalization_limit()
    await semaphore.acquire()
    try:
        future = asyncio.get_running_loop().run_in_executor(_NORMALIZATION_EXECUTOR, _normalize_image, raw, filename, content_type)
    except BaseException:
        semaphore.release()
        raise

    def release_when_finished(completed: asyncio.Future) -> None:
        try:
            completed.exception()
        except (asyncio.CancelledError, Exception):
            pass
        semaphore.release()

    # A shielded waiter can be cancelled repeatedly; release only after the worker has actually stopped.
    future.add_done_callback(release_when_finished)
    return await asyncio.shield(future)


async def read_images(files: list[UploadFile]) -> list[ChatImage]:
    if len(files) > MAX_FILES:
        raise HTTPException(413, "Tối đa 3 ảnh cho mỗi tin nhắn.")
    images: list[ChatImage] = []
    total = 0
    try:
        for upload in files:
            raw = await upload.read(MAX_FILE_BYTES + 1)
            total += len(raw)
            if len(raw) > MAX_FILE_BYTES or total > MAX_TOTAL_BYTES:
                raise HTTPException(413, "Ảnh vượt quá dung lượng cho phép.")
            image = await normalize_image(raw, upload.filename, upload.content_type)
            if sum(item.size_bytes for item in images) + image.size_bytes > MAX_TOTAL_BYTES:
                raise HTTPException(413, "Ảnh vượt quá dung lượng cho phép.")
            images.append(image)
    finally:
        for upload in files:
            await upload.close()
    return images


def write_images(images: list[ChatImage], base: Path, user_id: uuid.UUID) -> list[Path]:
    folder = base / "academy-chat-images" / str(user_id)
    folder.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    path: Path | None = None
    try:
        for image in images:
            path = folder / f"{image.id}.{image.extension}"
            path.write_bytes(image.data)
            written.append(path)
        return written
    except Exception:
        delete_images(written)
        if path is not None:
            delete_images([path])
        raise


def delete_images(paths: list[Path]) -> None:
    for path in paths:
        try: path.unlink(missing_ok=True)
        except OSError: pass
