"""Isolated SQLite FK smoke test. All changes rolled back."""
import sqlite3
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("usage: python check_sqlite_relations.py <existing-test-db>")
path = Path(sys.argv[1]).resolve()
if not path.is_file() or path.name != "relation-validation-v2.db":
    raise SystemExit("Refusing non-test or missing DB")
con = sqlite3.connect(str(path))
con.execute("PRAGMA foreign_keys=ON")
assert con.execute("PRAGMA foreign_keys").fetchone()[0] == 1
con.execute("BEGIN")
try:
    con.execute('INSERT INTO "User" ("id","userId") VALUES (?,?)', ("fk-test-u1", "fk-test-login-1"))
    con.execute('INSERT INTO "User" ("id","userId") VALUES (?,?)', ("fk-test-u2", "fk-test-login-2"))
    con.execute('''INSERT INTO "UserImage" ("userId","id","kind","status","contentHash","mimeType","byteLength","width","height")
                   VALUES (?,?,?,?,?,?,?,?,?)''',
                ("fk-test-u1", "fk-test-image", "ACCOUNT_ICON", "READY", "abc", "image/webp", 1, 1, 1))
    con.execute('UPDATE "User" SET "iconImageId"=? WHERE "id"=?', ("fk-test-image", "fk-test-u1"))
    print("PASS: owner can reference image")

    def expect_fk(label, statement, params):
        try:
            con.execute("SAVEPOINT fk_case")
            con.execute(statement, params)
        except sqlite3.IntegrityError:
            con.execute("ROLLBACK TO fk_case")
            con.execute("RELEASE fk_case")
            print("PASS:", label)
        else:
            con.execute("ROLLBACK TO fk_case")
            con.execute("RELEASE fk_case")
            raise AssertionError("FK unexpectedly allowed: " + label)

    expect_fk("cross-user icon denied", 'UPDATE "User" SET "iconImageId"=? WHERE "id"=?',
              ("fk-test-image", "fk-test-u2"))
    expect_fk("referenced image delete denied", 'DELETE FROM "UserImage" WHERE "userId"=? AND "id"=?',
              ("fk-test-u1", "fk-test-image"))
    con.execute('''INSERT INTO "Theme" ("userId","id","name","baseTheme","tokens","wallpaperImageId","updatedAt")
                   VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)''',
                ("fk-test-u1", "fk-test-theme", "Test", "light", "{}", "fk-test-image"))
    print("PASS: owner can reference wallpaper (FK only; kind validation belongs to service)")
    expect_fk("cross-user wallpaper denied",
              '''INSERT INTO "Theme" ("userId","id","name","baseTheme","tokens","wallpaperImageId","updatedAt")
                 VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)''',
              ("fk-test-u2", "fk-test-theme2", "Test", "light", "{}", "fk-test-image"))
    con.execute('DELETE FROM "User" WHERE "id"=?', ("fk-test-u1",))
    assert con.execute('SELECT COUNT(*) FROM "UserImage" WHERE "userId"=?', ("fk-test-u1",)).fetchone()[0] == 0
    assert con.execute('SELECT COUNT(*) FROM "Theme" WHERE "userId"=?', ("fk-test-u1",)).fetchone()[0] == 0
    print("PASS: user cascade deletes image and theme")
finally:
    con.rollback()
    con.close()
print("PASS: all test changes rolled back")
