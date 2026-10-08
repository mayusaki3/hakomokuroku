import { describe, it } from "vitest";

/**
 * UserImage API contract tests (pre-implementation).
 * Each TODO corresponds to an acceptance case in
 * docs/ja-JP/03_テスト/10_UserImage_テストケース.md.
 *
 * Replace TODOs with real API/storage assertions once the implementation exists.
 * TODOs are NOT passing tests.
 */
describe("UserImage API / account / theme contract", () => {
  const cases: Array<[string, string]> = [
    ["UI-001", "valid upload returns canonical WebP metadata"],
    ["UI-002", "oversized upload returns 413 without changing references"],
    ["UI-003", "unsupported MIME returns 415"],
    ["UI-004", "corrupt or spoofed image returns 422 invalid_image"],
    ["UI-005", "oversized dimensions are rejected"],
    ["UI-006", "icon conversion enforces 256px and 256KiB"],
    ["UI-007", "wallpaper conversion enforces 1920px and 2MiB"],
    ["UI-008", "storage failure does not mark image READY"],
    ["UI-009", "owner GET returns private cached WebP and ETag"],
    ["UI-010", "matching If-None-Match returns 304"],
    ["UI-011", "cross-user GET returns 404"],
    ["UI-012", "owner READY icon assignment succeeds"],
    ["UI-013", "wallpaper-kind icon assignment returns 400"],
    ["UI-014", "STAGING icon assignment returns 409"],
    ["UI-015", "cross-user icon assignment returns 404"],
    ["UI-016", "icon removal clears reference"],
    ["UI-017", "owner READY wallpaper assignment succeeds"],
    ["UI-018", "icon-kind wallpaper assignment returns 400"],
    ["UI-019", "STAGING wallpaper returns 409 and cross-user returns 404"],
    ["UI-020", "deleting active theme resets to builtin:system"],
    ["UI-021", "GC preserves referenced images"],
    ["UI-022", "GC preserves images inside grace period"],
    ["UI-023", "GC reclaims expired unreferenced images"],
    ["UI-024", "DB prevents cross-user image references"],
    ["UI-025", "DB prevents deleting referenced image"],
    ["UI-026", "DB cascades user deletion"],
    ["UI-027", "displayName is trimmed and NFC normalized"],
    ["UI-028", "account PATCH cannot change userId"],
    ["UI-029", "offline cached images do not modify Business Outbox"],
    ["UI-030", "offline cache miss uses fallback visuals"],
    ["UI-031", "Business sync and backup exclude UserImage"],
  ];

  for (const [id, title] of cases) {
    it.todo(`${id}: ${title}`);
  }
});
