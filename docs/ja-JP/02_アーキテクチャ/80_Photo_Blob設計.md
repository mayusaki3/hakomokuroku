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

## 7. 設計残件
- normal ingestion/upload/retry state
- server original/thumbnail API validation
- local cache/GCとserver orphan GC境界
- Undoと通常Business/Syncの最終統合

[目次](../README.md) > アーキテクチャ > Photo / Blob設計
