"""Isolated teacher/student flow. --live-llm makes three real HNQ generations.

Run from apps/api: .venv/Scripts/python.exe ../../scripts/smoke-academy.py --live-llm
No production accounts, class data or upload files are created.
"""
import argparse
import asyncio
import json
import sys
import tempfile
import uuid
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from database import Base, get_db
from routers import academy
from services.llm import router as llm


async def run(live):
    original_client, original_sessions, original_uploads = llm.get_llm_client, academy.async_session, academy.settings.upload_dir
    async def stream(*args):
        yield "Nghiệm là x = 3 [1]."
    async def generate(system, message):
        if '"front"' in message:
            items = [{"front": f"Phép cộng {i}+2", "back": str(i + 2), "topic": "Phép cộng"} for i in range(3)]
        else:
            items = [{"question": f"{i}+2 bằng bao nhiêu?", "options": [str(i + 2), str(i + 3), str(i + 4), str(i + 5)], "answer": 0, "explanation": "Cộng hai vào số đã cho.", "topic": "Phép cộng"} for i in range(3)]
        return json.dumps({"items": items}), {}
    if not live:
        llm.get_llm_client = lambda: SimpleNamespace(chat=generate, stream_chat=stream)
    try:
        with tempfile.TemporaryDirectory(prefix="hoccung-smoke-") as directory:
            engine = create_async_engine("sqlite+aiosqlite:///" + (Path(directory) / "smoke.db").as_posix())
            factory = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            academy.async_session = factory
            academy.settings.upload_dir = str(Path(directory) / "uploads")
            app = FastAPI()
            app.include_router(academy.router)
            async def db():
                async with factory() as session:
                    yield session
            app.dependency_overrides[get_db] = db
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://academy-test", timeout=960) as client:
                async def call(path, method="GET", auth=None, **kwargs):
                    r = await client.request(method, "/api/academy" + path, headers=auth, **kwargs)
                    assert r.is_success, f"{path}: {r.status_code} {r.text[:500]}"
                    return r.json()
                teacher = await call("/register", "POST", json={"name": "Smoke Teacher", "email": "teacher@example.test", "password": uuid.uuid4().hex})
                student = await call("/register", "POST", json={"name": "Smoke Student", "email": "student@example.test", "password": uuid.uuid4().hex})
                ta, sa = [{"Authorization": "Bearer " + a["access_token"]} for a in [teacher, student]]
                assert teacher["user"]["role"] == "teacher" and student["user"]["role"] == "student"
                room = await call("/classes", "POST", ta, json={"name": "Toán 10 smoke", "subject": "Toán", "grade": "10"})
                await call("/classes/join", "POST", sa, json={"code": room["join_code"]})
                doc = await call(f"/classes/{room['id']}/materials", "POST", ta,
                    files={"file": ("algebra.md", "# Phương trình cơ bản\nNghiệm của x + 2 = 5 là x = 3. Chuyển 2 sang vế phải: x = 5 - 2. Cộng 2 và 2 được 4.".encode())}, data={"chapter": "Đại số", "lesson": "Phép cộng"})
                assert (await call(f"/classes/{room['id']}/materials", auth=sa)) == []
                await call(f"/materials/{doc['id']}", "PUT", ta, json={"title": "Phương trình cơ bản", "status": "published", **doc["data"]})
                thread = await call("/threads", "POST", sa, json={"subject": "Toán", "classroom_id": room["id"]})
                response = await client.post(f"/api/academy/threads/{thread['id']}/chat", headers=sa, json={"message": "Theo học liệu, giải phương trình x + 2 = 5. Trả lời ngắn gọn và dẫn nguồn."})
                assert "event: done" in response.text and "event: error" not in response.text, response.text[:1000]
                saved = await call(f"/threads/{thread['id']}", auth=sa)
                assert saved["data"]["messages"][-1]["sources"][0]["material_id"] == doc["id"]
                quiz = await call("/assets/generate", "POST", ta, json={"kind": "quiz", "subject": "Toán", "topic": "Phép cộng số nguyên và phương trình x + 2 = 5", "count": 3, "classroom_id": room["id"], "material_id": doc["id"], "diagnostic": True})
                quiz = await call(f"/assets/{quiz['id']}", auth=ta)
                assert len(quiz["data"]["items"]) == 3
                await call(f"/assets/{quiz['id']}", "PUT", ta, json={"title": quiz["title"], "status": "published", "items": quiz["data"]["items"]})
                student_view = await call(f"/assets/{quiz['id']}", auth=sa)
                assert "answer" not in student_view["data"]["items"][0]
                await call(f"/assets/{quiz['id']}/attempts", "POST", sa, json={"answers": [q["answer"] for q in quiz["data"]["items"]], "submission_id": str(uuid.uuid4())})
                cards = await call("/assets/generate", "POST", sa, json={"kind": "flashcards", "subject": "Toán", "topic": "Phép cộng và phương trình cơ bản", "count": 3, "classroom_id": room["id"]})
                review = await call(f"/assets/{cards['id']}/cards/0/review", "POST", sa, json={"rating": 3})
                assert review["due"]
                start = date.today() + timedelta(days=1)
                await call("/profile", "PUT", sa, json={"goal": "Ôn Toán cơ bản", "subjects": ["Toán"], "availability": [{"weekday": i, "start": "19:00", "end": "20:30"} for i in range(7)]})
                planned = await call("/schedule/generate", "POST", sa, json={"start": str(start), "end": str(start + timedelta(days=6)), "subjects": ["Toán"], "daily_minutes": 60})
                assert planned["created"] > 0
                progress = await call("/progress", auth=sa)
                assert progress["streak"]["current"] == 1 and progress["attempts"][0]["data"]["score"] == 3
                report = await call(f"/classes/{room['id']}/report", auth=ta)
                assert report["students"][0]["cards_reviewed"] == 0  # personal flashcards remain private
                print(json.dumps({"ok": True, "live_llm": live, "teacher_student_roles": True, "published_sources": True,
                    "chat_persisted": True, "quiz_score": "3/3", "flashcard_due": review["due"], "schedule_entries": planned["created"], "streak": progress["streak"]["current"], "isolated_cleanup": True}))
            await engine.dispose()
    finally:
        llm.get_llm_client, academy.async_session, academy.settings.upload_dir = original_client, original_sessions, original_uploads


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live-llm", action="store_true")
    asyncio.run(run(parser.parse_args().live_llm))
