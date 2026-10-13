# MFAログイン試行制限 データモデル・migration設計（2026-10-13）

状態: 設計案（正式仕様化前）。対象 `mayusaki3/hakomokuroku` / `develop`。

## 1. 決定対象と現状
- `User.totpFailCount` はTOTP初期設定確認で使用中。ログインMFA用に流用しない。
- `User.lockUntil` はパスワードログイン、TOTPログイン、TOTP無効化で参照されている。現時点では用途変更しない。
- MFAログイン失敗回数はユーザー単位で永続化し、5回連続失敗で15分ロックする。
- 既存の `LoginChallenge` は5分期限・一回限りの性質を維持する。

## 2. 推奨モデル: 専用1:1テーブル
```prisma
model MfaLoginAttempt {
  userId      String   @id
  failCount   Int      @default(0)
  lockedUntil DateTime?
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```
`User` 側へ `mfaLoginAttempt MfaLoginAttempt?` を追加。行が存在しない場合は0回・ロックなしと解釈する。

採用理由: 既存 `totpFailCount` と `lockUntil` の意味を変更せず、追加migrationのみで導入できる。ユーザー削除時にカスケード削除でき、Business Sync/Backupの対象外に分離できる。

## 3. 状態遷移と競合制御
- `failCount` は連続失敗回数。初回失敗で行作成、2～4回目で加算、5回目で `lockedUntil=now+15分` を同じトランザクションで設定する。
- ロック中は新しいTOTP/Recovery Codeを検証せず拒否する。パスワードログインでも同じロックを参照して拒否する。
- `lockedUntil <= now` の後の最初の失敗は1回目として数える。成功時は `failCount=0,lockedUntil=null`。
- 更新はトランザクション内で行い、同時失敗・同時成功・複数challengeからのアクセスで取りこぼさない。単純なread→writeは不可。
- 正常なTOTP/Recovery Codeの検証・challenge消費・session発行・カウンターリセットは整合性のあるトランザクション境界とする。
- ロック状態の確認だけではchallengeを消費しない。形式不正、challenge不正、DB障害、端末関連付け失敗は失敗回数に計上しない。
- 429応答候補は `{ok:false,error:"too_many_attempts"}`。認証の存在推測を避けるため、チャレンジ検証順と情報公開はテストで確定する。

## 4. 既存lockUntilとの関係
- 既存 `User.lockUntil` は従来の認証拒否条件として残す。
- 新しい `MfaLoginAttempt.lockedUntil` はMFAログイン専用。パスワードログインとTOTPログインでは**両方**のロック条件を判定する。
- TOTP初期設定確認とTOTP無効化には、新MFAログインロックを自動適用しない（既存 `User.lockUntil` の挙動は維持）。
- 新ロックが解除されても `User.lockUntil` は変更しない。

## 5. migrationの安全方針
1. 現在のmigration履歴とDB適用状態を確認する。特に未適用の `20261011232000_add_device_credential_hash` を先に評価する。
2. 新migrationはテーブル追加、主キー、User外部キーのみ。既存列の削除・名称変更・データ書換えは行わない。
3. 新テーブルは既存ユーザーについて行未作成でも動作する設計とする。既存User行のバックフィル不要。
4. SQLiteの実DBバックアップ、外部キー検査、migration status確認を行う。既存DBへ `migrate dev`、`db push`、`migrate reset` を実行しない。
5. 実DBへの `migrate deploy` はバックアップ・対象パス・未適用migrationを確認した後、別工程で実施する。

## 6. HLDocS反映対象
- `docs/ja-JP/02_アーキテクチャ/92_Session設計.md` へMFAログインロックの参照を追加。
- `docs/ja-JP/04_API仕様/01_ユーザー認証API/api_auth_login.md` と `api_auth_login_totp.md` へロック判定・エラー契約を追加。
- `docs/ja-JP/05_テストケース集/01_ユーザー認証API/api_auth_login_totp_testcases.md` に失敗5回、15分後、並行リクエスト、成功時リセット、Recovery Code、無効challengeを追加。
- TOTP初期設定・無効化の仕様書には、新MFAロックと独立していることを明記。

## 7. 未確定
- 429のレスポンス名・`Retry-After` ヘッダー有無。
- ロックの悪用（第三者による意図的なアカウントロック）への追加緩和策。
- SQLiteでの競合制御の実装詳細と検証方法。
- v0.8設計完了チェックリストの承認ゲート。

実装・DB変更・テスト実行はこの記録では行わない。
