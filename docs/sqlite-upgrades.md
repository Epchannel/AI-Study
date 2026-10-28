# Local SQLite upgrades

With `APP_AUTO_CREATE_TABLES=true`, startup checks the existing local schema and
upgrades it before seeding data or starting background workers. New databases
and upgraded databases record a local revision in `opentutor_schema_version`.
`alembic upgrade head` uses the same SQLite upgrade path; PostgreSQL still uses
the existing Alembic revisions.

The first local revision repairs missing model tables and supported columns,
query indexes, and the current foreign-key deletion rules. Existing source data,
custom indexes and triggers are retained. Scalar model defaults backfill missing
columns; nullable columns and server defaults retain their normal semantics.

Before changing a populated file database, the upgrader creates a consistent
SQLite backup, including WAL contents, in `backups/` beside the database. The
backup filename includes the database name, target revision and timestamp. The
file is created with owner-only permissions on POSIX systems; Windows uses the
directory's inherited access controls. Backups are never automatically deleted.
In-memory databases do not create backup files.

The upgrade holds a database write lock and applies schema changes in one
transaction. If copying rows or checking foreign keys fails, all schema/data
changes roll back, and foreign-key enforcement is restored. Repeating startup
on a successfully upgraded database does not rebuild tables or create another
backup.

An upgrade stops rather than guessing if it encounters a newer local revision,
custom columns/constraints on a table that requires rebuilding, required fields
without a safe backfill, or orphaned references. The original database is kept;
the error identifies the unsupported case. Resolve that case with a targeted
migration before retrying. This is forward-only migration, not an automatic
downgrade facility.
The SQLite CLI accepts `alembic upgrade head`; other online Alembic operations
are rejected without modifying the database. Use `/api/health` for local schema
status.

Health checks inspect actual schema requirements and the local revision. An
unprepared database reports `migration_required=true` even if it is reachable.
When automatic table creation is disabled, run `alembic upgrade head` explicitly
before starting the application.

For recovery, stop all processes using the database before restoring a verified
backup with SQLite's restore tooling. Keep the original database and its WAL
files together until recovery has been verified. Backups can contain private
course data and should stay outside public repositories.
