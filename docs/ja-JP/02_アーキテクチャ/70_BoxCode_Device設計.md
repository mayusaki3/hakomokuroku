[目次](../目次.md) > アーキテクチャ > Box.code（箱コード）/ Device（デバイス）設計

# Box.code（箱コード）/ Device（デバイス）設計

## 1. 前提

箱目録が扱うUser（利用者）、Device（デバイス）、Box（箱情報）、Item（物品情報）、BoxLocation（箱の場所情報）の基本関係は [システム構成 / 基本概念](./30_システム構成_基本概念.md) を参照。

本書では、そのうち複数DeviceからBoxを作成する際に必要となるBox.code（箱コード）の生成とDevice名前空間を定義する。

## 2. Box.code（箱コード）の形式

## 2.1 canonical format
```text
BX-<DevicePrefix4><LocalSequence4>
```

alphabet:
```text
ABCDEFGHJKMNPQRSTUVWXYZ23456789
```

legacy format compatibilityは持たない。Box.codeは作成時から正式値でimmutable。QR payloadもBox.codeそのもの。

## 3. DevicePrefix（デバイス接頭辞）
- serverがauthenticated User scope内でuniqueに割当
- 4文字固定
- device registrationとprefix allocationは1:N
- old prefixは永久予約し再利用しない
- secure random allocation
- abnormal collision時のみdeterministic fallback scan
- prefix空間枯渇時は `DEVICE_PREFIX_EXHAUSTED`

additional prefix requestは `deviceId + expectedActivePrefix`。expectedがactiveと一致する場合だけswitchし、不一致ならcurrent active prefixを返す。

## 4. LocalSequence（ローカル連番）
- device-local integer counter `0..923520`
- Box + Outbox + counter incrementを同一local transaction
- committed codeは再利用しない
- exhaustion時はonlineで同deviceIdへnew prefixを割り当てる

## 5. Backup / Restore（バックアップ / リストア）
`deviceId / activePrefix / LocalSequence counter` は通常backup対象外。RestoreでBox.codeを自動renumberしない。

Restoreは以下をrejectする。
- same Box.id + different code
- different Box.id + duplicate code
- noncanonical code

## 6. サーバー側の整合性保証
User scopeのBox.code unique constraintを残す。想定外duplicateは自動code変更せずintegrity error。

## 7. サーバースキーマ

DeviceはBusiness entityではなくUser配下のdevice namespace管理record。通常Sync/Backup対象外。

### 7.1 Device（デバイス）
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

### 7.2 DevicePrefix（デバイス接頭辞）
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

### 7.3 activePrefix整合性
SQLite/Prismaの単純FKだけでは `Device.activePrefix` が「同じdeviceIdに属するprefix」であることを十分表現しにくいため、service transactionで保証する。

Device作成/追加prefix切替は必ず:
1. DevicePrefixを確保
2. ownership `(userId,deviceId)` を確認
3. Device.activePrefixを更新
4. 旧active prefixをretired
5. commit

を1 server transactionで行う。

### 7.4 Prefix allocation
prefix candidateはCSPRNGで4文字生成し、`(userId,prefix)` unique insertを試行する。

collision時は再試行。異常にcollisionが継続する場合のみalphabet順deterministic scanで未使用prefixを探索する。

全923,521 prefixが使用済みなら `DEVICE_PREFIX_EXHAUSTED`。

DB unique constraintを最終防御とし、事前存在確認だけでuniqueを保証しない。

### 7.5 Prefix permanence
Deviceを「使わなくなった」状態にしてもprefixは解放しない。v0.8ではDevice削除APIを設けない。

これにより過去に発行済みBox.codeと将来発行codeの衝突を、Box tombstone/physical purge後も防止する。

## 8. Device（デバイス）API

### 8.1 共通
Device APIはauthenticated User scopeで動作する。requestにuserIdを含めない。

64-bit LocalSequenceはserver管理対象ではない。serverはprefix namespaceだけを管理する。

### 8.2 Register
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

### 8.3 Allocate next prefix
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

### 8.4 Lost-response idempotency
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

### 8.5 Concurrent allocate
同じDeviceへ複数requestが同時に到達しても、transaction内でcurrent activePrefixを再確認する。

最初の1requestだけがexpected一致でallocate可能。後続は `ACTIVE_PREFIX_CHANGED` としてcurrent activePrefixを返す。

### 8.6 Errors
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

### 8.7 Restore lockとの関係
Device register / prefix allocationはBusiness Restore applyの対象外だが、新しいBox.code発行能力に影響する。

v0.8ではRestore lock中:
- existing local prefixでoffline Box作成は可能
- server Device register / allocate-prefixは `409 RESTORE_LOCKED` として一時停止

これによりRestore中のserver namespace mutationを単純化する。

## 9. Local DeviceState（ローカルデバイス状態）

DeviceStateはUser-local IndexedDB `hk-local-v2-<User.id>` の `deviceState` storeに1 record保持する。

```text
id               "DEVICE"
deviceId         string
activePrefix     string
nextSequence     int
registeredAt     timestamp
prefixActivatedAt timestamp
updatedAt        timestamp
```

意味:
- `deviceId`: このlocal DB generationで使用するopaque device identity
- `activePrefix`: 次のBox.code発行に使用するserver allocated prefix
- `nextSequence`: 次に使用するsequence。範囲 `0..923520`
- timestampは診断用でcode correctnessには使用しない

DeviceStateは通常Backup/Restore対象外。

### 9.1 Initial setup
authenticated Userのlocal DBにDeviceStateが無い場合:
1. cryptographically randomなnew deviceId生成
2. onlineならregister API
3. activePrefix取得
4. `nextSequence=0` でDeviceState作成
5. Box作成可能状態へ遷移

register完了前はserver-issued prefixが無いため新規Box.codeを発行できない。

既存Box/Itemの閲覧・編集など、new Box.codeを必要としないoffline操作は別途可能。

### 9.2 Box creation transaction
新規Box作成時:
1. DeviceState読込
2. activePrefix + nextSequenceからcode生成
3. canonical code validation
4. Box作成
5. Outbox作成
6. `nextSequence += 1`
7. 同一IndexedDB transaction commit

transaction失敗時はBox/Outbox/counterのすべてrollback。

成功commitしたsequenceは、そのBoxを直後に削除しても再利用しない。

### 9.3 Sequence exhaustion
`nextSequence <= 923520` の間はその値を使用可能。

sequence 923520をcommitすると、local stateは「current prefix exhausted」として扱う。次のBox作成前にonlineでallocate-prefixを実行する。

new prefix取得後:
```text
activePrefix = server returned current activePrefix
nextSequence = 0
prefixActivatedAt = now
```

をatomicに保存してからBox作成を再開する。

offlineかつcurrent prefix exhaustedの場合、新規Box作成だけを停止する。他のoffline Business操作は継続可能。

### 9.4 Allocate response loss
allocate request送信後にresponseを失ってもlocal activePrefixを推測変更しない。

same `deviceId + expectedActivePrefix` でretryし、serverが返すcurrent activePrefixを採用する。

local DeviceState切替はserver response取得後だけ行う。

## 10. ローカルデータ消失 / 再セットアップ

### 10.1 Principle
DeviceState消失時、旧 `nextSequence` をserver Box一覧等から推測して復元しない。

理由:
- offline未Push Boxが存在した可能性をserverから判定できない
- sequence hole/reuse判定が不完全になる
- backupはDeviceStateを含まない

### 10.2 Complete local DB loss
`hk-local-v2-<User.id>` 自体が消失/再作成された場合:
1. Full ResyncでBusinessをserver canonicalから復元
2. **new deviceId** を生成
3. register APIでnew prefix取得
4. `nextSequence=0`
5. new DeviceStateとして開始

旧deviceId/prefixはserverに永久予約されたまま残し、再利用しない。

### 10.3 DeviceStateだけ欠損
Business DBが残っていてもDeviceStateだけ欠損/破損している場合、旧counterを推測復旧しない。

利用者へ「端末識別情報を再設定する」旨を表示し、online/authenticated後:
1. new deviceId
2. register
3. new prefix
4. nextSequence=0

で再setupする。

既存Business/Outboxは変更しない。

### 10.4 App reinstall / browser storage clear
local storage identityが保持されていることを前提にしない。DeviceStateが無ければ常にnew device setupとして扱う。

serverに旧Device recordが存在していても、自動的に旧deviceIdへ再接続しない。

### 10.5 Backup Restore後
backupからBusinessをRestoreしてもDeviceStateは復元しない。

同じlocal DBに既存DeviceStateが健全ならそのまま継続使用する。

新規環境へのRestoreでDeviceStateが無ければnew device setupを行う。Restoreされた既存Box.codeは変更しない。

### 10.6 Corruption safety
DeviceStateの以下が不正なら新規Box作成を禁止する。
- deviceId missing
- activePrefix noncanonical
- nextSequence範囲外
- server登録状態と明確に矛盾

自動counter resetやprefix書換えは行わず、new device setupへ誘導する。


## 11. Device（デバイス）管理UI

v0.8では旧版の「端末管理」という利用目的を維持し、現行Device / DevicePrefixへ置き換える。

Device managementで最低限表示する:
- device name（利用者が変更可能な表示名）
- deviceId（通常は省略表示し詳細で確認可能）
- activePrefix
- createdAt
- lastUsedAt
- current local deviceかどうか

device nameはBox.code生成規則やidentity判定に使用しない表示用metadataとする。同名を許容する。

v0.8ではDevice削除を提供しない。使わなくなったDeviceも割当済みprefixを解放・再利用しない。
DeviceStateを別Deviceへ手動で切り替える操作も提供しない。

旧SyncTokenのdevice label/revokeはこのDevice管理へそのまま移植しない。
認証session/tokenを失効させる機能を維持する場合は「ログイン中の端末 / セッション管理」として認証領域に分離し、Box.code Device recordやDevicePrefixを削除・変更しない。

## 12. Box.code（箱コード）/ Device（デバイス）設計完了
v0.8のBox.code / Device設計は確定。

実装工程ではDevice/DevicePrefix Prisma model、Device API、Dexie DeviceState、Box creation transactionへ反映する。

[目次](../目次.md) > アーキテクチャ > Box.code（箱コード）/ Device（デバイス）設計
