[目次](../目次.md) > アーキテクチャ > API設計 > 写真API

# 写真API

## 1. 目的

Box（箱情報）、Item（物品情報）、BoxLocation（箱の場所情報）で使用する写真binaryのupload、存在確認、取得を定義する。

写真のBusiness上の意味、canonical化、offline、削除、GCは [写真 / Blob設計](./55_写真_Blob設計.md) を参照。

Business payloadとの同期は [Business / 同期API](./81_API_Business_同期.md) を参照。

## 2. 基本原則

写真binaryはBusiness Pushとは分離して転送する。

Business entityはordered `PhotoRef[]` として次だけを持つ。

```text
photoId
photoHash
```

新しいPhotoRefを含むBusiness変更をserver canonicalへ受理する前に、対応するcanonical originalがserver-readyであることを確認する。

写真binary APIもauthenticated User scopeで動作する。

別UserのphotoIdを参照・取得できない。

## 3. Serverに保存する写真

serverで正とするbinaryはcanonical original。

canonical original:

```text
format       WebP
long edge    <= 1600 px
quality      canonical化時 0.85
max size     5 MiB
```

thumbnailはcanonical originalから生成可能な派生データ。

thumbnail:

```text
format       WebP
long edge    <= 400 px
quality      0.8
max size     256 KiB
```

serverはthumbnailをcacheとして保持してよい。

thumbnailの欠損はoriginalの欠損を意味しない。

## 4. photoIdとphotoHash

photoIdはclientで生成する。

photoHashはcanonical original bytesのSHA-256。

serverはupload受理時に受信binaryからSHA-256を再計算し、requestのphotoHashと一致することを確認する。

同じphotoHashでもphotoIdが異なれば別写真。

binary deduplicationをBusiness仕様として行わない。

## 5. Upload

### PUT /api/photos/{photoId}

request:

```text
Content-Type: image/webp
X-Photo-Hash: <SHA-256>
Content-Length: ...
Body: canonical original bytes
```

serverは少なくとも次を検証する。

- authenticated User
- photoId形式
- Content-Type
- 5 MiB以下
- WebPとしてdecode可能
- 最大辺1600px以下
- calculated SHA-256 == X-Photo-Hash

成功:

```json
{
  "ok": true,
  "photoId": "string",
  "photoHash": "string",
  "status": "READY"
}
```

## 6. Uploadの冪等性

同一User / photoId / photoHashで既にcanonical originalが存在する場合、再uploadは成功扱いにできる。

response:

```text
status = READY
```

同一User / photoIdに異なるphotoHashが既に存在する場合は上書きしない。

```text
409 photo_id_conflict
```

写真内容を変更する場合は新しいphotoIdを生成する。

## 7. Ready確認

### HEAD /api/photos/{photoId}

Business Push前など、server-ready確認に使用できる。

存在し、authenticated Userに属する場合:

```text
200
ETag: "<photoHash>"
X-Photo-Hash: <photoHash>
```

存在しない場合:

```text
404
```

別Userに存在するかどうかは公開しない。

## 8. Original取得

### GET /api/photos/{photoId}

authenticated User自身のcanonical originalを取得する。

成功:

```text
200
Content-Type: image/webp
ETag: "<photoHash>"
Cache-Control: private
```

clientはlocal originalが欠損している場合やRestore後のcache再構築等に利用できる。

`If-None-Match` によるconditional GETを使用可能とする。

## 9. Thumbnail取得

### GET /api/photos/{photoId}/thumbnail

thumbnailを返す。

thumbnail cacheが無い場合はcanonical originalから生成してよい。

成功:

```text
200
Content-Type: image/webp
ETag: "<photoHash>:thumb-v1"
Cache-Control: private
```

thumbnail生成規則を変更する場合はthumbnail versionを変更する。

## 10. Business Pushとの順序

新しい写真を親Business entityへ追加する場合:

```text
local canonical化
  ↓
local original / thumbnail保存
  ↓
親Business + Outbox commit
  ↓
写真binary upload
  ↓
server READY確認
  ↓
Business Push
```

offline時はupload以降を保留する。

Business Push時に新しいPhotoRefのbinaryがserver-readyでなければ、そのoperationを `REJECTED` とする。

error例:

```text
photo_not_ready
```

Outboxは保持し、binary upload完了後にretryできる。

## 11. 写真削除

利用者が親Businessから写真を削除しても、写真APIから直ちにserver binaryをDELETEしない。

写真削除のBusiness operation:

1. 親entityのthumbsからPhotoRefを削除する。
2. 通常のBusiness同期でserver canonicalへ反映する。
3. serverは未参照になったbinaryをGC候補にする。

写真binary用の利用者向け即時DELETE APIは設けない。

これにより10秒Undo、未同期変更、別Deviceの古いstateとbinary lifecycleを分離する。

## 12. GC

server GCは少なくとも次を確認してからbinaryを削除する。

- canonical Businessから参照されていない。
- 未完了Restoreから必要とされていない。
- upload直後のBusiness Push待ち猶予期間を過ぎている。
- retention / retry上必要ない。

安全に未参照と判断できない場合は削除しない。

GCの具体的な猶予時間は運用設計で定義する。

## 13. Backup / Restore

Backup生成時はPhotoRefが参照するcanonical originalをbackupへ含める。

Restore時はbackup内binaryのSHA-256とphotoHashを検証する。

Restore apply前またはapply transactionに先行するstagingで、必要なbinaryをserver-readyにする。

RestoreされたPhotoRefだけがcanonical Businessに存在し、binaryが欠損する状態を作らない。

詳細は [バックアップ / リカバリモデル](./60_バックアップ_リカバリモデル.md) を参照。

## 14. Error mapping

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | invalid_request | request / header / image形式不正 |
| 401 | unauthorized | 未認証 |
| 404 | not_found | User scope内に写真が存在しない |
| 409 | photo_id_conflict | 同一photoIdに異なるphotoHash |
| 413 | photo_too_large | 5 MiB超過 |
| 415 | unsupported_media_type | WebP以外 |
| 422 | photo_hash_mismatch | binaryとphotoHash不一致 |
| 500 | internal_error | server内部エラー |

image decode失敗やdimension違反は `invalid_request` とする。

## 15. Security

- すべてのphoto accessをauthenticated User scopeへ限定する。
- photoIdだけで他Userの写真を取得できない。
- server側でContent-Typeだけを信用せずimage decodeする。
- upload filenameをserver storage pathとして使用しない。
- responseでserver filesystem pathを公開しない。
- SVG等のactive contentを写真として受理しない。

## 16. 現行実装との差分

現行コードにはv0.8の写真binary APIが存在しない。

実装工程で本書に従って新規実装する。

既存のBusiness `thumbs` が文字列配列を前提としている箇所は、`PhotoRef { photoId, photoHash }` のordered arrayへ変更する。

[目次](../目次.md) > アーキテクチャ > API設計 > 写真API
