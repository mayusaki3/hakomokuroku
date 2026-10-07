[目次](../目次.md) > アーキテクチャ > API設計 > Device API

# Device API

## 1. 目的

Box.code（箱コード）生成に使用するDevice（デバイス）とDevicePrefix（デバイス接頭辞）のserver APIを定義する。

Box.code、prefix allocation、LocalSequence、DeviceStateの規則は [Box.code（箱コード）/ Device（デバイス）設計](./70_BoxCode_Device設計.md) を参照。

## 2. 共通

Device APIはlogin必須。

User scopeはsessionから決定し、requestにuserIdを含めない。

DeviceはBusiness entityではないため通常Business Sync / Backupの対象外。

v0.8では次を提供しない。

- Device削除
- DevicePrefix削除
- prefix解放 / 再利用
- DeviceStateを別Deviceへ切り替える操作

## 3. Device登録

### POST /api/devices/register

request:

```json
{
  "deviceId": "opaque-client-generated-id",
  "name": "optional display name"
}
```

deviceIdはclientがcryptographically randomに生成する。

新規Deviceの場合、server transactionで:

1. deviceId validation
2. 未使用prefix確保
3. Device作成
4. DevicePrefix作成
5. activePrefix設定
6. commit

response:

```json
{
  "ok": true,
  "device": {
    "deviceId": "string",
    "name": "string or null",
    "activePrefix": "AB2C",
    "createdAt": "<RFC3339>",
    "lastUsedAt": "<RFC3339>"
  },
  "created": true
}
```

## 4. Registerの冪等性

同一authenticated User / deviceIdが既に存在する場合、新しいprefixを割り当てない。

```json
{
  "ok": true,
  "device": {
    "deviceId": "string",
    "name": "string or null",
    "activePrefix": "AB2C",
    "createdAt": "<RFC3339>",
    "lastUsedAt": "<RFC3339>"
  },
  "created": false
}
```

通信応答を失った場合、clientは同じdeviceIdでretryする。

retry時のnameは既存Device nameを暗黙上書きしない。名前変更は専用APIを使用する。

## 5. Device一覧

### GET /api/devices

authenticated Userに属するDeviceを返す。

response:

```json
{
  "ok": true,
  "devices": [
    {
      "deviceId": "string",
      "name": "string or null",
      "activePrefix": "AB2C",
      "createdAt": "<RFC3339>",
      "lastUsedAt": "<RFC3339>"
    }
  ]
}
```

default sort:

1. lastUsedAt descending
2. createdAt descending
3. deviceId ascending

serverは「current local device」を推測しない。

current表示はclient DeviceState.deviceIdとresponse deviceIdの一致で判断する。

## 6. Device詳細

### GET /api/devices/{deviceId}

User scope内のDeviceを返す。

管理UIでprefix履歴を表示する場合、DevicePrefixも返してよい。

概念response:

```json
{
  "ok": true,
  "device": {
    "deviceId": "string",
    "name": "string or null",
    "activePrefix": "D4EF",
    "createdAt": "<RFC3339>",
    "lastUsedAt": "<RFC3339>",
    "prefixes": [
      {
        "prefix": "AB2C",
        "allocatedAt": "<RFC3339>",
        "activatedAt": "<RFC3339>",
        "retiredAt": "<RFC3339 or null>"
      }
    ]
  }
}
```

## 7. Device表示名変更

### PATCH /api/devices/{deviceId}

request:

```json
{
  "name": "string or null"
}
```

nameは表示用metadata。

- identityに使用しない。
- Box.code生成に使用しない。
- 同名を許容する。
- trim + NFC canonicalizationを行う。
- 空文字はnullとして扱う。

成功時は更新後Deviceを返す。

## 8. 次prefix割当

### POST /api/devices/{deviceId}/prefixes/allocate

request:

```json
{
  "expectedActivePrefix": "AB2C"
}
```

expectedActivePrefixがcurrent activePrefixと一致する場合だけ新prefixを確保する。

成功:

```json
{
  "ok": true,
  "deviceId": "string",
  "previousPrefix": "AB2C",
  "activePrefix": "D4EF",
  "allocated": true
}
```

server transaction内で:

1. Device取得
2. current activePrefix再確認
3. new prefix確保
4. DevicePrefix作成
5. old prefix retired
6. Device.activePrefix更新
7. commit

## 9. Allocateの冪等性

response loss後に同じexpectedActivePrefixでretryし、server側では既にprefixが切替済みの場合、新prefixをさらに消費しない。

response:

```json
{
  "ok": true,
  "deviceId": "string",
  "activePrefix": "D4EF",
  "allocated": false,
  "reason": "active_prefix_changed"
}
```

clientは返されたactivePrefixを採用する。

同時allocateでも最初の1requestだけが切替可能。

## 10. Prefix exhaustion

User scopeの4文字prefix空間923,521個がすべて使用済みの場合:

```text
409 device_prefix_exhausted
```

retryだけでは解消しない。

LocalSequence exhaustion時にonlineで新prefixを取得できない場合、新規Box作成だけを停止する。

他のoffline Business操作は継続可能。

## 11. Restore lock

Restore lock中は次を一時停止する。

- Device register
- prefix allocate

response:

```text
409 restore_locked
```

Device一覧・詳細・名前変更はnamespace allocationを変更しないため継続可能。

## 12. lastUsedAt

lastUsedAtはserverが更新する。

Device APIの任意アクセスだけで毎回更新するのではなく、そのDeviceがnamespace操作等で実際に使用されたことをserverが確認できる操作で更新する。

client supplied timestampをauthorityにしない。

## 13. DeviceStateとの関係

server APIはLocalSequenceを管理しない。

client DeviceState:

```text
deviceId
activePrefix
nextSequence
registeredAt
prefixActivatedAt
updatedAt
```

DeviceState消失時にserverからnextSequenceを推測復元しない。

new deviceIdを生成し、Registerでnew prefixを取得する。

## 14. Error mapping

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | invalid_request | deviceId / prefix / name等が不正 |
| 401 | unauthorized | 未認証 |
| 404 | device_not_found | User scope内にDeviceが存在しない |
| 409 | device_prefix_exhausted | prefix空間枯渇 |
| 409 | restore_locked | Restore実行中 |
| 500 | internal_error | server内部エラー |
| 503 | temporarily_unavailable | 一時的に処理不能 |

network error / 5xxは同一requestをretryできるよう、Register / Allocateを冪等にする。

## 15. Security

- request userIdを受け付けない。
- deviceIdはopaque identifierとして扱う。
- Device存在確認をUser scope外へ漏らさない。
- prefix uniquenessはDB unique constraintを最終防御とする。
- prefix candidateはCSPRNGで生成する。
- Device nameをHTMLとして解釈しない。

## 16. 現行実装との差分

現行コードにv0.8 Device / DevicePrefix APIは存在しない。

旧SyncTokenのlabel / revoke機能はDevice管理へ移植しない。

認証session管理とBox.code Device namespace管理は別機能として扱う。

実装工程で本書と [Box.code（箱コード）/ Device（デバイス）設計](./70_BoxCode_Device設計.md) に従って新規実装する。

[目次](../目次.md) > アーキテクチャ > API設計 > Device API
