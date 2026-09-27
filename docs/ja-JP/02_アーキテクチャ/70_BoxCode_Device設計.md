[目次](../README.md) > アーキテクチャ > Box.code / Device設計

# Box.code / Device設計

## 1. canonical format
```text
BX-<DevicePrefix4><LocalSequence4>
```

alphabet:
```text
ABCDEFGHJKMNPQRSTUVWXYZ23456789
```

legacy format compatibilityは持たない。Box.codeは作成時から正式値でimmutable。QR payloadもBox.codeそのもの。

## 2. DevicePrefix
- serverがauthenticated User scope内でuniqueに割当
- 4文字固定
- device registrationとprefix allocationは1:N
- old prefixは永久予約し再利用しない
- secure random allocation
- abnormal collision時のみdeterministic fallback scan
- prefix空間枯渇時は `DEVICE_PREFIX_EXHAUSTED`

additional prefix requestは `deviceId + expectedActivePrefix`。expectedがactiveと一致する場合だけswitchし、不一致ならcurrent active prefixを返す。

## 3. LocalSequence
- device-local integer counter `0..923520`
- Box + Outbox + counter incrementを同一local transaction
- committed codeは再利用しない
- exhaustion時はonlineで同deviceIdへnew prefixを割り当てる

## 4. Backup / Restore
`deviceId / activePrefix / LocalSequence counter` は通常backup対象外。RestoreでBox.codeを自動renumberしない。

Restoreは以下をrejectする。
- same Box.id + different code
- different Box.id + duplicate code
- noncanonical code

## 5. server defense
User scopeのBox.code unique constraintを残す。想定外duplicateは自動code変更せずintegrity error。

## 6. Server schema

DeviceはBusiness entityではなくUser配下のdevice namespace管理record。通常Sync/Backup対象外。

### 6.1 Device
```text
userId         string      PK(1), FK -> User.id
deviceId       string      PK(2)
activePrefix   string      required
createdAt      timestamp   required
lastUsedAt     timestamp   required
```

constraints:
- PRIMARY KEY `(userId,deviceId)`
- FK `userId -> User.id ON DELETE CASCADE`
- `activePrefix` は同じDeviceに属するDevicePrefixの1つでなければならない
- deviceIdはclientが初回setup時にcryptographically randomなopaque IDとして生成
- serverはauthenticated User scopeを使用し、payload userIdは受け付けない
- deviceId自体は別User間で同一でもよい

### 6.2 DevicePrefix
```text
userId         string      PK(1), FK -> User.id
prefix         string      PK(2)
deviceId       string      required
allocatedAt    timestamp   required
activatedAt    timestamp   required
retiredAt      timestamp?  optional
```

constraints:
- PRIMARY KEY `(userId,prefix)`
- FK `(userId,deviceId) -> Device(userId,deviceId) ON DELETE CASCADE`
- prefixはcanonical alphabetの4文字
- prefixはUser scopeで永久予約
- 同一Deviceは複数prefixを持てる
- activePrefix以外のprefixはretired扱いにできるがrecordを削除・再割当しない
- User account自体のphysical delete以外ではDevicePrefixをphysical deleteしない

indexes:
- `(userId,deviceId,allocatedAt)`
- `(userId,deviceId,retiredAt)`

### 6.3 activePrefix整合性
SQLite/Prismaの単純FKだけでは `Device.activePrefix` が「同じdeviceIdに属するprefix」であることを十分表現しにくいため、service transactionで保証する。

Device作成/追加prefix切替は必ず:
1. DevicePrefixを確保
2. ownership `(userId,deviceId)` を確認
3. Device.activePrefixを更新
4. 旧active prefixをretired
5. commit

を1 server transactionで行う。

### 6.4 Prefix allocation
prefix candidateはCSPRNGで4文字生成し、`(userId,prefix)` unique insertを試行する。

collision時は再試行。異常にcollisionが継続する場合のみalphabet順deterministic scanで未使用prefixを探索する。

全923,521 prefixが使用済みなら `DEVICE_PREFIX_EXHAUSTED`。

DB unique constraintを最終防御とし、事前存在確認だけでuniqueを保証しない。

### 6.5 Prefix permanence
Deviceを「使わなくなった」状態にしてもprefixは解放しない。v0.8ではDevice削除APIを設けない。

これにより過去に発行済みBox.codeと将来発行codeの衝突を、Box tombstone/physical purge後も防止する。

## 7. Device API

### 7.1 共通
Device APIはauthenticated User scopeで動作する。requestにuserIdを含めない。

64-bit LocalSequenceはserver管理対象ではない。serverはprefix namespaceだけを管理する。

### 7.2 Register
`POST /api/devices/register`

request:
```json
{
  "deviceId": "opaque-client-generated-id"
}
```

新規device:
1. deviceId validation
2. 未使用prefixを1つ確保
3. DevicePrefix作成
4. DeviceをそのprefixをactivePrefixとして作成
5. 1 transaction commit

response:
```json
{
  "deviceId": "...",
  "activePrefix": "AB2C",
  "created": true
}
```

既存 `(User,deviceId)` への再送はidempotent:
- new prefixを割り当てない
- current activePrefixを返す
- `created=false`

通信応答喪失後も同じdeviceIdでregisterをretryする。

### 7.3 Allocate next prefix
`POST /api/devices/{deviceId}/prefixes/allocate`

request:
```json
{
  "expectedActivePrefix": "AB2C"
}
```

server transaction:
1. Deviceを取得
2. current activePrefix確認
3. expected == currentならnew prefix確保
4. DevicePrefix作成
5. old prefix.retiredAt設定
6. Device.activePrefix=new prefix
7. commit

success:
```json
{
  "deviceId": "...",
  "previousPrefix": "AB2C",
  "activePrefix": "D4EF",
  "allocated": true
}
```

### 7.4 Lost-response idempotency
allocate成功後responseをclientが受信できず、同じrequestをretryした場合、server current activePrefixは既にexpectedと異なる。

この場合new prefixを追加割当せず:
```json
{
  "deviceId": "...",
  "activePrefix": "D4EF",
  "allocated": false,
  "reason": "ACTIVE_PREFIX_CHANGED"
}
```
をHTTP 200で返す。

clientは返されたcurrent activePrefixを採用する。

これにより同一expectedActivePrefixからのretryでprefixを複数消費しない。

### 7.5 Concurrent allocate
同じDeviceへ複数requestが同時に到達しても、transaction内でcurrent activePrefixを再確認する。

最初の1requestだけがexpected一致でallocate可能。後続は `ACTIVE_PREFIX_CHANGED` としてcurrent activePrefixを返す。

### 7.6 Errors
Register:
- `400 INVALID_DEVICE_ID`
- `401 AUTH_REQUIRED`
- `409 DEVICE_PREFIX_EXHAUSTED`
- `500 INTERNAL_ERROR`
- `503 TEMPORARILY_UNAVAILABLE`

Allocate:
- `400 INVALID_PREFIX`
- `401 AUTH_REQUIRED`
- `404 DEVICE_NOT_FOUND`
- `409 DEVICE_PREFIX_EXHAUSTED`
- `500 INTERNAL_ERROR`
- `503 TEMPORARILY_UNAVAILABLE`

network/5xxはsame request retry可能。

`DEVICE_PREFIX_EXHAUSTED` はretryで解消しないUser-scope namespace exhaustion。

### 7.7 Restore lockとの関係
Device register / prefix allocationはBusiness Restore applyの対象外だが、新しいBox.code発行能力に影響する。

v0.8ではRestore lock中:
- existing local prefixでoffline Box作成は可能
- server Device register / allocate-prefixは `409 RESTORE_LOCKED` として一時停止

これによりRestore中のserver namespace mutationを単純化する。

## 8. 設計残件
- local device state schema
- local data消失・再setup時の具体手順

[目次](../README.md) > アーキテクチャ > Box.code / Device設計
