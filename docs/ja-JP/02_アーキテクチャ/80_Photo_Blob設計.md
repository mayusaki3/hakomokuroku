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

### 10.2 Original upload
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

### 10.3 Thumbnail upload
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

### 10.4 Confirm reference-ready
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

## 14. 設計残件
- local cache/GCとserver orphan GC境界
- Undoと通常Business/Syncの最終統合

[目次](../README.md) > アーキテクチャ > Photo / Blob設計
