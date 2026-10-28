"""A failed ingestion must never remove another job's retained source."""

import hashlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from routers import upload


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["logical", "exception", "commit"])
async def test_failed_upload_preserves_existing_source(tmp_path, monkeypatch, failure):
    payload = b"Synthetic course notes"
    old = tmp_path / (hashlib.sha256(payload).hexdigest()[:16] + "_notes.txt")
    old.write_bytes(payload)
    monkeypatch.setattr(upload.settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(upload, "get_course_or_404", AsyncMock())
    job = SimpleNamespace(
        status="failed" if failure == "logical" else "completed",
        error_message="parse failed",
    )
    pipeline = AsyncMock(return_value=job)
    if failure == "exception":
        pipeline.side_effect = RuntimeError("parse failed")
    monkeypatch.setattr(upload, "run_ingestion_pipeline", pipeline)
    db = AsyncMock()
    if failure == "commit":
        db.commit.side_effect = RuntimeError("commit failed")
    file = SimpleNamespace(filename="notes.txt", read=AsyncMock(return_value=payload))
    with pytest.raises((upload.AppError, RuntimeError)):
        await upload.upload_file(
            None, file, str(uuid.uuid4()), SimpleNamespace(id=uuid.uuid4()), db
        )
    assert old.read_bytes() == payload
    assert list(tmp_path.iterdir()) == [old]


@pytest.mark.asyncio
async def test_duplicate_upload_discards_only_its_unused_copy(tmp_path, monkeypatch):
    old = tmp_path / "retained.txt"
    old.write_bytes(b"notes")
    monkeypatch.setattr(upload.settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(upload, "get_course_or_404", AsyncMock())
    job = SimpleNamespace(
        id=uuid.uuid4(),
        file_path=str(old),
        status="completed",
        nodes_created=0,
        content_category="notes",
        dispatched_to={},
    )
    monkeypatch.setattr(upload, "run_ingestion_pipeline", AsyncMock(return_value=job))
    file = SimpleNamespace(filename="notes.txt", read=AsyncMock(return_value=b"notes"))
    await upload.upload_file(
        None, file, str(uuid.uuid4()), SimpleNamespace(id=uuid.uuid4()), AsyncMock()
    )
    assert list(tmp_path.iterdir()) == [old]
