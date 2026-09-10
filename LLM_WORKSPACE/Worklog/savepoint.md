# 箱目録 作業 SavePoint

更新: 2026-09-10
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
- ユーザー間データは論理的に完全分離。business identity=`(User.id, entityId)`
- API user scopeは認証session/tokenからserverが確定。異なるUser間でentity/photoHash/PhotoBlob/sync状態を共有しない
- local DB=`hk-local-v2-<User.id>`
- server metadata=`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- 未同期新規=revision 0/baseRevision 0。baseRevision一致=通常更新。不一致時contentHash同一=UNCHANGED、異なる=CONFLICT
- SyncChangeLogがPull差分履歴の正本。syncSeqはDB全体で一意な単調増加signed 64-bit
- local 3層=Business/SyncState/Outbox。local業務変更+Outboxは同一IndexedDB transaction
- 通常同期=Pull → Outbox reapply → Push → Pull。Push中再編集はoutboxVersionで保護
- tombstone物理削除可能=DELETE受理server時刻+30日、SyncChangeLog保持=90日。必要log欠落/完全性保証不能ならFULL_RESYNC_REQUIRED

### business timestamp / contentHash
- createdAt/updatedAt/deletedAtはbusiness時刻、serverUpdatedAtはserver canonical更新時刻
- client business timestampは競合勝者・Pull順序・cursor・retentionに使わない
- RFC3339/ISO8601 offset必須、server保存UTC milliseconds。形式が有効なら極端な未来/過去でも補正しない
- contentHashはbusiness上の意味的内容だけ。timestamp値/server metadata/userId/entity idは対象外、active/deleted状態は対象
- deterministic JSON + SHA-256相当

### 写真hash / PhotoBlob
- 保存原画像bytesから`photoHash`をSHA-256相当で算出。高度な画像正規化はしない
- entity contentHashには順序付きphotoHash列を含め、写真順序はbusiness上有意
- `photoId`は持たず`photoHash`自体を識別子とする。PhotoBlob論理キー=`(User.id, photoHash)`
- 同一User内のみblob再利用可能。異なるUser間では共有しない
- serverはuploadされた保存原画像bytesからhashを再計算しclient申告値との一致を必須とする
- 未参照PhotoBlobはserver管理時刻で30日後にGC可能。削除直前にcanonical実参照ゼロを再確認する

### 保存原画像
- client生成WebPを「箱目録における保存原画像」とする
- WebP、長辺1600px上限、quality 0.85、拡大なし、EXIF Orientation補正、最大5 MiB
- `photoHash`はこの変換後WebP bytesから算出
- serverはWebP decode、正寸法、1600px上限、5 MiB上限、hash一致を検証し、通常フローでは再変換しない

根拠: 既存`downscaleToWebp()`を仕様化し、容量を抑えつつphotoHash/server保存/local cacheの対象bytesを一致させる。

### thumbnail
- client生成を正本としserverは再生成しない
- WebP、長辺400px上限、quality 0.8、拡大なし、EXIF Orientation補正、最大256 KiB
- thumbnail bytesはcontentHash対象外
- serverはWebP decode、正寸法、400px上限、256 KiB上限を検証
- Pull/Full Resyncではcanonical thumbnailを配信

根拠: offline-firstで登録直後から必要で、既存`makeThumbWebp()`の挙動をそのまま仕様化できるため。

### 写真同期・cache
- entity JSON=`photoHash + thumbnail + 写真順序`。原画像blobは別転送
- Outboxで原画像blobを重複保持しない
- upload順=保存原画像生成 → photoHash算出 → blob upload → server検証 → entity Push → canonical参照確定
- Pull/Full Resyncでは原画像を取得せず、必要時オンデマンド取得してuser別local DBへcache
- cache未取得/原画像取得失敗はentity同期失敗ではない。offline時はcache済み原画像、未取得ならthumbnail表示

#### local original cacheの意味
- local original cacheは正本ではなく再取得可能な内部cache
- Business/canonicalのphotoHash参照が利用者から見える写真状態の正本
- 写真削除・差し替え後も旧cache bytesは即時削除不要だがUIから不可視
- cacheの存在だけで写真を自動復元しない
- canonicalで同じphotoHashが再び必要な場合だけcacheを再利用可能
- CONFLICTで写真が戻る場合は、利用者がSERVER側canonicalを選択した結果であり、cache自動復元ではない

#### local original cache容量管理
**確定:** 固定容量ではなく、ブラウザ/PWAのStorage Quotaに応じたbest-effort管理とする。

- `navigator.storage.estimate()` 等で利用可能容量・使用量を取得できる場合は、その情報を容量管理に利用する
- original cacheだけを容量調整対象とし、Business / thumbnail / Outbox / SyncStateはcache整理のために削除しない
- 容量逼迫時は以下の優先順でoriginal cacheを削除可能
  1. 未参照かつ最終利用が古いcache
  2. 未参照かつ比較的新しいcache
  3. canonical参照中だが最終利用が古いcache
  4. canonical参照中かつ最近利用したcache
- canonical参照中cacheも再取得可能なため、必要なら削除してよい。ただし未参照cacheを先に削除する
- original cache削除でBusiness/canonical/thumbnail/同期状態は変更しない
- 削除済みoriginalが必要になった場合、ONLINEなら再取得し、OFFLINEならthumbnailを表示して原画像未取得状態を示す
- 固定MiB上限・固定保持日数は設けない
- Storage Quota APIが利用できない環境でも、original cacheを機能必須状態にせずbest-effortで運用する

根拠: ブラウザ/PWAの実際の保存可能量は端末・OS・ブラウザで異なるため固定容量は過大/過小になりやすい。originalはserverから再取得可能なので、正本データを保護したまま端末容量に適応するcacheとして扱う方が安全で単純。

### 写真枚数上限
- Box / Item / BoxLocation とも0〜10枚
- client UIは11枚目を追加させず、serverも10件超をREJECTED
- 写真順序はbusiness上有意。先頭写真を代表画像として利用可能
- local/online/offline/backup/restore/Push/Pull/Full Resyncで共通

### Outbox / Conflict / DELETE / UNASSIGNED
- `(entityType, entityId)`につき1 Outbox row。original baseRevision維持、local変更ごとoutboxVersion++。CREATE→DELETEでも消さない
- Box DELETE→child Item.boxId=UNASSIGNED、BoxLocation DELETE→child Box.locationId=UNASSIGNED。parent DELETE+child補正はserver 1 transaction
- reserved Box/BoxLocation `UNASSIGNED`を各Userで保証しclient変更禁止
- SyncConflictは`(userId, entityType, entityId)`につき未解決1 row

### Pull / Full Resync
- Pull=`changes[] / nextCursor / hasMore`、syncSeq順。page local適用成功後のみcursor更新
- cursor未設定の新規DBは必ずFull Resync。current active canonicalのみ、snapshotSeq=N固定、type別paging
- staging完了後のみlocal canonicalへ採用。既存canonicalありならFull Resync中もlocal編集可
- adoptionは1 IndexedDB transaction、Outbox reapply順=BoxLocation→Box→Item

## 4. 現行実装との差異
- Prisma sync metadata/composite user identity不足、current Push ownership risk、Pull timestamp基準
- revision/contentHash/Outbox/SyncState/Conflict/Full Resync snapshot-staging未実装
- IndexedDB固定`hk-local-v1`、BoxLocationモデル不一致
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- photoHash、blob分離同期、オンデマンドcache、blob先行upload、user-scoped dedup、server hash再検証、canonical参照ベース30日GC未実装
- thumbnail 400px/256 KiB server検証、保存原画像1600px/5 MiB server検証未実装
- Box/Item/BoxLocation写真最大10枚の共通validation未実装
- local original cacheのQuota連動best-effort管理と優先削除未実装

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
同期・写真設計の残る主要未定義を最終点検する。

次の判断候補: **写真追加時、thumbnail生成は撮影元画像から直接行うか、保存原画像WebPから行うかを正式に統一する。**

既存実装では`downscaleToWebp()`と`makeThumbWebp()`がそれぞれ入力FileからEXIF補正して生成するため、同じ撮影元から別々に生成される。photoHashは保存原画像bytesを基準とするため、thumbnailが保存原画像由来である必要があるかを次に判断する。

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。