"""Validate the additive MFA login attempt migration using an isolated SQLite DB.

Run from repository root:
    python tests/schema-validation/check_mfa_login_attempt_migration.py

This script does not open the application's database.
"""
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL = ROOT / "apps/web/prisma/migrations/20261014100000_add_mfa_login_attempt/migration.sql"


def main() -> None:
    sql = SQL.read_text(encoding="utf-8")
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute(
        'CREATE TABLE "User" ('
        '"id" TEXT NOT NULL PRIMARY KEY, '
        '"totpFailCount" INTEGER NOT NULL DEFAULT 0, '
        '"lockUntil" DATETIME)'
    )
    db.execute('INSERT INTO "User" ("id", "totpFailCount") VALUES (?, ?)', ("u1", 3))
    db.executescript(sql)
    db.execute('INSERT INTO "MfaLoginAttempt" ("userId") VALUES (?)', ("u1",))
    count, lock, updated = db.execute(
        'SELECT "failCount", "lockedUntil", "updatedAt" FROM "MfaLoginAttempt"'
    ).fetchone()
    assert count == 0 and lock is None and updated is not None
    assert db.execute(
        'SELECT "totpFailCount", "lockUntil" FROM "User" WHERE "id" = ?', ("u1",)
    ).fetchone() == (3, None)

    for user_id in ("u1", "missing"):
        try:
            db.execute('INSERT INTO "MfaLoginAttempt" ("userId") VALUES (?)', (user_id,))
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError(f"Invalid MFA row accepted: {user_id}")

    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    db.execute('DELETE FROM "User" WHERE "id" = ?', ("u1",))
    assert db.execute('SELECT COUNT(*) FROM "MfaLoginAttempt"').fetchone()[0] == 0
    print("PASS: additive MFA migration, defaults, legacy fields, PK, FK, cascade")


if __name__ == "__main__":
    main()
