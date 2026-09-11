# 箱目録 作業 SavePoint

更新: 2026-09-11
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
- API user scopeは認証session/tokenからserverが確定。異なるUser間でentity/photo/sync状態を共有しない
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
- 写真配列は各要素の`photoId + photoHash`のみを、親entity内の配列順そのままでcontentHash対象にする
- thumbnail bytesおよびthumbnailそのものの再生成差はcontentHash対象外とする
- 写真の追加・削除・差し替え・並べ替えは、`photoId`または配列順が変化するためcontentHashが変化する
- 同一画像で`photoHash`が同じでも`photoId`が異なれば別写真としてhash結果も異なる

写真部分のcanonical概念:
```json
{
  "photos": [
    { "photoId": "A", "photoHash": "H1" },
    { "photoId": "B", "photoHash": "H2" }
  ]
}
```

根拠: 写真の論理同一性は`photoId`、画像内容の整合性は`photoHash`、写真順序もbusiness dataとして確定済みである。一方thumbnailは表示用派生データであり、再生成やencoder差をbusiness conflictにしないためhash対象から除外する。

### 写真モデル / photoId / photoHash
**確定:** 写真の重複排除は行わず、写真ごとに独立した`photoId`を持つ。`photoHash`は写真の論理IDではなく、保存原画像bytesの整合性確認・内容識別に使用する。

- 同じ画像ファイルを複数のBox / Item / BoxLocationへ登録しても、それぞれ独立した写真として扱う
- 同じentityに同じ画像ファイルを複数回登録することも禁止しない。利用者が登録した回数・順序をそのままbusiness dataとして扱う
- `photoId`が写真の論理識別子。business identityはuser scope内の`photoId`
- `photoHash`は保存原画像bytesからSHA-256相当で算出し、server受信時のbytes検証・破損検出等に利用する
- 同一`photoHash`であっても、異なる`photoId`の保存原画像を共通化・再利用・dedupしない
- `photoHash`一致を理由に別entity間・同一entity内で写真参照を統合しない
- 写真順序は`photoId`の順序としてbusiness上有意。entity contentHashには順序付き写真情報を含める
- 写真を別entityへ「共有」する概念は設けない。各写真は登録先entityに属する記録として扱う

#### photoId生成と衝突処理
**確定:** `photoId`はclientがUUIDで生成し、serverはそのIDをそのまま受理する。衝突時はserver既存写真を上書きしない。

- offlineでも写真追加できるよう、写真作成時点でclientがUUIDを生成する
- `photoId`は認証済みUser scope内で一意であることを要求する
- serverに同一`photoId`が存在しない場合は通常登録する
- 同一`photoId`かつ同一`photoHash`の場合は同一登録の再送・応答喪失等として`UNCHANGED`相当で扱える
- 同一`photoId`かつ異なる`photoHash`の場合は`REJECTED / PHOTO_ID_COLLISION / retryable=false`とし、既存server写真を上書きしない
- 同一`photoHash`でも`photoId`が異なれば正常な別写真として扱う
- collision受信後、clientは新UUIDを生成し、旧`photoId`から新`photoId`へlocal Business参照、保存原画像cache、Outbox等を同一IndexedDB transactionで付け替えて再Pushする
- 再衝突時は同処理を繰り返す

根拠: UUID衝突確率は極めて低いが、同期正当性を確率だけに依存させない。offline-firstを維持しつつ、万一のID衝突で別写真を誤上書きしないため。

#### Photoの同期単位
**確定:** Photoは独立した同期entityにはせず、Box / Item / BoxLocationのpayload内に埋め込まれる写真要素として扱う。

- `photoId`は写真要素を安定して識別するために持つが、Photo自身に`revision / contentHash / syncSeq / SyncChangeLog`は持たせない
- 同期・競合の単位は親entity（Box / Item / BoxLocation）のままとする
- 写真追加・削除・差し替え・並べ替えは親entityのbusiness変更として扱う
- それらの変更時は親entityの`updatedAt`、Outbox payload、`contentHash`を更新し、server受理時に親の`revision + 1 / serverUpdatedAt / syncSeq / SyncChangeLog UPSERT`を更新する
- 保存原画像Blobだけは`photoId`で別転送・別保存するが、これは同期entityではなく添付blobとして扱う

根拠: 箱目録では写真単体を独立して管理・検索・同期する業務要件がなく、写真のライフサイクルは常に親entityに従う。Photoを独立同期entityにするとrevision/conflict/log/paging依存が増えるため、必要性のない複雑化を避ける。

#### 写真差し替え
**確定:** 既存写真の画像内容を差し替える場合は同じ`photoId`を維持せず、新しい`photoId`を生成して旧写真削除＋新写真追加として扱う。

- 旧写真の`photoId` / `photoHash`は変更しない
- clientは新しい保存原画像を生成し、新UUIDの`photoId`と新しい`photoHash`を割り当てる
- 親entityの写真配列から旧`photoId`を除外し、新`photoId`を原則として同じ配列位置へ追加する
- 差し替え全体は親entityの1回のbusiness UPDATEとして扱う
- 親entityの`updatedAt`、Outbox payload、`contentHash`を更新する
- server受理時は親entityの`revision + 1 / serverUpdatedAt / syncSeq / SyncChangeLog UPSERT`を更新する
- 旧`photoId`の保存原画像は削除済み写真と同じGC対象になる
- local cacheに旧`photoId`の保存原画像が残っていてもUIからは不可視とし、自動復元しない
- 新旧の`photoHash`が偶然同一であっても別写真として扱い、dedupしない

根拠: `photoId`は「その写真記録そのもの」を識別するIDであり、画像内容が変わった後も同じIDを使うと、保存原画像cache・GC・hash整合性・衝突処理の意味が曖昧になるため。

### 保存原画像
- client生成WebPを「箱目録における保存原画像」とする
- WebP、長辺1600px上限、quality 0.85、拡大なし、EXIF Orientation補正、最大5 MiB
- `photoHash`はこの変換後WebP bytesから算出
- serverはWebP decode、正寸法、1600px上限、5 MiB上限、hash一致を検証し、通常フローでは再変換しない
- 保存原画像は`photoId`単位で保持し、同一hashでも別`photoId`なら別写真として保存する

### thumbnail
- client生成を正本としserverは再生成しない
- WebP、長辺400px上限、quality 0.8、拡大なし、最大256 KiB
- thumbnail bytesはcontentHash対象外
- serverはWebP decode、正寸法、400px上限、256 KiB上限を検証
- Pull/Full Resyncではcanonical thumbnailを配信
- thumbnailは撮影元Fileから直接生成せず、保存原画像WebPから生成する
- EXIF補正は保存原画像生成時に完了し、thumbnail側では再解釈しない
- thumbnailは各`photoId`に属する。別`photoId`間で共通化・dedupしない

#### thumbnail破損・欠落時の修復
**確定:** serverはthumbnailを自動再生成しない。client再生成または明示的な修復処理で再投入する。

通常Push時:
- thumbnailが欠落・破損・仕様違反ならentity payloadを`REJECTED`とする
- 正常な保存原画像と`photoHash`がserverに存在していてもserverはthumbnailを生成・差し替えしない
- clientは同じ`photoId`の保存原画像からthumbnailを再生成し、親entity Pushを再実行する
- 先行upload済みの正常な保存原画像は保持し、thumbnail不正だけを理由に削除しない

canonical保存後にthumbnail欠落・破損を検出した場合:
- 通常同期中にserverが黙って再生成しない
- 整合性異常として検出・記録する
- clientまたは明示的な管理/修復処理から、同じ`photoId`の保存原画像に対応するthumbnailを再投入して修復する
- 修復によってbusiness内容を勝手に変更しない。photoId・photoHash・写真順序・親entityの意味的内容は維持する

#### thumbnail単独修復の同期扱い
**確定:** thumbnailのみの再生成・修復はbusiness変更ではなく派生表示データの修復として扱う。

- thumbnail単独修復では親entityの`updatedAt / revision / syncSeq / contentHash`を変更しない
- thumbnail修復を理由に親entityのSyncChangeLog UPSERTを発行しない
- thumbnailは`photoId`単位の専用取得APIから最新canonical thumbnailを取得可能にする
- Pull / Full Resyncで親entityを取得する場合は、その時点の最新canonical thumbnailをpayloadへ含める
- 通常Pullだけでthumbnail単独修復を即時に全deviceへ通知・配布することは保証しない
- clientは表示時、thumbnail欠落/破損検出時、または明示的な再取得操作で`photoId`単位に最新thumbnailを取得してlocal表示データを更新できる
- thumbnail専用取得・修復APIも認証済みUser scopeをserverが確定し、他UserのphotoIdを取得・更新できないようにする
- thumbnail更新はphotoId/photoHash/写真順序などbusiness dataを変更しない

根拠: thumbnailはcontentHash対象外の派生表示データであり、その修復をbusiness revision/conflictへ混入させると不要な競合が発生する。一方、修復後の表示データを取得する経路は必要なため、親entityのbusiness同期とは分離したphotoId単位の取得経路を設ける。

### 写真同期・cache
- 親entity JSONは写真ごとに`photoId + photoHash + thumbnail + 写真順序`を持つ。保存原画像blobは別転送
- 保存原画像blobは`photoId`単位で扱う。hash一致による別写真間の共有・dedupはしない
- upload順=保存原画像生成 → photoHash算出 → thumbnail生成 → photoId単位blob upload → server検証 → 親entity Push → canonical参照確定
- Pull/Full Resyncでは保存原画像を取得せず、必要時オンデマンド取得してuser別local DBへcache
- cache key/参照も`photoId`基準とし、同じphotoHashの別写真を同一cache entryとして扱わない
- cache未取得/原画像取得失敗はentity同期失敗ではない。offline時はcache済み原画像、未取得ならthumbnail表示

#### 写真順序変更
- 写真配列の並べ替えだけでもbusiness変更として扱う
- clientで順序変更時に`updatedAt`更新、Outbox payload/contentHash再生成
- server受理時は親entityの`revision + 1`、`serverUpdatedAt`更新、`syncSeq`発行、SyncChangeLogへUPSERT
- 同じ写真集合でも順序が異なればcontentHashは異なる

#### local original cache
- local original cacheは正本ではなく再取得可能な内部cache
- Business/canonicalの`photoId`参照が利用者から見える写真状態の正本
- 写真削除・差し替え後も旧cache bytesは即時削除不要だがUIから不可視
- cacheの存在だけで写真を自動復元しない
- CONFLICTで写真が戻る場合は利用者がSERVER側canonicalを選択した結果として扱う
- 固定容量ではなくブラウザ/PWAのStorage Quotaに応じたbest-effort管理
- 容量逼迫時の削除優先順: 未参照かつ古い → 未参照かつ新しい → 参照中かつ古い → 参照中かつ最近
- Business / thumbnail / Outbox / SyncStateはcache整理対象にしない

### 写真削除とserver保存原画像GC
**確定:** server上の保存原画像Blobは、親entityから参照されていない期間をserver管理時刻で追跡し、30日以上未参照ならGC可能とする。

- Blob upload成功時点でまだcanonical親entityから参照されていなければ、serverは`unreferencedSince = upload完了server時刻`を設定する
- 親entity Push成功によってcanonical参照が成立した時点で`unreferencedSince = null`とする
- 参照済み写真が親entityから削除・差し替えで外れた場合は、そのcanonical変更をserverが受理したserver時刻を新しい`unreferencedSince`とする
- `unreferencedSince`から30日以上経過したBlobはGC候補とする
- GC実行直前に、その`photoId`がcanonical親entityから参照されていないことを再確認する
- upload済みだが親entity Pushが一度も成功しなかったBlobも30日後に回収可能
- server GC後でもclient Outboxとlocal保存原画像が残っている場合は、clientがBlobを再uploadしてから親entity Pushを再試行できる
- GC判定は`photoId`単位で行い、photoHash参照数やhash共有を使わない
- 同じphotoHashの別photoIdが存在していても、それぞれ独立して保持・GCする
- client business timestampはGC期限の算定に使用しない

根拠: blob-first uploadでは親entity Pushが失敗・中断すると未参照Blobが残るため、参照成立経験の有無に関係なく回収可能にする必要がある。server時刻で起算することでclient時計に依存せず、Outbox/local保存原画像からの再uploadを許すことで同期の正当性も維持する。

#### GC済みBlobを親entityが参照した場合
**確定:** 親entity Pushが参照する`photoId`の保存原画像Blobがserverに存在しない場合、親entityをcanonicalへ受理せず、再upload可能なエラーとして返す。

- server応答は`REJECTED / PHOTO_BLOB_NOT_AVAILABLE / retryable=true`とする
- serverはBlob欠落を理由に写真参照だけを黙って削除したり、thumbnailのみで親entityを受理したりしない
- clientは該当`photoId`のlocal保存原画像を確認し、存在する場合は同じ`photoId` / `photoHash`でBlobを再uploadする
- serverは再upload時にも保存原画像仕様と`photoHash`を通常どおり再検証する
- Blob再upload成功後、clientは同じ親entity Outboxを再Pushする。`baseRevision`や`outboxVersion`をBlob欠落だけを理由に変更しない
- 親entity Pushが成功するまでOutboxを削除しない
- local保存原画像自体が失われていて再upload不能な場合は自動的に写真を削除して同期成功扱いにせず、利用者対応が必要な同期エラーとして残す
- Blob再upload後に競合や別validation errorが発生した場合は、それぞれ通常の同期規則に従う

根拠: 30日GCと無期限保持するOutboxを両立させつつ、保存原画像が存在しない不完全なcanonical状態を作らないため。Blob欠落はserver側で再試行可能な前提条件不足であり、同じphotoIdのBlobを再投入すれば元の業務変更を維持したまま同期を継続できる。

### 写真枚数上限
- Box / Item / BoxLocation とも0〜10枚
- client UIは11枚目を追加させず、serverも10件超をREJECTED
- 同一hash写真も独立写真として枚数に数える
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
- `photoId`ベースの独立写真要素モデル未実装。photoHash識別・dedup前提を除去する必要あり
- client UUID生成photoIdとPHOTO_ID_COLLISION検出・再ID付与処理未実装
- Photoを独立同期entityにせず親payload内で同期する構造未実装
- 写真差し替え時に新photoIdを発行して旧削除＋新追加として扱う処理未実装
- 写真配列`photoId + photoHash`を順序付きでcanonical contentHashへ反映しthumbnailを除外する処理未実装
- photoHashによるserver受信bytes再検証未実装
- photoId単位のblob分離同期、オンデマンドcache、blob先行upload、`unreferencedSince`による30日GC未実装
- `PHOTO_BLOB_NOT_AVAILABLE`検出、同photoId Blob再upload、同一Outbox再Pushのretry flow未実装
- thumbnail 400px/256 KiB server検証、保存原画像1600px/5 MiB server検証未実装
- Box/Item/BoxLocation写真最大10枚の共通validation未実装
- local original cacheのQuota連動best-effort管理と優先削除未実装
- thumbnailを保存原画像WebPから生成する一方向pipeline未実装
- 写真順序変更を親business UPDATEとして同期する処理・test未実装
- thumbnail破損/欠落時にserver再生成せずclient/明示的修復で再投入する検出・修復経路未実装
- thumbnail単独修復をbusiness revisionから分離し、photoId単位で最新thumbnailを再取得する経路未実装

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

次の判断候補: **thumbnail単独修復を他deviceがいつ再取得するか、cache freshness規則をどこまでv0.8で保証するかを確定する。**

推奨候補は、通常表示ではlocal thumbnailを優先し、欠落/破損時は即時再取得、利用者の明示的refresh時は再取得可能とする。正常に表示できているthumbnailについて定期pollingやTTLによる自動更新はv0.8では行わず、Full Resyncまたは親entityが別business変更で再取得された時に最新canonicalへ更新する方式。

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。