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
CREATE
UPDATE
DELETE
```

serverは各operationについて現在のcanonical revision / contentHashと比較する。

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
      "revision": 2,
      "syncSeq": 123
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
GET /api/sync/pull?after=<syncSeq>
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

HTTP request全体に対する主なerror:

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | invalid_request | request形式不正 |
| 401 | unauthorized | 認証なし / session失効 |
| 409 | conflict | request全体を処理できない状態競合 |
| 429 | too_many_requests | rate limit |
| 500 | internal_error | server内部エラー |

個々のBusiness operationの競合やvalidation failureは、可能な限りHTTP全体の409ではなくPush resultの `CONFLICT` / `REJECTED` として返す。

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
