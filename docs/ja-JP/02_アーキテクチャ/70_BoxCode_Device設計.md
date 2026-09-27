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

## 6. 設計残件
- Device / DevicePrefix server schema
- register / allocate-prefix API
- local device state schema
- local data消失・再setup時の具体手順

[目次](../README.md) > アーキテクチャ > Box.code / Device設計
