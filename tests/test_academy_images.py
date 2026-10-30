"""Academy chat-image contracts, isolated from live model providers."""
import asyncio
import base64
import io
import threading
import time
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from routers import academy
from services import academy_images
from starlette.datastructures import Headers
from starlette.datastructures import UploadFile as StarletteUploadFile


@pytest_asyncio.fixture
async def portal(tmp_path, monkeypatch):
    from sse_starlette.sse import AppStatus

    monkeypatch.setattr(AppStatus, "should_exit_event", None)
    engine = create_async_engine("sqlite+aiosqlite:///" + (tmp_path / "academy.db").as_posix())
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    app = FastAPI()
    app.include_router(academy.router)

    async def db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = db
    monkeypatch.setattr(academy, "async_session", factory)
    monkeypatch.setattr(academy.settings, "upload_dir", str(tmp_path))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client, tmp_path
    await engine.dispose()


async def register(client, email):
    response = await client.post("/api/academy/register", json={"name": email.split("@")[0], "email": email, "password": "test-only-12345"})
    assert response.status_code == 201, response.text
    payload = response.json()
    return payload["user"], {"Authorization": "Bearer " + payload["access_token"]}


async def thread(client, auth):
    response = await client.post("/api/academy/threads", headers=auth, json={})
    assert response.status_code == 201, response.text
    return response.json()


def image_bytes(format, size=(8, 6), exif=None):
    image = Image.new("RGB", size, "red")
    output = io.BytesIO()
    kwargs = {"exif": exif} if exif else {}
    image.save(output, format=format, **kwargs)
    return output.getvalue()


def install_vision_client(monkeypatch):
    calls = []

    async def stream(system, prompt, images=None):
        calls.append({"system": system, "prompt": prompt, "images": images})
        yield "Đã xem ảnh."

    import services.llm.router as llm
    monkeypatch.setattr(llm, "get_llm_client", lambda: SimpleNamespace(stream_chat=stream))
    return calls


@pytest.mark.asyncio
@pytest.mark.parametrize("format,media_type,suffix", [("JPEG", "image/jpeg", "jpg"), ("PNG", "image/png", "png"), ("WEBP", "image/webp", "webp")])
async def test_chat_accepts_normalizes_and_persists_supported_images(portal, monkeypatch, format, media_type, suffix):
    client, root = portal
    calls = install_vision_client(monkeypatch)
    user, auth = await register(client, f"{suffix}@image.test")
    conversation = await thread(client, auth)
    response = await client.post(
        f"/api/academy/threads/{conversation['id']}/chat",
        headers=auth,
        files=[("images", (f"photo.{suffix}", image_bytes(format), media_type))],
    )
    assert "event: done" in response.text
    assert calls[0]["images"] and calls[0]["images"][0]["media_type"] == media_type
    assert base64.b64decode(calls[0]["images"][0]["data"])
    saved = (await client.get(f"/api/academy/threads/{conversation['id']}", headers=auth)).json()
    attachment = saved["data"]["messages"][-2]["images"][0]
    assert set(attachment) == {"id", "name", "media_type", "size_bytes", "width", "height"}
    assert attachment["media_type"] == media_type and attachment["size_bytes"] <= 4 * 1024 * 1024
    path = root / "academy-chat-images" / user["id"] / f"{attachment['id']}.{suffix}"
    assert path.is_file()
    image_response = await client.get(f"/api/academy/threads/{conversation['id']}/images/{attachment['id']}", headers=auth)
    assert image_response.status_code == 200
    assert image_response.headers["cache-control"] == "private, no-store"


@pytest.mark.asyncio
async def test_image_only_bypasses_action_and_history_keeps_only_attachment_marker(portal, monkeypatch):
    client, _ = portal
    calls = install_vision_client(monkeypatch)
    _, auth = await register(client, "history-image@test.vn")
    conversation = await thread(client, auth)
    response = await client.post(
        f"/api/academy/threads/{conversation['id']}/chat",
        headers=auth,
        data={"message": "Tạo 3 câu quiz từ ảnh này"},
        files=[("images", ("question.png", image_bytes("PNG"), "image/png"))],
    )
    assert "event: done" in response.text and len(calls) == 1
    assert calls[0]["images"]
    response = await client.post(f"/api/academy/threads/{conversation['id']}/chat", headers=auth, json={"message": "Giải thích tiếp"})
    assert "event: done" in response.text
    history = calls[-1]["prompt"]
    assert "[đã đính kèm ảnh]" in history
    assert "academy-chat-images" not in history and "data" not in history


@pytest.mark.asyncio
async def test_image_rejections_and_thread_image_authorization(portal, monkeypatch):
    client, _ = portal
    install_vision_client(monkeypatch)
    _, auth = await register(client, "owner-image@test.vn")
    _, other = await register(client, "other-image@test.vn")
    conversation = await thread(client, auth)
    endpoint = f"/api/academy/threads/{conversation['id']}/chat"
    assert (await client.post(endpoint, files=[("images", ("no-auth.png", image_bytes("PNG"), "image/png"))])).status_code == 401
    assert (await client.post(endpoint, headers=auth, files=[("images", ("spoof.png", image_bytes("PNG"), "image/jpeg"))])).status_code == 415
    animated = io.BytesIO()
    first, second = Image.new("RGB", (2, 2), "red"), Image.new("RGB", (2, 2), "blue")
    first.save(animated, format="GIF", save_all=True, append_images=[second])
    assert (await client.post(endpoint, headers=auth, files=[("images", ("animation.gif", animated.getvalue(), "image/gif"))])).status_code == 422
    assert (await client.post(endpoint, headers=auth, files=[("other", ("unknown.png", image_bytes("PNG"), "image/png"))])).status_code == 422
    sent = await client.post(endpoint, headers=auth, files=[("images", ("private.png", image_bytes("PNG"), "image/png"))])
    assert "event: done" in sent.text
    saved = (await client.get(f"/api/academy/threads/{conversation['id']}", headers=auth)).json()
    image_id = saved["data"]["messages"][-2]["images"][0]["id"]
    image_endpoint = f"/api/academy/threads/{conversation['id']}/images/{image_id}"
    assert (await client.get(image_endpoint, headers=other)).status_code == 404
    assert (await client.get(f"/api/academy/threads/{conversation['id']}/images/00000000-0000-0000-0000-000000000000", headers=auth)).status_code == 404


@pytest.mark.asyncio
async def test_file_limits_and_db_failure_remove_persisted_images(portal, monkeypatch):
    client, root = portal
    install_vision_client(monkeypatch)
    user, auth = await register(client, "limit-image@test.vn")
    conversation = await thread(client, auth)
    endpoint = f"/api/academy/threads/{conversation['id']}/chat"
    too_many = [("images", (f"{index}.png", image_bytes("PNG"), "image/png")) for index in range(4)]
    assert (await client.post(endpoint, headers=auth, files=too_many)).status_code == 422
    oversized = b"x" * (4 * 1024 * 1024 + 1)
    assert (await client.post(endpoint, headers=auth, files=[("images", ("large.png", oversized, "image/png"))])).status_code == 413

    async def failed_commit(self):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(AsyncSession, "commit", failed_commit)
    response = await client.post(endpoint, headers=auth, files=[("images", ("rollback.png", image_bytes("PNG"), "image/png"))])
    assert "event: error" in response.text and "event: done" not in response.text
    image_root = root / "academy-chat-images" / user["id"]
    assert not image_root.exists() or not list(image_root.iterdir())


@pytest.mark.asyncio
async def test_disconnect_does_not_persist_images(portal, monkeypatch):
    client, root = portal
    install_vision_client(monkeypatch)
    user, auth = await register(client, "disconnect-image@test.vn")
    conversation = await thread(client, auth)

    async def disconnected(self):
        return True

    monkeypatch.setattr("starlette.requests.Request.is_disconnected", disconnected)
    response = await client.post(
        f"/api/academy/threads/{conversation['id']}/chat",
        headers=auth,
        files=[("images", ("disconnect.png", image_bytes("PNG"), "image/png"))],
    )
    assert "event: done" not in response.text
    image_root = root / "academy-chat-images" / user["id"]
    assert not image_root.exists() or not list(image_root.iterdir())


@pytest.mark.asyncio
async def test_pillow_normalization_is_bounded_off_loop_and_cancel_waits_for_worker(monkeypatch):
    active = 0
    peak = 0
    lock = threading.Lock()
    started = threading.Event()
    release = threading.Event()

    def slow_normalize(raw, filename, content_type):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
            started.set()
        release.wait(timeout=2)
        with lock:
            active -= 1
        return academy_images.ChatImage("id", filename or "image", "image/png", 1, 1, 1, b"x", "png")

    def upload(name):
        return StarletteUploadFile(file=io.BytesIO(b"x"), filename=name, headers=Headers({"content-type": "image/png"}))

    monkeypatch.setattr(academy_images, "_normalize_image", slow_normalize)
    first_upload, second_upload, third_upload = upload("one.png"), upload("two.png"), upload("three.png")
    first = asyncio.create_task(academy_images.read_images([first_upload]))
    second = asyncio.create_task(academy_images.read_images([second_upload]))
    await asyncio.sleep(0.02)
    assert started.is_set()
    heartbeat = False

    async def beat():
        nonlocal heartbeat
        await asyncio.sleep(0.01)
        heartbeat = True

    await beat()
    assert heartbeat and peak == 2
    third = asyncio.create_task(academy_images.read_images([third_upload]))
    first.cancel()
    await asyncio.sleep(0.02)
    assert first.done() and peak == 2
    with pytest.raises(asyncio.CancelledError):
        await first
    # A second cancellation cannot release the normalization slot while the worker still runs.
    first.cancel()
    await asyncio.sleep(0.02)
    assert peak == 2 and not third.done()
    release.set()
    await asyncio.gather(second, third)
    assert peak == 2
    assert first_upload.file.closed and second_upload.file.closed and third_upload.file.closed


@pytest.mark.asyncio
async def test_multipart_allows_8000_multibyte_characters_and_rejects_8001(portal, monkeypatch):
    client, _ = portal
    install_vision_client(monkeypatch)
    _, auth = await register(client, "utf8-image@test.vn")
    conversation = await thread(client, auth)
    endpoint = f"/api/academy/threads/{conversation['id']}/chat"
    valid = await client.post(endpoint, headers=auth, data={"message": "á" * 8000}, files=[("images", ("utf8.png", image_bytes("PNG"), "image/png"))])
    assert "event: done" in valid.text
    invalid = await client.post(endpoint, headers=auth, data={"message": "á" * 8001}, files=[("images", ("utf8.png", image_bytes("PNG"), "image/png"))])
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_json_chat_validation_remains_422_without_generation_or_persistence(portal, monkeypatch):
    client, _ = portal
    calls = install_vision_client(monkeypatch)
    _, auth = await register(client, "json-validation@test.vn")
    conversation = await thread(client, auth)
    endpoint = f"/api/academy/threads/{conversation['id']}/chat"
    headers = {**auth, "Content-Type": "application/json"}
    for payload in (b"{", b"{}", b'{"message":""}', b'{"message":3}'):
        response = await client.post(endpoint, headers=headers, content=payload)
        assert response.status_code == 422
    saved = (await client.get(f"/api/academy/threads/{conversation['id']}", headers=auth)).json()
    assert saved["data"]["messages"] == [] and calls == []


@pytest.mark.asyncio
async def test_error_after_a_durable_commit_keeps_image_and_metadata(portal, monkeypatch):
    client, root = portal
    install_vision_client(monkeypatch)
    user, auth = await register(client, "durable-image@test.vn")
    conversation = await thread(client, auth)
    original = academy.commit_chat_images

    async def commit_then_error(session):
        await original(session)
        raise RuntimeError("response interrupted after commit")

    monkeypatch.setattr(academy, "commit_chat_images", commit_then_error)
    response = await client.post(
        f"/api/academy/threads/{conversation['id']}/chat",
        headers=auth,
        files=[("images", ("durable.png", image_bytes("PNG"), "image/png"))],
    )
    assert "event: done" in response.text and "event: error" not in response.text
    saved = (await client.get(f"/api/academy/threads/{conversation['id']}", headers=auth)).json()
    attachment = saved["data"]["messages"][-2]["images"][0]
    assert (root / "academy-chat-images" / user["id"] / f"{attachment['id']}.png").is_file()


@pytest.mark.asyncio
async def test_exif_is_stripped_oriented_and_over_20mp_is_rejected(portal, monkeypatch):
    client, _ = portal
    install_vision_client(monkeypatch)
    _, auth = await register(client, "orientation-image@test.vn")
    conversation = await thread(client, auth)
    endpoint = f"/api/academy/threads/{conversation['id']}/chat"
    exif = Image.Exif()
    exif[274] = 6
    response = await client.post(endpoint, headers=auth, files=[("images", ("orientation.jpg", image_bytes("JPEG", (3, 8), exif), "image/jpeg"))])
    assert "event: done" in response.text
    saved = (await client.get(f"/api/academy/threads/{conversation['id']}", headers=auth)).json()
    attachment = saved["data"]["messages"][-2]["images"][0]
    assert (attachment["width"], attachment["height"]) == (8, 3)
    stored = await client.get(f"/api/academy/threads/{conversation['id']}/images/{attachment['id']}", headers=auth)
    assert 274 not in Image.open(io.BytesIO(stored.content)).getexif()
    oversized = image_bytes("JPEG", (5000, 4001))
    assert (await client.post(endpoint, headers=auth, files=[("images", ("pixels.jpg", oversized, "image/jpeg"))])).status_code == 422
