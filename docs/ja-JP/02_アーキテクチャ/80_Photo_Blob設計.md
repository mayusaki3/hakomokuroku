[目次](../README.md) > アーキテクチャ > Photo / Blob設計

# Photo / Blob設計

## 1. Identity
- dedupしない
- each photo has independent `photoId`
- `photoHash` = stored original bytesのhash
- 1 photoId = exactly 1 Business parent
- Photoは独立sync entityではなく親Box/Item/BoxLocationのphotos配列要素
- replaceはnew photoId
- orderはbusiness-significant
- parentあたり0〜10枚

## 2. Original
client生成WebP:
- EXIF orientation corrected
- long edge 1600px
- q0.85
- no upscale
- max 5 MiB

original BlobはphotoId keyで保持する。

## 3. Thumbnail
derived WebP:
- long edge 400px
- q0.8
- max 256 KiB

thumbnail bytesはparent contentHashに含めない。

## 4. Sync / GC
blob-first upload。Businessがserverでphoto referenceをcanonical化する前にoriginal + required thumbnailがserver validation済みでreference-readyであることを保証する。

PhotoUploadState:
- `PENDING`: server-ready未確認。retry可能
- `UPLOADING`: upload/validation処理中
- `CONFIRMED`: current User scope serverでphotoId/photoHashのoriginal + required thumbnailが検証済みでBusiness参照可能

network/timeout/RESTORE_LOCKED等のretryable failureではPENDINGへ戻す。単なるupload HTTP成功ではCONFIRMEDにしない。

blob confirmed後にBusiness Pushが失敗/競合した場合、blobはunreferencedのまま残り得る。これは正常な補償対象であり30日後GC candidateとする。

Business payloadから既に参照されないphotoは通常syncのupload dependencyに含めない。

## 5. Edit/Delete
direct parent-to-parent photo moveはv0.8対象外。

photo deleteは10秒Undo。delete/Undoは通常Business updateとして扱う。各deleteのUndoは独立しLIFO。

## 6. Recovery
missing originalからthumbnailを用いるlow-resolution replacementを作る場合はnew photoId/hash。真のoriginalが後から見つかった場合も利用者確認後にreplacementを置換し、同じidentityへ戻さない。

## 7. Normal ingestion

### 7.1 Local generation
photo追加時:
1. source image decode
2. EXIF orientation適用
3. original WebP生成
4. original bytesのSHA-256を `photoHash`
5. thumbnail WebP生成
6. new cryptographically random `photoId`
7. local Blob/metadata保存
8. parent `thumbs` にPhotoRef追加
9. parent Business + Outboxをcommit

original/thumbnail生成またはlocal保存に失敗した場合、parent BusinessへPhotoRefを追加しない。

### 7.2 Local atomic boundary
重いdecode/encode/hashはIndexedDB transaction外で完了させる。

commit時はlocal original/thumbnailが存在することを確認し、parent Business + Outbox + PhotoUploadState(PENDING)を整合させる。

photoIdは一度確定したoriginal bytesに結び付く。同じphotoIdへ別original bytesを上書きしない。再生成/replaceはnew photoId。

## 8. PhotoUploadState

```text
photoId          string PK
photoHash        string
state            PENDING | UPLOADING | CONFIRMED
lastAttemptAt    timestamp?
confirmedAt      timestamp?
lastErrorCode    string?
lastErrorAt      timestamp?
retryable        boolean?
```

- PENDING: server-ready未確認
- UPLOADING: current upload/validation attempt中
- CONFIRMED: server reference-ready確認済み

UPLOADINGはpersistent correctness stateではない。app起動時に残存UPLOADINGを見つけた場合はPENDINGへ戻してstatus確認/retryする。

retryable failure:
- state=PENDING
- lastErrorCode保存
- retryable=true

permanent/local-action-required failure:
- state=PENDINGのまま
- lastErrorCode保存
- retryable=false
- automatic retry loop対象外

状態enumをERRORへ増やさず、retry metadataで区別する。

## 9. Server Blob model
serverはUser scopeでphoto blob stagingを管理する。

```text
PhotoBlob
userId            string PK(1)
photoId           string PK(2)
photoHash         string
originalReady     boolean
thumbnailReady    boolean
referenceReady    boolean
createdAt         timestamp
updatedAt         timestamp
lastReferencedAt  timestamp?
```

constraints:
- same `(userId,photoId)` へ異なるphotoHashは不可
- binary storage pathもUser/photoIdで分離
- originalReady/thumbnailReadyはbinary validation成功後のみtrue
- referenceReady = required binariesが揃い整合検証済み
- unreferenced stagingを許可

PhotoBlobはBusiness entityではなくSyncChangeLog対象外。

## 10. Server Photo API

### 10.1 Status
`GET /api/photos/{photoId}/status?photoHash=<sha256>`

response:
```json
{
  "photoId": "...",
  "photoHash": "...",
  "originalReady": true,
  "thumbnailReady": true,
  "referenceReady": true
}
```

不存在はready=false相当のresponseを返してよい。same photoId + different hashは `PHOTO_HASH_MISMATCH`。

### 10.2 Download

new device / Full Resync / local thumbnail regeneration等でserver-ready photoをlocalへ取得するため、authenticated User-scope download APIを提供する。

- `GET /api/photos/{photoId}/original?photoHash=<sha256>`
- `GET /api/photos/{photoId}/thumbnail?photoHash=<sha256>`

規則:
- authenticated User scopeのみ
- requested photoId/photoHashがserver PhotoBlobと一致すること
- current server Businessから当該Userのphotoとして参照される、またはclientが正当にrecovery対象として取得可能なものだけ返す
- cross-user access禁止
- hash mismatchは `PHOTO_HASH_MISMATCH`
- binary responseはBusiness/Sync metadataを変更しない
- download自体で `unreferencedAt` を延長しない
- thumbnail不存在時はoriginal取得後client再生成可能
- original不存在時はmissingとして扱い、空bytesや別photoを返さない

Service Worker Cache Storageをcanonical photo cacheとして使用しない。取得後はIndexedDB photo storeへ保存する。

### 10.3 Original upload
`PUT /api/photos/{photoId}/original`

metadata header/bodyでexpected `photoHash` を必須とし、bodyはWebP bytes。

server validation:
- authenticated User scope
- max 5 MiB
- decodable canonical WebP
- animation不可
- long edge <=1600
- no invalid/trailing structure
- SHA-256(body) == photoHash
- same photoId既存hashとの一致

同一photoId/hash/same valid bytesへの再PUTはidempotent success。

### 10.4 Thumbnail upload
`PUT /api/photos/{photoId}/thumbnail`

expected photoHashを指定する。thumbnail自身はparent contentHashへ入らないが、originalのphotoId/photoHash pairへ紐付ける。

validation:
- authenticated User scope
- originalが同photoId/hashで存在
- max 256 KiB
- decodable WebP
- animation不可
- long edge <=400
- no invalid/trailing structure

同一pairへの再PUTはidempotent。thumbnail bytesが既存と異なる場合は、original identityは変えずvalidated thumbnailを置換可能。thumbnailはderived cacheでありBusiness identityではない。

### 10.5 Confirm reference-ready
`POST /api/photos/{photoId}/confirm`

request:
```json
{
  "photoHash": "..."
}
```

serverはoriginal/thumbnailを再確認し、readyなら:
```json
{
  "photoId": "...",
  "photoHash": "...",
  "referenceReady": true
}
```

clientはこの成功後だけPhotoUploadState=CONFIRMEDとする。

confirmはidempotent。

## 11. Business reference binding
blob upload/confirm段階ではBusiness parent identityを固定しない。unreferenced stagingとしてUser/photoId/hashを確保する。

Business Push時にPhotoRefを検証し:
- referenceReady=true
- same User
- photoId/hash一致
- photoIdが他のactive/tombstone Business parentに既に所有されていない

ことを確認してparentへbindingする。

同じparentの次revisionで継続参照するのは許可。

別parentから同じphotoIdを参照した場合 `PHOTO_PARENT_CONFLICT`。

parentからPhotoRefが削除された場合bindingを解除し、blobをunreferenced扱いへ移す。v0.8ではそのphotoIdを別parentへ再利用しない。再追加/移動はnew photoIdを使用する。

## 12. Retry / error
retryable:
- network/timeout
- 5xx / TEMPORARILY_UNAVAILABLE
- RESTORE_LOCKED

action required/permanent:
- PHOTO_HASH_MISMATCH
- INVALID_WEBP
- PHOTO_TOO_LARGE
- PHOTO_DIMENSION_INVALID
- PHOTO_ANIMATED
- PHOTO_PARENT_CONFLICT
- LOCAL_ORIGINAL_MISSING
- LOCAL_THUMBNAIL_MISSING

AUTH_REQUIREDはphoto単体retryではなくsyncをblockedにして再認証待ち。

retryable errorはexponential backoff + jitterを使用し、app foreground/reconnect/manual syncで再試行可能。具体的秒数は実装定数としBusiness semanticsにはしない。

permanent errorはblind automatic retryしない。sourceから作り直す場合はnew photoId。

## 13. Restore integration
Restoreのphoto stagingも同じserver validation規則を使用できる。

Restoreは必要photoをすべてreference-readyにしてからserver atomic Business applyを行う。Restore lock ownerはRestore flowとしてupload/confirm可能。

通常syncのnon-owner upload/confirmはRestore lock中 `RESTORE_LOCKED`。

## 14. Local storage / GC

### 14.1 Classification
local photo dataを次の2種類として扱う。

**required local data**
- current local Businessが参照するoriginal
- current Outbox payloadが参照するoriginal
- server未CONFIRMEDで再uploadに必要なoriginal
- photo recovery処理中に必要なsource
- active Undo entryが復元に必要とするblob

**reconstructible/cache data**
- thumbnail
- server CONFIRMED済みで、current local Business/Outbox/Undo/recoveryから参照されないorphan blob

required local dataを通常cache GCで削除しない。

### 14.2 Thumbnail cache
thumbnailはderived cacheなので、storage pressure時に優先削除可能。

削除後:
- originalがlocalにあれば再生成
- originalがlocalに無ければserverから再取得可能なら取得
- どちらも不可ならplaceholder表示

thumbnail消失だけでBusiness/Outboxを変更しない。

### 14.3 Local original
current local BusinessまたはOutboxが参照するoriginalは自動GC禁止。

特にserver CONFIRMEDであっても、offline利用・backup export・将来の再upload/recoveryのため、通常状態ではlocal originalを保持する。

v0.8では「容量節約のため参照中originalを自動evictする」機能は提供しない。

### 14.4 Local orphan GC
parentから参照解除されたphotoIdはlocal orphan candidateになる。

自動削除可能条件:
1. current Businessから非参照
2. current Outbox payloadから非参照
3. active Undo entryから非参照
4. recovery operationから非参照
5. uploadが進行中でない
6. server CONFIRMED済み、またはserverへ一度も必要なBusiness referenceとしてcommitされておらず再利用予定がない

Undo仕様のgrace中は削除禁止。

local orphanの具体的保持時間はserver 30日と一致させる必要はない。v0.8では安全側として **30日** を標準自動GC期限とする。

manual storage cleanupを提供する場合も上記参照条件を破ってはならない。

### 14.5 Storage pressure
browser quota不足時:
1. unreferenced thumbnail
2. referenced thumbnail（再生成可能）
3. 30日経過local orphan original
の順にcleanup候補とする。

それでも不足する場合、参照中originalや未同期originalを自動削除せず、storage不足として新規photo保存等を停止し利用者へ通知する。

## 15. Server orphan GC

### 15.1 Orphan definition
server PhotoBlobがどのserver Business parentからも参照されていない状態をorphanとする。

blob-first upload直後や、Business Push失敗/Conflict後もorphanになり得る。

### 15.2 GC eligibility
server orphan blobは **unreferencedになってから30日** 経過後にphysical delete可能。

PhotoBlobにはGC判定用に:
```text
unreferencedAt timestamp?
```
を保持する。

- first uploadで未参照ならcreated時点をunreferencedAtとする
- Business reference bind成功時はunreferencedAt=null
- 最後のBusiness reference解除時にserver時刻を設定
- orphanの再upload/status accessだけでは期限を延長しない

### 15.3 GC safety
GC transaction/jobは削除直前にBusiness referenceを再確認する。

参照が存在すれば削除禁止し、必要ならunreferencedAtを修正する。

Restoreでserver-ready化したblobも、Restore applyされずorphanのままなら同じ30日規則。

### 15.4 Tombstone parent
tombstone Business payloadがphotoIdを参照している間は**参照中**として扱いserver blobを削除しない。

Business tombstone自体が30日後にphysical purgeされ、その結果最後のreferenceが消えた時点からphoto blobの30日 orphan timerを開始する。

したがってBusiness DELETEからblob削除まで最大でさらに30日以上残ることを許容する。安全性を優先し、Business tombstoneとblobを同時purgeする必要はない。

### 15.5 Photo status after GC
server GC済みphotoIdへのstatusはnot-readyを返す。

local Business/Outboxがそのphotoを必要としておりlocal originalが残っていれば、同じphotoId/photoHashで再uploadしてreference-readyへ戻せる。ただし別parentへの再利用は禁止。

## 16. Local / server responsibility boundary
- Business reference truth: server Business + local pending Outbox
- unsynced binary保全: local responsibility
- confirmed binary durability: server responsibility
- local thumbnail: cache
- server unreferenced blob: temporary staging, 30日GC
- GCはBusiness identity/contentHashを変更しない
- GC結果そのものをSyncChangeLogへ記録しない

## 17. Photo delete / 10-second Undo

### 17.1 Delete commit
photo削除操作はUI上の仮削除ではなく、その時点で通常Business updateとしてcommitする。

同一IndexedDB transaction:
1. parent current Businessを取得
2. target PhotoRefと元indexを記録
3. parent `thumbs` からPhotoRefを削除
4. parent contentHash/updatedAt等local Businessを更新
5. Outboxを通常規則でupsert
6. commit

Syncは10秒待たず通常通り進行可能。

### 17.2 Undo entry
delete commit成功後、UI runtimeにUndo entryを作る。

```text
undoId
parentType
parentId
photoId
photoHash
originalIndex
expiresAt
```

- grace = 10秒
- 各deleteは独立entry
- UI操作はLIFO
- Undo entryはBusiness/Sync entityではない
- v0.8ではapp/browser再起動をまたぐpersistent Undoを保証しない

Undo entryがactiveな間は対応local blobをGCしない。

### 17.3 Undo
10秒以内のUndoは削除前transactionのrollbackではなく、**新しい通常Business update**。

同一IndexedDB transaction:
1. current parent取得
2. parentがactiveであることを確認
3. same photoIdが既に存在しないことを確認
4. originalIndexを基準にPhotoRefを再挿入
5. parent contentHash/updatedAt更新
6. Outboxを通常規則でupsert
7. commit
8. Undo entry消費

削除が既にserverへAPPLIED済みでも、Undoは次のBusiness revisionとしてPushされる。

blobがserverでunreferencedになっていても30日GC前なら同じphotoId/hashを同じparentへ再binding可能。server blobが既に存在しない場合、local originalから再uploadしてからPushする。

### 17.4 Reinsert position
削除後10秒間に同じparentのphoto順序が別操作で変わる可能性がある。

originalIndexがcurrent length以下ならそのindexへ挿入。current lengthを超える場合は末尾へ挿入する。

v0.8では隣接photo identityを追跡する複雑な位置mergeは行わない。

### 17.5 Multiple deletes
各deleteは独立Undo entryを持つが、UIのUndo操作対象は最新entryからLIFO。

例:
```text
delete A
delete B
Undo -> B
Undo -> A
```

各entryの10秒期限は自身のdelete commit時刻から独立計測する。

期限切れentryはUndo不可として破棄する。

### 17.6 Parent deletion
Undo対象parent自体がdelete/tombstoneされた時点で、そのparentに属するphoto Undo entryをすべてinvalidateする。

parent delete後にphoto単体Undoでparentを復活させない。

parent delete自体のUndoを将来提供する場合は別Business操作として設計する。v0.8 photo Undoの責務外。

### 17.7 Conflict / remote changes
Undo commitも通常Business editなので、その後のPushでserver revisionが進んでいれば通常SyncConflictになる。

Undoだからserver変更へ強制適用しない。

remote側でparentがdeletedになっていた場合も通常Conflictとして利用者判断へ送る。

### 17.8 Missing blob
Undo時にlocal thumbnailが無いだけならoriginalから再生成可能。

local originalも無くserver blobも取得不能の場合、同じphotoIdを内容不明のまま復元しない。Undoを完了できない旨を表示し、recovery規則に従う。

### 17.9 Sync boundary
canonical behavior:
```text
delete
  -> Business + Outbox commit
  -> 10s Undo UI開始
  -> Syncは停止しない

Undo within 10s
  -> new Business + Outbox commit
  -> normal Sync

no Undo
  -> entry expires
  -> local blob becomes GC candidate when other safety conditions are met
```

## 18. Photo / Blob設計完了
v0.8のPhoto / Blob設計残件は完了。

実装工程では本書を正本としてingestion、Photo API、upload state、GC、Undoを実装する。

[目次](../README.md) > アーキテクチャ > Photo / Blob設計
