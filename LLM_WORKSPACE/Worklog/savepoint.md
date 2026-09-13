# 箱目録 作業 SavePoint

更新: 2026-09-13
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`

## 1. 作業目的
箱目録を完成させる。HLDocS v0.7.0は作業管理・仕様整理に利用するが、その未完成・不整合をブロッカーにしない。

作業順: 要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証。重要判断には根拠を残す。現在は設計段階で、アプリケーションコードはまだ変更しない。

詳細記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`
補足調査: `LLM_WORKSPACE/Worklog/box-code-investigation.md`

## 2. 現在位置
**全体アーキテクチャ / データモデル / 同期設計の最終確定中。**

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
- `Box.name / Item.name / BoxLocation.name`等の必須表示文字列はtrim + NFC、trim後空はvalidation error、内部空白/case保持

### Box.code
**確定:** legacy互換なし。全データで単一形式のみ有効。

```text
BX-<DevicePrefix 4文字><LocalSequence 4文字>
```

使用alphabet:
```text
ABCDEFGHJKMNPQRSTUVWXYZ23456789
```

- `O / I / L / 0 / 1`は使用しない
- suffix 8文字 = DevicePrefix 4文字 + LocalSequence 4文字
- canonicalはASCII uppercase。scanner/input小文字はuppercase化後に検証
- `Box.code`は作成時点で正式確定し、仮発行を行わない
- QRは作成直後から正式ラベルとして印刷可能
- sync collisionを理由とするBox.code再発行は行わない
- canonical Box.codeはimmutable
- legacy形式はbackup/restore/scan/search/Push/Pull/Full Resyncを含め受理しない
- 開発中の旧形式データは破棄または再作成し、migrationは作らない

#### DevicePrefix / LocalSequence
- DevicePrefixはserverがUser scope内で一意に割り当てる4文字
- LocalSequenceはdevice内の4文字単調増加counter
- 1 deviceあたり最大`31^4 = 923,521` code space
- Box作成とcounter incrementは同一local transactionで行う
- sequenceは巻き戻さず、一度使用した値を再利用しない
- sequence枯渇時はonlineで新DevicePrefixを取得し、既存Box.codeは変更しない
- DB上の`(User.id, Box.code)` unique制約は不変条件検査として保持する

#### Device登録record
**確定:** serverにUser配下のdevice registrationを持つ。

```text
deviceId     : client生成UUID
devicePrefix : server割当4文字
createdAt
lastSeenAt
```

- `deviceId`はclientが初回セットアップ時にUUID生成し、localへ永続保存する
- serverは`(User.id, deviceId)`を一意として扱う
- 同じUser + 同じdeviceIdの再登録/再ログインには同じDevicePrefixを返す
- DevicePrefixはUser scope内で一意
- 一度払い出したDevicePrefixは、そのdeviceが使われなくなっても**永久に再利用しない**
- local dataを消去して端末を再セットアップした場合は、新deviceIdを生成し、新しいDevicePrefixをserverから取得する
- 旧deviceId/DevicePrefix/counterを推測・復元して再利用しない
- device registrationにはbusiness syncのrevision/contentHash/syncSeqを持たせず、Box/Item等とは別のsystem registration dataとして扱う
- `lastSeenAt`はserver管理時刻で、認証済み端末がdevice registration APIまたはsyncを正常利用した際に更新可能

根拠: serverがDevicePrefix namespaceを一意に割り当て、各deviceがそのnamespace内で単調counterを採番すれば、offline作成時点でBox.codeを正式確定できる。過去prefixを再利用しないことで、Box削除や端末再セットアップ後も過去codeとの衝突を構造的に防止できる。

### 写真モデル
- dedupなし。写真ごとに独立`photoId`
- photoId=論理写真ID、photoHash=保存原画像bytesのSHA-256相当
- Photoは独立sync entityではなく親Box/Item/BoxLocationのphotos配列要素
- 写真差し替えは新photoId、順序はbusiness意味あり
- 各親0〜10枚
- 保存原画像=client生成WebP、長辺1600px、q0.85、拡大なし、EXIF補正、最大5MiB
- thumbnail=保存原画像からWebP、長辺400px、q0.8、最大256KiB
- original BlobはphotoId単位、blob-first upload、未参照30日でGC候補
- thumbnail bytesは親contentHash対象外

### BoxLocation / UNASSIGNED
- BoxLocationはUser scoped独立flat master
- reserved Box/BoxLocation `UNASSIGNED`を各Userで保証しclient変更禁止
- Box削除時子Item→UNASSIGNED、Location削除時子Box→UNASSIGNED
- parent DELETE + child correctionはserver 1 transaction

## 4. 現行実装との差異
- Prisma sync metadata/composite user identity不足、current Push ownership risk、Pull timestamp基準
- revision/contentHash/Outbox/SyncState/Conflict/Full Resync snapshot-staging未実装
- canonicalization/field normalization未実装
- IndexedDB固定`hk-local-v1`、BoxLocationモデル不一致
- Box.code生成が`id.ts`/`codegen.ts`の2系統。どちらも確定方式へ置換対象
- Device registration / DevicePrefix割当 / local monotonic sequence未実装
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
同期・データモデル設計の残る主要未定義を最終点検する。

次の判断候補: **DevicePrefix払い出しAPIの競合・枯渇時挙動を確定する。**

推奨候補:
- registration requestは`deviceId`のみ（Userは認証から確定）
- 同じdeviceIdならidempotentに既存prefixを返す
- 新deviceIdならserver transaction内で未使用prefixを選び、User scope unique制約で確定
- allocation collisionはserver内部で別prefixを再試行し、clientへは露出させない
- 4文字namespaceが本当に枯渇した場合のみ`DEVICE_PREFIX_EXHAUSTED`として明示的に失敗し、Box新規作成を停止する

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
