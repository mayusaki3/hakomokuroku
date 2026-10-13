# 認証セッション仕様整合性の調査記録（2026-10-13）

対象: `mayusaki3/hakomokuroku` / `develop`。状態: 調査・修正方針整理。実装およびテスト実行は未実施。

## 基準と判断
- `docs/ja-JP/02_アーキテクチャ/92_Session設計.md` をセッション方式の基準とする。
- `hk_session`、DBの`AuthSession`、SHA-256 tokenHash、固定30日、現在sessionのみログアウト時失効を維持する。
- MFA完了前はsession/device Cookieを発行せず、完了後に`hk_session`と`hk_device`を発行する。
- 旧TOTP仕様の試行回数制限は削除せず、設計・テストを先行して整備する方針（利用者承認済み）。実装方法・閾値・永続化・解除条件は未確定。

## 確認した不整合
1. `04_API仕様/55_セッション仕様.md`: Cookie名`hakomokuroku_session`、7日rolling、仮想Sessionモデルが旧仕様。
2. `04_API仕様/01_ユーザー認証API/api_auth_login.md`: `sid`、`sid=dummy`、MFA・deviceの契約未記載。
3. `04_API仕様/01_ユーザー認証API/api_auth_login_totp.md`: `hk_token`、`issueSyncToken`、`X-Token-Expires-At`は旧仕様。code/recoveryCode必須条件、ロック・試行制限、エラーコード、失敗回数加算も現実装と不一致。
4. `04_API仕様/01_ユーザー認証API/api_auth_logout.md`: `sid`と常時200が現実装（内部例外は500）と不一致。端末Cookie維持を明文化する。
5. `04_API仕様/01_ユーザー認証API/api_auth_me.md`: user例の`userName`/`iconDataUrl`が現行`readSession()`の`id`/`userId`と不一致。
6. `05_テストケース集/01_ユーザー認証API/`のlogin/totp/logout/meテスト仕様、および`apps/web/tests/api.auth.login.spec.ts`などに旧期待値・旧モックが残る。

## 推奨する修正順序
1. API間の共通セッション契約を仕様化し、既存`sec_id`/`testcase_id`を可能な限り維持する。
2. TOTP試行制限の設計を確定する（IP/user識別、保存先、閾値、時間窓、ロック解除、レスポンス）。
3. 認証API仕様とテスト仕様のトレーサビリティを修正する。
4. 旧Vitestのモック・Cookie期待値を更新し、新規ケースを追加する。
5. テスト結果を確認した後、必要な実装修正を行う。

## 注意・未検証
- GitHub上の静的照合のみ。ローカルDB migration適用状態およびテスト実行結果は未確認。
- `93_AuthSession移行手順.md`はmigration導入時点の記述が残り、現行の複数migrationを踏まえて別途見直す。
- TOTP成功後の端末関連付け失敗ではchallengeが消費済みになる。再試行UXとエラー方針を仕様化する。
