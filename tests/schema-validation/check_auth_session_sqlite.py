"""Isolated AuthSession SQLite FK and authorization-predicate smoke checks.

Only the dedicated auth-session-validation.db file is accepted.
Every inserted row is rolled back. Does not modify production databases.
"""
import sqlite3
import sys
from pathlib import Path

EXPECTED_NAME = "auth-session-validation.db"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python check_auth_session_sqlite.py <auth-session-validation.db>")
    path = Path(sys.argv[1]).resolve()
    if path.name != EXPECTED_NAME or not path.is_file():
        raise SystemExit(f"Refusing non-existing or non-isolated DB (expected {EXPECTED_NAME})")

    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        if conn.execute("PRAGMA foreign_keys").fetchone()[0] != 1:
            raise AssertionError("SQLite foreign keys are disabled")
        expected = {"User", "AuthSession"}
        actual = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )}
        if not expected.issubset(actual):
            raise AssertionError(f"Missing tables: {expected - actual}")

        conn.execute("BEGIN")
        conn.execute(
            'INSERT INTO "User" ("id", "userId", "isActive") VALUES (?, ?, ?)',
            ("auth-test-user-a", "auth-test-login-a", 1),
        )
        conn.execute(
            'INSERT INTO "User" ("id", "userId", "isActive") VALUES (?, ?, ?)',
            ("auth-test-user-b", "auth-test-login-b", 1),
        )
        # Prisma SQLite DateTime columns are integer timestamps.
        base = 1800000000000
        insert = (
            'INSERT INTO "AuthSession" '
            '("id", "userId", "tokenHash", "createdAt", "expiresAt", "revokedAt") '
            'VALUES (?, ?, ?, ?, ?, ?)'
        )
        conn.execute(insert, ("auth-test-s1", "auth-test-user-a", "digest-a", base, base + 1000, None))
        print("PASS: session creation with digest only")

        try:
            conn.execute(insert, ("auth-test-s2", "auth-test-user-b", "digest-a", base, base + 1000, None))
            raise AssertionError("duplicate digest accepted")
        except sqlite3.IntegrityError:
            print("PASS: duplicate token digest rejected")

        def authorized(session_id: str, now: int) -> bool:
            return conn.execute(
                'SELECT 1 FROM "AuthSession" s JOIN "User" u ON u.id = s.userId '
                'WHERE s.id = ? AND s.revokedAt IS NULL AND s.expiresAt > ? '
                'AND u.isActive = 1',
                (session_id, now),
            ).fetchone() is not None

        assert authorized("auth-test-s1", base)
        assert not authorized("auth-test-s1", base + 1000)
        print("PASS: expiration boundary is exclusive")

        conn.execute('UPDATE "AuthSession" SET "revokedAt" = ? WHERE "id" = ?', (base + 1, "auth-test-s1"))
        assert not authorized("auth-test-s1", base)
        print("PASS: revoked session rejected")

        conn.execute(insert, ("auth-test-s3", "auth-test-user-b", "digest-b", base, base + 1000, None))
        conn.execute('UPDATE "User" SET "isActive" = 0 WHERE "id" = ?', ("auth-test-user-b",))
        assert not authorized("auth-test-s3", base)
        print("PASS: inactive User session rejected")

        conn.execute('DELETE FROM "User" WHERE "id" = ?', ("auth-test-user-a",))
        assert conn.execute('SELECT 1 FROM "AuthSession" WHERE "id" = ?', ("auth-test-s1",)).fetchone() is None
        print("PASS: User deletion cascades sessions")
    finally:
        conn.rollback()
        conn.close()
        print("PASS: test changes rolled back")


if __name__ == "__main__":
    main()
