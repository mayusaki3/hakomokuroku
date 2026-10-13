# TOTP試行制限の横断確認と設計変更（2026-10-13）

状態: 設計修正。実装・正式仕様書・テスト未変更。

## 確認したコード
- `apps/web/src/app/api/auth/login/route.ts`: `lockUntil` を認証拒否条件に使用。失敗回数は更新しない。
- `apps/web/src/app/api/auth/login/totp/route.ts`: `lockUntil` を認証拒否条件に使用。成功時 `totpFailCount=0`、失敗時は加算しない。
- `apps/web/src/app/api/auth/totp/verify/route.ts`: TOTP初期設定の確認に失敗すると `totpFailCount` を読み出して+1で更新、成功すると0に戻す。原子的incrementではない。
- `apps/web/src/app/api/auth/totp/disable/route.ts`: `lockUntil` が未来なら429 `too_many_requests`。失敗時のカウント更新なし、成功時は `totpFailCount=0`。
- `apps/web/prisma/schema.prisma`: Userに `totpFailCount` と `lockUntil` が存在する。

## 重要な競合
`totpFailCount` は既に初期設定確認で利用されているため、ログイン用に共用すると設定操作によるカウンターリセットや相互干渉が起きる。前回Worklogの「既存フィールドをそのまま流用する」提案を撤回する。

## 改訂推奨案
1. ログインMFA用の失敗回数・ロック期限は専用の永続化状態として分離する（新規モデルまたはUser専用列。命名・migrationは正式設計時に決定）。
2. 5回連続失敗、15分ロック、DBで競合安全な加算・期限解除という基本方針を維持する。
3. ロック対象を明確化する: MFA失敗によるロックはパスワードログインとTOTPログインを拒否。初期設定・無効化APIへ波及させるかは別判断とする。
4. 既存 `lockUntil` は用途が複数にまたがるため、直ちに意味を変更・削除しない。既存APIとの互換性・移行を設計する。
5. `totpFailCount` の初期設定確認での更新は現在read-modify-writeであり、並行リクエスト対策の別課題として記録する。
6. 429のerror名称がログインTOTP旧仕様 `too_many_attempts`、無効化実装 `too_many_requests` で異なる。共通化するかはAPI契約ごとに決定する。

## 次のゲート
関連仕様とテストの横断参照を完了し、専用モデル・移行手順・ロック解除・HTTP契約を正式決定してからテスト仕様と実装へ進む。既存DBへ破壊的なmigrationを実行しない。
