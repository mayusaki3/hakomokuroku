[目次](../目次.md) > アーキテクチャ > API設計 > Business / 同期API

# Business / 同期API

## 1. 目的

Box（箱情報）、Item（物品情報）、BoxLocation（箱の場所情報）のserver通信APIを定義する。

箱目録v0.8はlocal-firstで動作するため、通常のBusiness編集ごとにserver CRUD APIを呼び出さない。

UIによる作成・更新・削除はUser-local IndexedDBのBusiness dataとOutboxへ反映し、serverとの交換は同期APIで行う。

同期処理全体は [同期モデル](./50_同期モデル.md) を参照。

## 2. API構成

Business同期の基本API:

```text
POST /api/sync/push
GET  /api/sync/pull
```

Full Resyncは通常Pullとは別のsnapshot APIとして扱う。

Box / Item / BoxLocationについて、v0.8の通常操作用server CRUD APIは必須としない。

## 3. User scope

すべての同期APIは認証必須。

serverはrequest bodyのuserIdをBusiness ownerとして信用しない。

User scopeはauthenticated Userから決定する。

Business identity:

```text
(User.id, entityId)
```

同じentityIdが別Userに存在しても別entityとして扱う。

## 4. Business payload共通metadata

Push / Pullで扱うBusiness entityは、種類ごとのBusiness contentに加えて同期metadataを持つ。

主なmetadata:

```text
id
revision
contentHash
deletedAt
serverUpdatedAt
syncSeq
```

Push時にclientがserver authoritative metadataを任意に上書きできないようにする。

client timestampは競合判定、Pull順序、retention判定のauthorityにしない。

## 5. Box（箱情報）

Business content:

```text
id
code
name
locationId?
parentBoxId?
tags[]
note?
thumbs[]
meta?
deleted
```

規則:

- `code` はcanonical Box.code。
- `code` は作成後immutable。
- `locationId=null` は直接Location未割当。
- `parentBoxId=null` は他のBoxに入っていない。
- `parentBoxId != null` の場合は `locationId=null`。
- parentは同一Userのactive Box。
- self-reference禁止。
- cycle禁止。
- `"UNASSIGNED"` をIDとして送信しない。

## 6. Item（物品情報）

Business content:

```text
id
boxId?
name
tags[]
note?
thumbs[]
meta?
deleted
```

`boxId=null` は「どのBoxにも入っていない」論理状態UNASSIGNED。

literal `"UNASSIGNED"` を送信しない。

`boxId` がある場合は同一Userのactive Boxを参照する。

## 7. BoxLocation（箱の場所情報）

Business content:

```text
id
name
note?
thumbs[]
meta?
deleted
```

BoxLocationはBoxへの参照を持たない。

Box側の `locationId` がBoxLocationを参照する。

これにより1つのBoxLocationに複数Boxを配置できる。

BoxLocationの写真は、部屋・棚・押入れ等のどの位置かを視覚的に判断するために使用する。

## 8. Push

### POST /api/sync/push

PushはOutboxに保持されたlogical operationをserverへ送信する。

各operationは少なくとも次を持つ。

```text
entityType
entityId
operation
baseRevision
contentHash
businessPayload
```

operation:

```text
UPSERT
DELETE
```

`UPSERT` はBusiness entityの新規作成または更新を表す。新規作成では `baseRevision="0"` を指定し、既存entityの更新ではclientが保持する `baseRevision` を指定する。`baseRevision`、`revision`、`syncSeq`、Pull cursorなどのsigned 64-bit値は、JSONではすべてdecimal stringで表現する。URL queryの`cursor`もdecimal stringとする。

serverは各operationについて現在のcanonical revision / contentHashを確認し、通常受理、`UNCHANGED`、`CONFLICT` を判定する。`UPSERT` は無条件上書きを意味しない。

### 8.1 通常受理

`baseRevision == currentRevision` の場合、validation成功後にBusiness変更をcommitする。

### 8.2 内容一致

revisionが異なっていてもcontentHashが同一なら `UNCHANGED` とする。

### 8.3 競合

revisionとcontentHashの双方が一致しない場合は `CONFLICT`。

server Business graphとの組合せでBox nesting cycle等が発生する場合も、multi-device同期由来ならSyncConflictとして扱う。

### 8.4 operation単位transaction

各logical operationを独立したDB transactionとして処理する。

HTTP request内の全operationを1つのtransactionへまとめない。

## 9. Push response

operationごとに結果を返す。

概念形式:

```json
{
  "ok": true,
  "results": [
    {
      "entityType": "Box",
      "entityId": "string",
      "status": "APPLIED",
      "revision": "2",
      "syncSeq": "123"
    }
  ]
}
```

status:

- `APPLIED`
- `UNCHANGED`
- `CONFLICT`
- `REJECTED`

`CONFLICT` とvalidation上の `REJECTED` を区別する。

## 10. Pull

### GET /api/sync/pull

通常Pullはtimestampではなく `syncSeq` cursorを使用する。

request例:

```text
GET /api/sync/pull?cursor=<syncSeq>&limit=<n>
```

serverはauthenticated Userに属し、指定cursorより後のSyncChangeLogをsyncSeq順に返す。

responseは次の情報を持つ。

```text
changes[]
nextCursor
hasMore
```

changeはcanonical Business payload snapshotを含む。

clientはPull response受理後、同期モデルに従ってlocal Businessへ適用し、Outboxを再適用する。

## 11. Pull cursor

cursorのauthorityはserverの `syncSeq`。

`updatedAt` やclient時刻をPull cursorとして使用しない。

SyncChangeLog retention外の古いcursor、またはcursorを持たない新規DBではFull Resyncへ移行する。

## 12. Full Resync

Full Resyncでは開始時点のcanonical stateをimmutable snapshotとして取得する。

通常Pullの単純な「全件取得」で代用しない。

概念API:

```text
POST /api/sync/full-resync
GET  /api/sync/full-resync/<snapshotId>
```

実際のpath分割やpaging parameterは実装前のAPI test case作成時に確定する。

snapshot全体を取得するまでcurrent local Businessへ部分採用しない。

詳細は [同期モデル](./50_同期モデル.md) を参照。

### 12.1 競合解決Receipt ACK

競合解決はユーザーが都度選択する。ACKは新しい解決判断ではなく、既に成功した解決要求の結果をデバイスがlocal DBへatomicに反映済みであることの通知。

```text
POST /api/sync/conflicts/resolutions/{resolutionId}/ack
```

request body:

```json
{
  "deviceId": "registered-device-id"
}
```

- 認証済みUserと登録済みDeviceの所有関係を検証する。対象Receiptは `(userId,deviceId,resolutionId)` で検索し、別User・別DeviceのReceiptにはアクセスさせない。
- ACK requestの`deviceId`は、ACK待ち記録に保存された元の解決操作のDevice IDを使用する。現在のlocal `DeviceState.deviceId`との一致は要求しない。DeviceState再セットアップ後も旧DeviceのACK待ち記録を新Device IDに書き換えない。
- serverはauthenticated Userに属する登録済みDeviceであることと、同じ`(userId,deviceId,resolutionId)`のReceiptが存在することを確認する。ACKの許可は旧DeviceStateの復元、Device登録の再利用、Box.code prefixの切替を意味しない。
- clientは元のACK待ち記録が健全であることを確認できない場合、推測した`deviceId`/`resolutionId`でACKを送信しない。認証・所有関係検証が失敗したACK待ち記録は削除せず、送信を保留する。
- clientは解決成功responseをlocal Business / Outbox / SyncConflictへatomicに反映した後に限りACKを送信する。
- Receiptが `PENDING_ACK` ならserver clockで `acknowledgedAt` を記録して `ACKED` に遷移し、成功responseの詳細を破棄する。
- 同じACKの再送は冪等。HTTP 200で成功とし、初回の `acknowledgedAt` を変更しない。
- `ACKED` の同一解決要求再送はHTTP 200で `status: ALREADY_ACKNOWLEDGED` とし、Business変更を再実行しない。
- clientは成功結果のlocal atomic反映とACK待ち記録を同一IndexedDB transactionで永続化し、ACK HTTP 200を受信するまでACKを再送可能にする。ACK済み解決要求の再送応答にはBusiness snapshotを含めない。
- `ALREADY_ACKNOWLEDGED` を受け取ってもlocal反映済みを確認できない場合、Business/Outboxを推測で更新せずFull Resyncへ移行する。
- ACKから30日経過したReceiptは完全削除する。未ACKのReceiptはこの期限の対象外。
- Device削除時は当該DeviceのReceiptを完全削除する。ただしv0.8のDevice削除APIは未提供であり、将来のDevice削除実装で連動させる。
- Receiptが存在しない場合は `404 RESOLUTION_RECEIPT_NOT_FOUND`。認証なしは `401 AUTH_REQUIRED`、他Userに属するDeviceは `403 USER_SCOPE_VIOLATION` とし、他UserのReceiptの存在を漏らさない。

詳細は [同期設計](./60_同期設計.md) 第17.3.1節および[DBスキーマ定義](./40_DBスキーマ定義.md) 第11.1節を参照。

## 13. 削除

Business deleteはtombstoneとして同期する。

### 13.1 Item削除

Itemをdeleted stateへ更新する。

### 13.2 Box削除

1つのlogical operationとしてserver transactionで少なくとも次を行う。

- direct Itemの `boxId=null`
- direct child Boxの `parentBoxId=null`
- direct child Boxの `locationId=null`
- 対象Boxをtombstone化

子孫Boxを再帰的に削除しない。

削除されたBoxが持っていたLocationへchild Boxを自動昇格しない。

### 13.3 BoxLocation削除

対象Locationを直接参照しているtop-level Boxの `locationId=null`。

nested BoxはlocationIdを持たないため変更しない。

対象BoxLocationをtombstone化する。

## 14. 写真

Business payloadの `thumbs` はordered PhotoRef array。

新しいPhotoRefをserver canonical Businessへ受理する前に、対応するphoto binaryがserver-readyであることを確認する。

写真binary転送自体はBusiness Pushとは分離する。

詳細は [写真 / Blob設計](./55_写真_Blob設計.md) を参照。

## 15. Error mapping

HTTP request全体のエラー応答では、machine-readableな `code` を必須とする。エラーコードは大文字の識別子とし、`error` は正式な識別フィールドとして使用しない。

基本形式:

```json
{
  "code": "INVALID_REQUEST"
}
```

HTTP request全体に対する主なエラー:

| HTTP | code | 意味 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | request形式不正 |
| 401 | `AUTH_REQUIRED` | 認証なし / session失効 |
| 403 | `USER_SCOPE_VIOLATION` | 認証済みUserの操作範囲外 |
| 409 | `RESTORE_LOCKED` | Restore lockによる一時停止。再試行可能 |
| 409 | `FULL_RESYNC_REQUIRED` | incremental Pullを継続できない |
| 409 | `CONFLICT_STALE` | 競合解決時にserver stateが変更されている |
| 409 | `RESOLUTION_ID_REUSED` | 同一Device・resolutionIdに異なる解決要求を使用 |
| 404 | `CONFLICT_NOT_FOUND` | 指定した未解決Conflictが存在しない |
| 404 | `RESOLUTION_RECEIPT_NOT_FOUND` | ACK対象のReceiptが存在しない |
| 422 | `RESOLUTION_REJECTED` | 競合解決要求の検証失敗 |
| 429 | `TOO_MANY_REQUESTS` | rate limit |
| 500 | `INTERNAL_ERROR` | server内部エラー |
| 503 | `TEMPORARILY_UNAVAILABLE` | 一時的なサービス利用不可。再試行可能 |

`ALREADY_ACKNOWLEDGED` はエラーcodeではなく、ACK済みの同一解決要求に返すHTTP 200の成功statusである。保存済みBusiness snapshotは返さない。

上表は代表例であり、各endpoint固有のerror codeとHTTP statusは詳細同期設計の該当節に従う。例えばPullの不正cursorは `INVALID_CURSOR`、競合解決時のvalidation failureは `RESOLUTION_REJECTED` とする。409を単一の `CONFLICT` に集約しない。

個々のBusiness operationの競合やvalidation failureは、可能な限りHTTP request全体の409ではなくPush resultの `CONFLICT` / `REJECTED` として返す。

## 16. 現行実装との差分

v0.8実装時に少なくとも次を解消する。

- Pullが `updatedAt` timestamp cursorを使用している。
- Pushがrevision / contentHashを確認せず単純upsertしている。
- PushがBusiness identityを単一 `id` として扱っている。
- Boxが旧 `location` 文字列を持つ。
- BoxLocationがBoxを参照する旧1:1構造になっている。
- Item.boxIdがnullを許容していない。
- Box nesting `parentBoxId` を扱っていない。
- literal `"UNASSIGNED"` をBox IDとして使用する旧削除処理が残っている。
- Box削除がphysical deleteでありtombstoneではない。
- Box削除時にdirect child Boxの処理がない。
- Vision用 `aiState` / `aiUpdatedAt` をv0.8 Business Pushで扱っている。
- Full Resync snapshot APIが未実装。

これらは現行実装の互換性を維持せず、本書および関連するv0.8設計へ統一する。

[目次](../目次.md) > アーキテクチャ > API設計 > Business / 同期API
