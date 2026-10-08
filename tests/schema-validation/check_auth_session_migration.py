"""Verify additive AuthSession migration on an in-memory SQLite database.

No production DB access. Creates a representative existing User table, then
applies the exact checked-in migration and verifies preservation + constraints.
"""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "apps/web/prisma/migrations/20261008172500_add_auth_session/migration.sql"


def main() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    if any(word in sql.upper() for word in ("DROP TABLE", "ALTER TABLE", "DELETE FROM", "UPDATE ")):
        raise AssertionError("Migration contains non-additive SQL")
    db = sqlite3.connect(":memory:")
    try:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute('CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL)')
        db.execute('INSERT INTO "User" ("id", "userId") VALUES (?, ?)', ("u1", "existing"))
        db.executescript(sql)
        assert db.execute('SELECT "userId" FROM "User" WHERE "id" = ?', ("u1",)).fetchone() == ("existing",)
        print("PASS: existing User data preserved")
        indexes = {r[1] for r in db.execute('PRAGMA index_list("AuthSession")')}
        assert {
            "AuthSession_tokenHash_key",
            "AuthSession_userId_expiresAt_idx",
            "AuthSession_expiresAt_idx",
        } <= indexes
        print("PASS: unique token hash and lookup indexes created")
        db.execute(
            'INSERT INTO "AuthSession" ("id","userId","tokenHash","expiresAt") VALUES (?,?,?,?)',
            ("s1", "u1", "digest1", "2030-01-01T00:00:00"),
        )
        try:
            db.execute(
                'INSERT INTO "AuthSession" ("id","userId","tokenHash","expiresAt") VALUES (?,?,?,?)',
                ("s2", "u1", "digest1", "2030-01-01T00:00:00"),
            )
            raise AssertionError("Duplicate token hash accepted")
        except sqlite3.IntegrityError:
            print("PASS: duplicate token hash rejected")
        try:
            db.execute(
                'INSERT INTO "AuthSession" ("id","userId","tokenHash","expiresAt") VALUES (?,?,?,?)',
                ("s3", "missing", "digest3", "2030-01-01T00:00:00"),
            )
            raise AssertionError("Orphan session accepted")
        except sqlite3.IntegrityError:
            print("PASS: orphan session rejected")
        db.execute('DELETE FROM "User" WHERE "id" = ?', ("u1",))
        assert db.execute('SELECT COUNT(*) FROM "AuthSession"').fetchone()[0] == 0
        print("PASS: User deletion cascades to AuthSession")
    finally:
        db.close()


if __name__ == "__main__":
    main()
