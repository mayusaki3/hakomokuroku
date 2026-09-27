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

## 7. 設計残件
- register / allocate-prefix API
- local device state schema
- local data消失・再setup時の具体手順

[目次](../README.md) > アーキテクチャ > Box.code / Device設計
