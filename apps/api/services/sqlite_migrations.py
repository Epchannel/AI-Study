"""Transactional local-schema upgrades with a pre-upgrade SQLite backup.

Only known model tables are upgraded. Unsupported/custom table shapes fail
closed instead of discarding columns or inventing values for required fields.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.schema import CreateTable

from database import Base

REVISION = "sqlite_20261029_01"
VERSION_TABLE = "opentutor_schema_version"


def _fk_key(columns, table, referred, ondelete):
    return (tuple(columns), table, tuple(referred), (ondelete or "NO ACTION").upper())


def _expected_fks(table):
    return {
        _fk_key(
            [e.parent.name for e in fk.elements],
            fk.referred_table.name,
            [e.column.name for e in fk.elements],
            fk.ondelete,
        )
        for fk in table.foreign_key_constraints
    }


def _actual_fks(inspector, name):
    return {
        _fk_key(
            fk["constrained_columns"],
            fk["referred_table"],
            fk["referred_columns"],
            fk.get("options", {}).get("ondelete"),
        )
        for fk in inspector.get_foreign_keys(name)
    }


def schema_changes(connection):
    """Find missing tables/columns/indexes and outdated foreign-key rules."""
    inspector = sa.inspect(connection)
    tables = set(inspector.get_table_names())
    rebuild, indexes = [], []
    missing = set(Base.metadata.tables) - tables
    for table in Base.metadata.sorted_tables:
        if table.name in missing:
            continue
        columns = {c["name"] for c in inspector.get_columns(table.name)}
        expected_unique = {
            tuple(c.name for c in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, sa.UniqueConstraint)
        }
        actual_unique = {
            tuple(c["column_names"])
            for c in inspector.get_unique_constraints(table.name)
        }
        if (
            set(table.c.keys()) - columns
            or _expected_fks(table) != _actual_fks(inspector, table.name)
            or not expected_unique <= actual_unique
        ):
            rebuild.append(table.name)
        actual_indexes = {
            i["name"]: (tuple(i["column_names"]), bool(i["unique"]))
            for i in inspector.get_indexes(table.name)
        }
        for index in table.indexes:
            expected = (tuple(c.name for c in index.columns), bool(index.unique))
            if actual_indexes.get(index.name) != expected:
                indexes.append(index)
    return sorted(missing), rebuild, indexes


def current_revision(connection):
    if VERSION_TABLE not in sa.inspect(connection).get_table_names():
        return None
    return connection.exec_driver_sql(f"SELECT revision FROM {VERSION_TABLE}").scalar()


def _backup(connection):
    database = connection.engine.url.database
    if (
        not database
        or database == ":memory:"
        or connection.engine.url.query.get("mode") == "memory"
    ):
        return None
    source = Path(database).resolve()
    directory = source.parent / "backups"
    directory.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = (
        directory / f"{source.name}.pre-{REVISION}-{stamp}-{uuid.uuid4().hex[:8]}.db"
    )
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        # A separate reader can back up WAL state while our BEGIN IMMEDIATE
        # prevents concurrent writers. Backing up the writer itself deadlocks.
        with (
            closing(sqlite3.connect(source)) as reader,
            closing(sqlite3.connect(destination)) as target,
        ):
            reader.backup(target)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return str(destination)


def _rebuild(connection, table):
    inspector = sa.inspect(connection)
    columns = {c["name"] for c in inspector.get_columns(table.name)}
    extra = columns - set(table.c.keys())
    if extra:
        raise RuntimeError(
            f"Cannot automatically upgrade {table.name}: custom columns {sorted(extra)}"
        )
    expected_unique = {
        tuple(c.name for c in x.columns)
        for x in table.constraints
        if isinstance(x, sa.UniqueConstraint)
    }
    if any(
        tuple(x["column_names"]) not in expected_unique
        for x in inspector.get_unique_constraints(table.name)
    ):
        raise RuntimeError(
            f"Cannot automatically upgrade custom unique constraints on {table.name}"
        )
    expected_checks = {
        str(x.sqltext) for x in table.constraints if isinstance(x, sa.CheckConstraint)
    }
    if any(
        x["sqltext"] not in expected_checks
        for x in inspector.get_check_constraints(table.name)
    ):
        raise RuntimeError(
            f"Cannot automatically upgrade custom check constraints on {table.name}"
        )
    expected_fk_columns = {x[:3] for x in _expected_fks(table)}
    if any(
        x[:3] not in expected_fk_columns for x in _actual_fks(inspector, table.name)
    ):
        raise RuntimeError(
            f"Cannot automatically upgrade custom foreign keys on {table.name}"
        )

    quote = connection.dialect.identifier_preparer.quote
    has_rows = (
        connection.exec_driver_sql(f"SELECT 1 FROM {quote(table.name)} LIMIT 1").first()
        is not None
    )
    names, values = [], []
    for column in table.c:
        if column.name in columns:
            names.append(quote(column.name))
            values.append(quote(column.name))
        elif column.default is not None and column.default.is_scalar:
            names.append(quote(column.name))
            values.append(
                str(
                    sa.literal(column.default.arg, type_=column.type).compile(
                        dialect=connection.dialect,
                        compile_kwargs={"literal_binds": True},
                    )
                )
            )
        elif has_rows and not column.nullable and column.server_default is None:
            raise RuntimeError(
                f"Cannot backfill required column {table.name}.{column.name}; "
                "original data retained"
            )

    # Preserve user-defined indexes and triggers when copying known tables.
    extras = connection.execute(
        sa.text(
            "SELECT type, name, sql FROM sqlite_master "
            "WHERE tbl_name=:table AND type IN ('index','trigger') AND sql IS NOT NULL"
        ),
        {"table": table.name},
    ).all()
    metadata = sa.MetaData()
    for source in Base.metadata.tables.values():
        source.to_metadata(metadata)
    temporary = table.to_metadata(
        metadata, name=f"_opentutor_upgrade_{uuid.uuid4().hex}"
    )
    connection.execute(CreateTable(temporary))
    if has_rows:
        connection.exec_driver_sql(
            f"INSERT INTO {quote(temporary.name)} ({', '.join(names)}) "
            f"SELECT {', '.join(values)} FROM {quote(table.name)}"
        )
    connection.exec_driver_sql(f"DROP TABLE {quote(table.name)}")
    connection.exec_driver_sql(
        f"ALTER TABLE {quote(temporary.name)} RENAME TO {quote(table.name)}"
    )
    expected_index_names = {index.name for index in table.indexes}
    for kind, name, sql in extras:
        if kind == "trigger" or name not in expected_index_names:
            connection.exec_driver_sql(sql)
    for index in table.indexes:
        index.create(connection, checkfirst=True)


def upgrade_schema(connection):
    """Upgrade inside a caller-owned write transaction with FK checks disabled."""
    missing, rebuild, indexes = schema_changes(connection)
    revision = current_revision(connection)
    if revision not in (None, REVISION):
        raise RuntimeError(
            f"Unsupported SQLite schema revision {revision}; refusing a downgrade"
        )
    if not (missing or rebuild or indexes) and revision == REVISION:
        return None
    tables = sa.inspect(connection).get_table_names()
    backup = _backup(connection) if tables else None
    Base.metadata.create_all(connection)
    for name in rebuild:
        _rebuild(connection, Base.metadata.tables[name])
    for index in indexes:
        if index.table.name not in rebuild:
            index.drop(connection, checkfirst=True)
            index.create(connection)
    if connection.exec_driver_sql("PRAGMA foreign_key_check").first() is not None:
        raise RuntimeError(
            "SQLite upgrade found orphaned references; "
            "all changes rolled back; inspect the backup"
        )
    connection.exec_driver_sql(
        f"CREATE TABLE IF NOT EXISTS {VERSION_TABLE} "
        "(revision TEXT NOT NULL PRIMARY KEY)"
    )
    connection.exec_driver_sql(f"DELETE FROM {VERSION_TABLE}")
    connection.execute(
        sa.text(f"INSERT INTO {VERSION_TABLE} (revision) VALUES (:revision)"),
        {"revision": REVISION},
    )
    return backup


async def upgrade_sqlite(engine):
    """Serialize startup upgrades, commit atomically and restore FK enforcement."""
    async with engine.connect() as connection:
        await connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        await connection.commit()
        try:
            await connection.exec_driver_sql("BEGIN IMMEDIATE")
            backup = await connection.run_sync(upgrade_schema)
            await connection.commit()
            return backup
        except BaseException:
            await connection.rollback()
            raise
        finally:
            await connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            await connection.commit()
