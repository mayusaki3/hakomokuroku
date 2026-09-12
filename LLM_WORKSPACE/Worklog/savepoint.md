# 箱目録 作業 SavePoint

更新: 2026-09-12
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`

## 1. 作業目的
箱目録を完成させる。HLDocS v0.7.0は作業管理・仕様整理に利用するが、その未完成・不整合をブロッカーにしない。

作業順: 要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証。重要判断には根拠を残す。現在は設計段階で、アプリケーションコードはまだ変更しない。

詳細記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 2. 現在位置
**全体アーキテクチャ / データモデル / 同期設計の最終確定中。**

## 3. 主要確定事項

### リリース・業務
- v0.8 = Vision以外の完成版、v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真フィールド = `thumbs`
- QR payload = Box.codeのみ
- Item「取り出す」= `boxId=UNASSIGNED` の通常UPDATE、Item「削除」= DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- BoxLocationは独立フラットマスタ、Boxが`locationId`を参照
- Vision対象はBox/Item写真のみ

### ユーザー分離・同期
- business identity=`(User.id, entityId)`。User間データは論理的に完全分離
- API user scopeは認証session/tokenからserverが確定
- local DB=`hk-local-v2-<User.id>`
- server metadata=`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- baseRevision一致=通常更新。不一致時contentHash同一=UNCHANGED、異なる=CONFLICT
- SyncChangeLogがPull差分履歴の正本。syncSeqはDB全体で単調増加signed 64-bit
- local 3層=Business / SyncState / Outbox。local業務変更+Outboxは同一IndexedDB transaction
- 通常同期=Pull → Outbox reapply → Push → Pull。Push中再編集はoutboxVersionで保護
- tombstone物理削除可能=DELETE受理server時刻+30日、SyncChangeLog保持=90日。必要log欠落時はFULL_RESYNC_REQUIRED
- cursor未設定の新規DBはFull Resync。snapshotSeq固定、type別paging、staging完了後のみ採用
- Outbox reapply順=BoxLocation → Box → Item

### business timestamp
- `createdAt / updatedAt / deletedAt`はbusiness時刻、`serverUpdatedAt`はserver canonical更新時刻
- client business timestampは競合勝者・Pull順序・cursor・retentionに使わない
- RFC3339/ISO8601 offset必須、server保存UTC milliseconds
- 形式が有効なら極端な未来/過去でも補正しない

### contentHash canonicalization
**確定:** entity typeごとにhash対象business schemaを固定し、そのschemaへ正規化後、canonical JSONをSHA-256して`contentHash`を生成する。

- `contentHash`はbusiness上の意味的内容のみを対象にする
- `createdAt / updatedAt / deletedAt`のtimestamp値、`serverUpdatedAt / revision / syncSeq / contentHash`自身、`userId`、entity idはhash対象外
- active/deleted状態はbusiness意味を持つためhash対象
- client/server双方で同一のcanonicalization algorithmを使用する
- object key順はentity schemaで固定する。runtime objectの挿入順には依存しない
- 順序に意味がない配列・集合はfieldごとの正規化規則に従ってsortする。例: `tags`
- 順序に意味がある配列は並びを保持する。例: `photos`
- `undefined / field未指定 / null / 空文字 / 空配列`は一律変換せず、fieldごとのbusiness意味を仕様で定義し、意味的に同値な値だけを同一canonical値へ正規化する
- hash対象外fieldはcanonical JSONへ入れない
- canonical JSONの文字列表現は同一business値から常に同一bytesになるよう固定する
- SHA-256出力表現もclient/serverで固定する

#### business field canonical値
**確定:** 保存前およびhash生成前に、client/server双方で以下のfield normalizationを共通適用する。

- optional文字列（例: `note`）は前後空白をtrimする
- optional文字列がtrim後に空文字ならcanonical値は`null`とする
- optional文字列の未指定・`undefined`・空文字は、当該fieldで「値なし」が同義なら`null`へ統一する
- `tags`は各要素をtrimし、Unicode NFC正規化を行う
- trim後に空となるtagは除外する
- tagの重複は正規化後の完全一致で除去する。大文字小文字は別値として扱う
- `tags`はcode point順の決定的な順序へsortし、0件は`[]`とする
- 必須参照IDは常にstringとし、`null`・空文字・未指定を許可しない
- 未設定状態が必要な参照はreserved `UNASSIGNED`をcanonical値として使用する
- optional配列は未指定・`undefined`・`null`を`[]`へ統一する
- business上順序に意味のないoptional配列はfield仕様に従って決定的にsortする
- business上順序に意味がある配列（例: photos）は配列順を維持する
- client/serverとも保存前とcontentHash計算前に同じ正規化を行い、保存値とhash対象値の意味を一致させる

根拠: `null`・空文字・未指定など表現上の差だけで不要なconflictを発生させず、同じbusiness意味から常に同じcanonical JSONとcontentHashを得るため。tagsは集合として扱い、入力順やUnicode表現差を同期差にしない。一方、写真順序などbusiness意味を持つ順序は保持する。

#### 写真配列のcontentHash
写真配列は各要素の`photoId + photoHash`のみを、親entity内の配列順そのままでhash対象にする。thumbnail bytesは対象外。

```json
{
  "photos": [
    { "photoId": "A", "photoHash": "H1" },
    { "photoId": "B", "photoHash": "H2" }
  ]
}
```

- 写真追加・削除・差し替え・並べ替えはcontentHashが変化する
- 同じphotoHashでもphotoIdが異なれば別写真なのでcontentHashも異なる
- thumbnail再生成・修復だけではcontentHashは変えない

根拠: conflict判定を端末実装差・JSON生成順・表示用派生データ差に依存させず、business上の意味が同じなら同一hash、意味が異なれば異なるhashにするため。

### 写真モデル
- 写真のdedupは行わない。写真ごとに独立した`photoId`
- `photoId`=論理写真ID、`photoHash`=保存原画像bytesのSHA-256相当
- 同じ画像を複数entity・同一entityへ複数回登録可能。各写真は別photoId
- photoIdはclient生成UUID。User scope内一意
- same photoId + same photoHash = 再送としてUNCHANGED相当可
- same photoId + different photoHash = `REJECTED / PHOTO_ID_COLLISION / retryable=false`
- collision時clientは新UUIDへBusiness/cache/Outbox参照を同一transactionで付け替えて再Push
- Photoは独立sync entityにせず、Box / Item / BoxLocationのphotos配列要素
- Photo自身にrevision/contentHash/syncSeq/SyncChangeLogを持たせない
- 写真追加・削除・差し替え・並べ替えは親entityのbusiness UPDATE
- 写真差し替えは旧photoIdを変更せず、新photoIdを発行し旧削除＋新追加。原則同じ配列位置
- Box / Item / BoxLocationの写真枚数は0〜10枚

### 保存原画像
- client生成WebPを箱目録での保存原画像とする
- WebP、長辺1600px上限、quality 0.85、拡大なし、EXIF Orientation補正、最大5 MiB
- `photoHash`は変換後WebP bytesから算出
- serverはWebP decode、寸法、size、hash一致を検証し通常フローでは再変換しない
- 保存単位/cache key/GCはphotoId基準。hash一致でも別photoId間で共有・dedupしない

#### 保存原画像取得API
- 現在canonical親entityから参照中のphotoIdだけ取得可能
- 削除済み、差し替え済み、orphan、他User、不存在はいずれも`404 Not Found`相当
- User scopeは認証からserverが確定
- Outbox復旧用Blob upload/re-upload経路とは分離
- HTTP conditional requestを使用
- `photoHash`をstrong ETag相当として返す
- local cache+ETagありなら`If-None-Match`
- 一致=`304 Not Modified`、不一致/cacheなし=`200 OK + WebP + ETag`
- 同じETag文字列になってもcache key/認可/Blob保存単位はphotoId

### thumbnail
- 保存原画像WebPからclient生成。WebP、長辺400px上限、quality 0.8、拡大なし、最大256 KiB
- serverはvalidateのみ。通常フローで再生成しない
- thumbnail bytesはcontentHash対象外
- thumbnailはphotoIdに属し、別photoId間で共有・dedupしない
- Push時thumbnail欠落/破損/仕様違反はREJECTED。clientが同じphotoIdの保存原画像から再生成して再Push
- canonical保存後のthumbnail修復もbusiness変更にはしない
- thumbnail単独修復で親`updatedAt / revision / syncSeq / contentHash`は変更しない
- thumbnail修復理由のSyncChangeLog UPSERTは発行しない

#### thumbnail cache freshness / API
- 正常local thumbnailはそのまま使用。TTL・定期polling・専用background同期なし
- 欠落/破損時ONLINEなら即時再取得
- 明示refreshで再取得可能
- Full Resyncまたは親entity再取得時に最新canonical thumbnailへ更新
- thumbnail専用取得APIはcanonical参照中photoIdのみ許可
- 削除済み、差し替え済み、orphan、他User、不存在は`404`相当
- thumbnail bytesに対応する専用ETagを返し`If-None-Match`対応
- 同一なら304、変更済みなら200 + WebP + 新ETag
- thumbnail ETagはbusiness contentHashやoriginal ETagとは別

### 写真Blob upload / GC
- upload順=保存原画像生成 → photoHash算出 → thumbnail生成 → photoId単位Blob upload → server検証 → 親entity Push → canonical参照確定
- unreferencedSinceはBlob upload完了server時刻から開始。canonical参照成立でnull
- 参照解除時はserver受理時刻をunreferencedSinceへ設定
- 30日連続未参照でGC候補。削除直前にcanonical参照を再確認
- GCはphotoId単位
- 親Pushが参照するBlob欠落時=`REJECTED / PHOTO_BLOB_NOT_AVAILABLE / retryable=true`
- local原画像ありなら同photoId/photoHashで再uploadし同じOutboxを再Push
- Blob欠落だけでbaseRevision/outboxVersionを変更しない
- local原画像も失われている場合は自動削除せず利用者対応が必要なsync error

### local original cache
- 正本ではなく再取得可能なcache
- 削除/差し替え後に旧cacheが残ってもUI不可視、自動復元しない
- Storage Quotaに応じたbest-effort管理
- 削除優先: 未参照古い → 未参照新しい → 参照中古い → 参照中最近
- Business / thumbnail / Outbox / SyncStateはcache整理対象外

### BoxLocation / UNASSIGNED
- BoxLocationはuser scoped独立flat master。Box.locationIdが参照
- reserved Box/BoxLocation `UNASSIGNED`を各Userで保証しclient変更禁止
- Box削除時子Item→UNASSIGNED、Location削除時子Box→UNASSIGNED
- parent DELETE + child correctionはserver 1 transaction

### Outbox / Conflict
- `(entityType, entityId)`につき1 Outbox row
- original baseRevision維持、local変更ごとoutboxVersion++
- CREATE→DELETEでもOutboxを消さない
- SyncConflictは`(userId, entityType, entityId)`につき未解決1 row
- Pullはserver baseline + Outbox overlay。Pullだけでlocal unsynced内容を失わない

## 4. 現行実装との差異
- Prisma sync metadata/composite user identity不足、current Push ownership risk、Pull timestamp基準
- revision/contentHash/Outbox/SyncState/Conflict/Full Resync snapshot-staging未実装
- entity別contentHash canonical schemaとfield normalization未実装
- optional文字列/null、tags NFC/sort/dedup、optional配列[]、参照UNASSIGNEDのcanonical化未実装
- IndexedDB固定`hk-local-v1`、BoxLocationモデル不一致
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- photoId独立写真モデル、UUID/collision/re-ID未実装
- Photo親embedded sync、写真差し替え新photoId、写真順序business update未実装
- photoHash server bytes再検証未実装
- photoId単位Blob分離同期、blob-first、30日GC、PHOTO_BLOB_NOT_AVAILABLE retry未実装
- thumbnail 400px/256KiB、original 1600px/5MiB server validation未実装
- 写真最大10枚共通validation未実装
- original cache Quota管理未実装
- thumbnailを保存原画像から生成するpipeline未実装
- thumbnail repair/freshness/専用取得API/ETag conditional request未実装
- original取得APIのcanonical参照認可、photoHash ETag conditional request未実装

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

次の判断候補: **必須文字列field（Box.name / Item.name / BoxLocation.name / Box.code等）のUnicode・空白正規化をどこまで行うか確定する。**

推奨候補:
- 利用者入力の必須表示文字列はtrim + Unicode NFC正規化
- trim後空文字はvalidation errorとして拒否
- 内部空白は保持し、自動圧縮しない
- 大文字小文字は保持し、case-sensitiveなbusiness値として扱う
- `Box.code`のようなシステム識別子は表示文字列とは別にfield固有形式を定義し、一般文字列正規化をそのまま流用しない

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。