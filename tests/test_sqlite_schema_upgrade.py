"""Exercise upgrades of populated SQLite files, including rollback and backups."""

import sqlite3
import uuid
from unittest.mock import AsyncMock

import pytest
import sqlalchemy as sa
from database import Base
from services.migrations import inspect_database_migrations
from services.sqlite_migrations import REVISION, current_revision, upgrade_sqlite
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def legacy_database(path):
    engine = sa.create_engine(f"sqlite:///{path}")
    metadata = sa.MetaData()
    for table in Base.metadata.tables.values():
        table.to_metadata(metadata)
    # The previous FK rules had no ON DELETE action.
    for name in ("courses", "generated_assets", "course_content_tree"):
        for fk in metadata.tables[name].foreign_key_constraints:
            fk.ondelete = None
    user, course = str(uuid.uuid4()), str(uuid.uuid4())
    with engine.begin() as connection:
        metadata.create_all(connection)
        connection.execute(
            metadata.tables["users"].insert().values(id=user, name="Preserved learner")
        )
        connection.execute(
            metadata.tables["courses"]
            .insert()
            .values(id=course, user_id=user, name="Preserved course")
        )
        connection.execute(
            metadata.tables["generated_assets"]
            .insert()
            .values(
                user_id=user,
                course_id=course,
                asset_type="notes",
                title="Saved notes",
                content={"text": "keep me"},
            )
        )
        parent = str(uuid.uuid4())
        connection.execute(
            metadata.tables["course_content_tree"]
            .insert()
            .values(
                id=parent, course_id=course, title="Parent", content="parent material"
            )
        )
        connection.execute(
            metadata.tables["course_content_tree"]
            .insert()
            .values(
                course_id=course,
                parent_id=parent,
                title="Child",
                content="child material",
            )
        )
        connection.exec_driver_sql("ALTER TABLE courses DROP COLUMN active_scene")
        connection.exec_driver_sql("DROP INDEX ix_mem_user_course_created")
        connection.exec_driver_sql("DROP INDEX ix_practice_result_user_problem")
        connection.exec_driver_sql("CREATE INDEX user_course_name ON courses (name)")
        connection.exec_driver_sql("CREATE TABLE audit_events (name TEXT)")
        connection.exec_driver_sql(
            "CREATE TRIGGER course_audit AFTER UPDATE OF name ON courses BEGIN INSERT INTO audit_events VALUES (NEW.name); END"
        )
    engine.dispose()
    return user, course


@pytest.mark.asyncio
async def test_legacy_upgrade_preserves_data_and_backs_up_before_changes(tmp_path):
    path = tmp_path / "legacy.db"
    _, course = legacy_database(path)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    try:
        async with engine.connect() as conn:
            before = await conn.run_sync(inspect_database_migrations)
            assert not before.schema_ready
        backup = await upgrade_sqlite(engine)
        assert backup
        with sqlite3.connect(backup) as old:
            assert "active_scene" not in {
                x[1] for x in old.execute("PRAGMA table_info(courses)")
            }
            assert (
                old.execute("SELECT name FROM courses").fetchone()[0]
                == "Preserved course"
            )
        async with engine.begin() as conn:
            state = await conn.run_sync(inspect_database_migrations)
            assert state.schema_ready
            assert await conn.run_sync(current_revision) == REVISION
            assert (
                await conn.exec_driver_sql("SELECT active_scene FROM courses")
            ).scalar() == "study_session"
            await conn.exec_driver_sql("UPDATE courses SET name='Updated'")
            assert (
                await conn.exec_driver_sql("SELECT name FROM audit_events")
            ).scalar() == "Updated"
            indexes = await conn.run_sync(
                lambda c: sa.inspect(c).get_indexes("courses")
            )
            assert "user_course_name" in {x["name"] for x in indexes}
            assert (
                await conn.exec_driver_sql("SELECT count(*) FROM course_content_tree")
            ).scalar() == 2
            await conn.execute(
                sa.text("DELETE FROM courses WHERE id=:id"), {"id": course}
            )
            assert (
                await conn.exec_driver_sql("SELECT count(*) FROM course_content_tree")
            ).scalar() == 0
            assert (
                await conn.exec_driver_sql("SELECT course_id FROM generated_assets")
            ).scalar() is None
            assert (
                await conn.exec_driver_sql("SELECT title FROM generated_assets")
            ).scalar() == "Saved notes"
            assert (await conn.exec_driver_sql("PRAGMA foreign_keys")).scalar() == 1
        assert await upgrade_sqlite(engine) is None
        assert len(list((tmp_path / "backups").glob("*.db"))) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_failed_upgrade_rolls_back_every_table_and_restores_fk_enforcement(
    tmp_path, monkeypatch
):
    from services import sqlite_migrations

    path = tmp_path / "rollback.db"
    legacy_database(path)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    original = sqlite_migrations._rebuild
    calls = []

    def fail_after_copy(connection, table):
        original(connection, table)
        calls.append(table.name)
        raise RuntimeError("synthetic failure after table replacement")

    monkeypatch.setattr(sqlite_migrations, "_rebuild", fail_after_copy)
    try:
        with pytest.raises(RuntimeError, match="synthetic"):
            await upgrade_sqlite(engine)
        assert calls
        async with engine.connect() as conn:
            names = await conn.run_sync(
                lambda c: {x["name"] for x in sa.inspect(c).get_columns("courses")}
            )
            assert "active_scene" not in names
            assert (
                await conn.exec_driver_sql("SELECT name FROM courses")
            ).scalar() == "Preserved course"
            assert (await conn.exec_driver_sql("PRAGMA foreign_keys")).scalar() == 1
            assert await conn.run_sync(current_revision) is None
            assert not (
                await conn.exec_driver_sql(
                    "SELECT name FROM sqlite_master WHERE name LIKE '_opentutor_upgrade_%'"
                )
            ).all()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_unknown_columns_are_not_discarded_during_upgrade(tmp_path):
    path = tmp_path / "custom.db"
    legacy_database(path)
    with sqlite3.connect(path) as conn:
        conn.execute(
            "ALTER TABLE courses ADD COLUMN custom_notes TEXT DEFAULT 'retain this'"
        )
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    try:
        with pytest.raises(RuntimeError, match="custom columns"):
            await upgrade_sqlite(engine)
        async with engine.connect() as conn:
            assert (
                await conn.exec_driver_sql("SELECT custom_notes FROM courses")
            ).scalar() == "retain this"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_fresh_memory_database_is_versioned_and_idempotent():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        assert await upgrade_sqlite(engine) is None
        assert await upgrade_sqlite(engine) is None
        async with engine.connect() as conn:
            assert (await conn.run_sync(inspect_database_migrations)).schema_ready
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_required_field_without_backfill_preserves_original_database(tmp_path):
    path = tmp_path / "required.db"
    legacy_database(path)
    with sqlite3.connect(path) as conn:
        conn.execute("ALTER TABLE generated_assets DROP COLUMN title")
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    try:
        with pytest.raises(RuntimeError, match="Cannot backfill required column"):
            await upgrade_sqlite(engine)
        async with engine.connect() as conn:
            columns = await conn.run_sync(
                lambda c: {x["name"] for x in sa.inspect(c).get_columns("courses")}
            )
            assert "active_scene" not in columns
            assert (
                await conn.exec_driver_sql("SELECT count(*) FROM generated_assets")
            ).scalar() == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_newer_database_revision_is_not_downgraded(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'future.db'}")
    try:
        await upgrade_sqlite(engine)
        async with engine.begin() as conn:
            await conn.exec_driver_sql(
                "UPDATE opentutor_schema_version SET revision='sqlite_future'"
            )
        with pytest.raises(RuntimeError, match="refusing a downgrade"):
            await upgrade_sqlite(engine)
        async with engine.connect() as conn:
            assert not (await conn.run_sync(inspect_database_migrations)).schema_ready
            assert await conn.run_sync(current_revision) == "sqlite_future"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("upgraded", [False, True])
async def test_readiness_requires_an_upgraded_schema(monkeypatch, upgraded):
    from services import health

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        if upgraded:
            await upgrade_sqlite(engine)
        monkeypatch.setattr(
            health.database_module, "async_session", async_sessionmaker(engine)
        )
        monkeypatch.setattr(
            health,
            "get_llm_runtime_status",
            AsyncMock(return_value={"status": "ready"}),
        )
        result = await health.get_readiness()
        assert result["database"] == "connected"
        assert result["schema_ready"] is upgraded
        assert result["ready"] is upgraded
    finally:
        await engine.dispose()
