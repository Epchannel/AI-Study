"""Rank the complete matching set before applying the candidate limit."""

import uuid

import pytest
from database import Base
from models.content import CourseContentTree
from services.search.strategies import keyword_search
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.mark.asyncio
async def test_strong_match_after_candidate_cutoff_is_returned():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine)() as db:
            course = uuid.uuid4()
            for title in ["alpha"] * 24 + ["alpha beta gamma"]:
                db.add(
                    CourseContentTree(
                        course_id=course, title=title, content=title, level=0
                    )
                )
            await db.commit()
            hits = await keyword_search(db, course, "alpha beta gamma", limit=2)
            assert hits[0]["title"] == "alpha beta gamma"
            assert len(hits) == 2
    finally:
        await engine.dispose()
