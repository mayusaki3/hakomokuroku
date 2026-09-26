# 箱目録 作業 SavePoint

更新: 2026-09-26
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`

## 1. 作業目的
箱目録を完成させる。HLDocS v0.7.0は作業管理・仕様整理に利用するが、その未完成・不整合をブロッカーにしない。

作業順: 要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証。重要判断には根拠を残す。現在は設計段階で、アプリケーションコードはまだ変更しない。

詳細記録:
- `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`
- `LLM_WORKSPACE/Worklog/box-code-investigation.md`
- `LLM_WORKSPACE/Worklog/restore-merge-decision.md`
- `LLM_WORKSPACE/Worklog/restore-session-design.md`

## 2. 現在位置
**全体アーキテクチャ / データモデル / 同期 / backup・restore設計の最終確定中。**

backup/restore詳細設計は `LLM_WORKSPACE/Worklog/restore-session-design.md` section 82まで確定済み。次はsection 83から再開する。

## 3. 主要確定事項

### リリース・業務
- v0.8 = Vision以外の完成版、v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真field = `thumbs`
- QR payload = canonical `Box.code`文字列そのもの
- Item「取り出す」= `boxId=UNASSIGNED`の通常UPDATE、Item「削除」= DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- BoxLocationはUser scoped独立flat master、Boxが`locationId`参照
- Vision対象はBox/Item写真のみ

### ユーザー分離・同期
- business identity=`(User.id, entityId)`。User間データは完全分離
- API scopeは認証session/tokenからserverが確定
- local DB=`hk-local-v2-<User.id>`
- server metadata=`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- baseRevision一致=通常更新。不一致時contentHash同一=UNCHANGED、異なる=CONFLICT
- SyncChangeLogがPull差分履歴の正本。syncSeqはDB全体で単調増加signed 64-bit
- local 3層=Business / SyncState / Outbox。local業務変更+Outboxは同一IndexedDB transaction
- 通常同期=Pull → Outbox reapply → Push → Pull
- tombstone物理削除可能=DELETE受理server時刻+30日、SyncChangeLog保持=90日
- cursor未設定の新規DBはFull Resync。snapshotSeq固定、type別paging、staging完了後のみ採用
- Outbox reapply順=BoxLocation → Box → Item

### timestamp / canonicalization
- `createdAt / updatedAt / deletedAt`はbusiness時刻、`serverUpdatedAt`はserver canonical更新時刻
- client business timestampは競合勝者・Pull順序・cursor・retentionに使わない
- RFC3339/ISO8601 offset必須、server保存UTC milliseconds
- contentHashはentity type固定business schemaをcanonical化後SHA-256
- metadata時刻、revision、syncSeq、contentHash自身、userId、entity idはhash対象外
- active/deleted状態はhash対象
- optional文字列はtrim、意味上値なしならnull
- tagsはtrim + NFC、空除去、exact重複除去、case-sensitive、決定的sort
- optional配列は意味上空なら`[]`
- 必須参照IDはnull/空/未指定不可。未設定参照はreserved `UNASSIGNED`
- 必須表示文字列はtrim + NFC、trim後空はvalidation error、内部空白/case保持

### Box.code / device namespace
- canonical形式=`BX-<DevicePrefix 4文字><LocalSequence 4文字>`
- alphabet=`ABCDEFGHJKMNPQRSTUVWXYZ23456789`
- legacy互換なし、Box.code immutable、QRはcode文字列そのもの
- DevicePrefixはserverがUser scope uniqueで割当、LocalSequenceはdevice-local整数counter `0..923520`
- Box + Outbox + counter incrementは同一local transaction
- commit済みcodeは再利用しない
- sequence枯渇時は同じdeviceIdへ新prefixを追加割当
- device registrationとprefix allocationは1:Nで分離、過去prefixは永久予約
- 追加割当request=`deviceId + expectedActivePrefix`。一致時だけ切替、不一致なら現在active prefixを返して二重割当防止
- prefix生成はsecure random + `(User.id,prefix)` unique制約、異常collision時だけ決定的fallback走査
- 使用済みprefixが923,521件なら`DEVICE_PREFIX_EXHAUSTED`
- `deviceId / activePrefix / LocalSequence counter`は通常backup対象外
- restore時にBox.codeを自動再採番しない
- 同じBox.idでcode違い、別Box.idでcode重複、canonical format違反はrestore拒否

詳細は`box-code-investigation.md`および過去SavePoint参照。

### 写真モデル
- dedupなし。写真ごとに独立`photoId`
- photoId=論理写真ID、photoHash=保存原画像bytesのSHA-256相当
- Photoは独立sync entityではなく親Box/Item/BoxLocationのphotos配列要素
- 写真差し替えは新photoId、順序はbusiness意味あり、各親0〜10枚
- 保存原画像=client生成WebP、長辺1600px、q0.85、拡大なし、EXIF補正、最大5MiB
- thumbnail=保存原画像からWebP、長辺400px、q0.8、最大256KiB
- original BlobはphotoId単位、blob-first upload、未参照30日でGC候補
- thumbnail bytesは親contentHash対象外

### BoxLocation / UNASSIGNED
- BoxLocationはUser scoped独立flat master
- reserved Box/BoxLocation `UNASSIGNED`を各Userで保証しclient変更禁止
- Box削除時子Item→UNASSIGNED、Location削除時子Box→UNASSIGNED
- parent DELETE + child correctionはserver 1 transaction

### backup/restore・中断再開
詳細正本: `LLM_WORKSPACE/Worklog/restore-session-design.md`

同ファイルsection 1〜82を確定済みとして扱う。特に直近では以下を確定した。
- 正式backup schemaは `schema="hakomokuroku-backup", version=1`。開発中の旧実装値は互換対象外
- self-contained `.hkmbackup` ZIP、manifest/checksums/original/thumbnailを保持
- RestoreSessionはPREPARING/RESOLVING/APPLYING/COMPLETED/CANCELLED/ERRORで永続・再開可能
- APPLYINGのBusiness/Outbox/appliedAtはatomic commitし、crash後はappliedAtで再apply可否を判定
- photo original/thumbnailのcanonical WebP規則、size/dimension/chunk/metadata/animation制約を確定
- normal photo ingestionのoriginal/thumbnail fallback ladderを確定
- PhotoUploadState=PENDING/UPLOADING/CONFIRMEDを確定
- missing originalはthumbnail由来low-resolution replacementをnew photoId/hashで生成可能。v1.0+ AI recoveryもnew identity
- 真正original再発見時は利用者確認後にreplacementと置換のみ。keep-bothは行わない
- recovery provenanceはactive replacement lifetimeに合わせたlocal-only metadata
- `1 photoId = exactly 1 Business parent`。parent間direct photo moveはv0.8対象外
- photo削除後10秒Undo。各delete独立entry、LIFO、通常Business updateとしてdelete/Undoを扱う
- Undo grace中もsyncを停止しない。parent削除時は該当Undo entryをinvalidate
- Restore APPLYING lock待ちでは期限内に受理したUndo intentを保護し、lock取得後current stateを再検証
- RESOLVING中のphoto editはRestore conflictを直接更新せずcontentHash stale detectionへ委ねる
- Restore APPLYINGはUndo用ephemeral binaryへ依存しない
- Restoreで必要なUSE_BACKUP/new entity binaryはstagingからcanonical storageへpre-promoteしてからBusiness atomic commit
- pre-promoted binaryはlocal-only `RestorePromotedPhoto` でordinary GCからtemporary protection
- active/retryable RestoreSessionのstaging/protected binaryはstorage pressureでもautomatic evictionしない。通常cache cleanup後も不足なら利用者へresume/cancel判断を求める

詳細・根拠・edge caseは必ず上記Worklog本文を参照する。

## 4. 現行実装との差異
- Prisma sync metadata/composite user identity不足、current Push ownership risk、Pull timestamp基準
- revision/contentHash/Outbox/SyncState/Conflict/Full Resync snapshot-staging未実装
- canonicalization/field normalization未実装
- IndexedDB固定`hk-local-v1`、BoxLocationモデル不一致
- Box.code生成が`id.ts`/`codegen.ts`の2系統。どちらも確定方式へ置換対象
- Device registration / 1:N DevicePrefix allocation / active-retired / expectedActivePrefix API未実装
- secure-random allocation / deterministic fallback / LocalSequence atomic transaction未実装
- device stateを通常backupから除外する仕様未実装
- restore時Box.code immutable/unique検証未実装
- RestoreSession / staging / resolution永続化 / stale再検証未実装
- `qrpayload.ts`の`/b/<code>`生成は確定仕様と矛盾
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- photoId独立モデル、Blob分離同期、server検証、thumbnail/original API・cache管理未実装

## 5. ロードマップ
0. 現状棚卸し — 完了
1. v0.8/v1.0要件仕様 — 主要方針確定
2. 全体アーキテクチャ確定 — **現在（最終点検）**
3. データモデル・同期仕様確定
4. 箱・アイテム・写真・置き場所仕様完成
5. QR・検索仕様完成
6. バックアップ・PWA・印刷仕様完成
7. 各機能テストケース完成
8. 不足テスト実装
9. 既存実装修正
10. v0.8完成・受入
11. Vision/LLM詳細要件・設計・テスト
12. Vision/LLM実装完成
13. v1.0完成・受入

## 6. 次のアクション
次の判断点: **section 83 — 長期間放置されたactive RestoreSessionを起動時にどのように提示するか。**

推奨案:
- app起動時にactive RestoreSessionを検出したらpersistent but non-blocking bannerを表示
- PREPARING / RESOLVING / retryable ERRORでは通常利用を許可し、`再開`とcancel可能なら`キャンセル`を提示
- storage使用量を取得可能なら併記
- APPLYINGではcancel不可。recovery/convergenceを自動開始し進行状態を表示
- active session中は新規restore開始のみ禁止
- bannerを閉じてもsessionはcancelしない
- ageに応じたwarning強調は可。ただしageだけでautomatic cancel/deleteしない

根拠: resumabilityと通常利用を両立しつつ、大容量stagingが利用者から見えないまま残り続けることを防ぐ。single-active-session ruleも維持できる。

**新しいチャットでは、まずdevelopの最新 `restore-session-design.md` と本SavePointを取得してcanonical stateを確認し、section 83の判断から再開する。アプリケーションコードはまだ変更しない。**

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
