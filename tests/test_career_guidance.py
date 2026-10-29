"""Career report validation and private persistence contracts."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from services.career_guidance import validate_report
from test_academy import portal, register  # reuse isolated account/database fixture


def report_data():
    return {
        "summary": "Khám phá qua trải nghiệm thực tế.",
        "options": [{"field": field, "reasons": ["Thích giải quyết vấn đề"], "subjects": ["Toán"],
                     "preparation": ["Luyện tư duy"], "experiment": "Thử dự án nhỏ", "tradeoffs": "Cần kiên trì"}
                    for field in ["Kỹ thuật", "Thiết kế", "Giáo dục"]],
        "next_steps": [{"period": period, "action": "Thử một hoạt động", "outcome": "Ghi lại điều học được"}
                       for period in ["Tuần 1", "Tuần 2", "Tuần 3"]],
        "questions": ["Bạn muốn thử hoạt động nào trước?"],
    }


def test_report_rejects_duplicate_and_incomplete_options():
    data = report_data()
    data["options"][1]["field"] = " KỸ THUẬT "
    with pytest.raises(HTTPException):
        validate_report(json.dumps(data), {})
    with pytest.raises(HTTPException):
        validate_report('{}', {})


@pytest.mark.asyncio
async def test_report_profile_prerequisite_private_save_and_invalid_preservation(portal, monkeypatch):
    from services.llm import router
    _, owner = await register(portal, "owner@career.vn")
    _, other = await register(portal, "other@career.vn")
    chat = AsyncMock(return_value=(json.dumps(report_data()), None))
    monkeypatch.setattr(router, "get_llm_client", lambda: SimpleNamespace(chat=chat))
    assert (await portal.post("/api/academy/career/report", headers=owner)).status_code == 422
    chat.assert_not_called()
    profile = {"grade": "10", "level": "foundation", "goal": "Tìm ngành", "subjects": ["Toán"],
               "availability": [], "interests": "Máy tính", "strengths": "Tư duy", "career_constraints": "Học gần nhà"}
    assert (await portal.put("/api/academy/profile", headers=owner, json=profile)).status_code == 200
    response = await portal.post("/api/academy/career/report", headers=owner)
    assert response.status_code == 200, response.text
    saved = response.json()["report"]
    assert saved["profile_snapshot"]["subjects"] == ["Toán"]
    assert saved["created_at"] and saved["admissions_note"]
    assert (await portal.get("/api/academy/career/report", headers=other)).json() == {"report": None}
    assert (await portal.get("/api/academy/career/report")).status_code == 401
    chat.return_value = ('{"summary":"Incomplete"}', None)
    assert (await portal.post("/api/academy/career/report", headers=owner)).status_code == 502
    assert (await portal.get("/api/academy/career/report", headers=owner)).json()["report"] == saved
