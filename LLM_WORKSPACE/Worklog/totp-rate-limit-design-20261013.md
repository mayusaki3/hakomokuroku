# TOTPログイン試行回数制限 設計案（2026-10-13）

対象: `mayusaki3/hakomokuroku` / `develop`。状態: 設計案。実装・テスト未着手。

## 1. 現状
- `User` に `totpFailCount Int @default(0)` と `lockUntil DateTime?` がある。
- `POST /api/auth/login/totp` は失敗時 `auth_failed` (400) を返すが、失敗回数を更新しない。
- `lockUntil > now` はログインAPI・TOTP APIとも401 `unauthorized` として扱う。
- 成功時は `totpFailCount=0` へ更新する。

## 2. 推奨する契約
- 試行制限の主キー: `User.id`。IPは本人特定・ロック判定の唯一の根拠としない。
- TOTPまたはRecovery Codeの検証失敗を同じカウンターへ計上する。入力形式不正（HTTP 400 invalid_request）、存在しない/期限切れchallengeは計上しない。
- 連続5回の認証失敗で15分間ロックする。ロック中はpasswordログイン・TOTPログインとも拒否する。
- ロック期間が経過した場合、次の試行を新しい連続失敗系列の開始とする。解除判定とカウンター初期化を競合に安全なDB更新で実施する。
- 正常なTOTP/Recovery Code認証成功時はカウンターを0へ戻す。
- 失敗計上・閾値到達時のロック設定はDBトランザクション/条件付き更新等により競合安全とする。並行試行で閾値を回避できないことをテストする。
- challengeは現行の5分期限・一回限りを維持する。誤コードによる失敗ではchallengeを消費しない。
- 失敗5回目を含むロック中応答はHTTP 429 `too_many_attempts` とする案。認証失敗詳細の過度な開示を避ける。
- 有効なchallengeが存在する場合に限りユーザー単位のロック状態を参照する。challengeの存在判定順序やレスポンスの情報漏えいはテストで検証する。
- 端末関連付けに失敗した場合は認証失敗回数に計上しない。challenge消費後の復旧UXは別設計項目。

## 3. 仕様ID案
- `sec_auth_login_totp_locked`: ロック判定・失敗計上・閾値・解除
- `sec_auth_login_totp_invalid_code`: コード不一致、未ロック時400 `auth_failed`
- `sec_auth_login_locked`: passwordログイン側の共通ロック判定
- 新規テストケース候補: `AUTH_LOGIN_TOTP-TC-06`（失敗計上）、`-TC-07`（5回でロック）、`-TC-08`（15分後解除）、`-TC-09`（Recovery Code）、`-TC-10`（並行失敗）、`-TC-11`（成功でリセット）、`-TC-12`（challenge不正は計上しない）。
- 既存 `AUTH_LOGIN_TOTP-IMPL-01` の期待値は実装前に上記契約に合わせて見直す。

## 4. 実装前に要確認
- `lockUntil` を他の認証・TOTP管理APIも使用していないか、横断確認する。
- `totpFailCount` のリセットを期限切れ解除時に行う際の原子性を検証する。
- 429応答に `Retry-After` を付けるか、クライアントUIがどう表示するかを確定する。
- パスワード推測への独立した制限、アカウントロック悪用への緩和策は別要件として追跡する。

## 5. ゲート
設計案→仕様の正式反映→テスト仕様作成→失敗するテストの確認→実装修正→全体回帰テスト。現時点では既存仕様書・実装・テストは変更しない。
