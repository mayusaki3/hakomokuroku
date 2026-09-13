# Box.code 現行実装調査・確定方針

更新: 2026-09-13
対象ブランチ: `develop`

## 調査目的
`Box.code`の正式仕様を確定する前に、現行実装の生成方式・QR利用・重複確認の差異を整理し、v0.8で採用する方式を確定する。

## 現行実装

### 1. `apps/web/src/lib/codegen.ts`
`newBoxCode()`は以下の形式を生成する。

```text
BX-<Base36時刻末尾5桁>-<Base36乱数5桁>
```

特徴:
- `Date.now().toString(36)`の末尾5文字を大文字化
- `Math.random().toString(36)`由来5文字を大文字化
- `RegisterClient.tsx`で使用

### 2. `apps/web/src/lib/id.ts`
`generateBoxCode()`は読み間違いにくい文字集合から生成する。

```text
ALPHABET = ABCDEFGHJKMNPQRSTUVWXYZ23456789
format   = BX-XXXXX
```

特徴:
- `O / I / L / 0 / 1`を除外
- `crypto.getRandomValues()`使用
- `/boxes/new`で使用

## QR関連

`QrLabel24.tsx`は`Box.code`文字列そのものをQR payloadとしている。これは確定済み仕様と一致する。

```text
QR payload = Box.code only
```

一方、`apps/web/src/lib/qrpayload.ts`の`buildQrPayload()`は`/b/<code>`を返しており、確定仕様と矛盾するため実装修正対象。

## 確定方針

### Box.code形式
既存互換は持たず、全データで次の単一形式のみを有効とする。

```text
BX-XXXXXXXX
```

suffix 8文字は次の読み違い防止文字集合を使用する。

```text
ABCDEFGHJKMNPQRSTUVWXYZ23456789
```

### 発行方式
**server割当DevicePrefix + device-local単調counter方式を採用する。**

suffix 8文字を次のように分割する。

```text
XXXX XXXX
│    └─ LocalSequence: 4文字
└────── DevicePrefix : 4文字
```

最終形式:

```text
BX-<DevicePrefix4><LocalSequence4>
```

#### DevicePrefix
- 認証済みUser scope内でserverが一意に割り当てる
- 4文字固定
- 文字集合はBox.codeと同じ
- 同じUserの別deviceには異なるprefixを割り当てる
- device初回登録時に取得してlocalへ永続保存する
- device data削除・再セットアップ時は新しいDevicePrefixを発行する
- 旧DevicePrefixを新deviceへ再利用しない

#### LocalSequence
- 4文字固定
- 同じ文字集合を基数として表現するdevice-local単調増加counter
- Box作成時にIndexedDB transaction内でcounterを進め、その値をBox.codeへ使用する
- 一度消費したsequenceを再利用しない
- Box削除でもcounterを巻き戻さない

### 運用上の意味
- Box作成時点で`Box.code`は正式確定する
- server Push成功を待たずQRを印刷可能
- 仮発行という状態を設けない
- 通常運用でcode collisionを理由にBox.codeを再発行しない
- canonical成立前後を問わずBox.codeはimmutableとして扱う
- Item等は`Box.id`を参照し、Box.codeを外部参照keyとして使わない

### 一意性の根拠

```text
異なるdevice
→ server保証によりDevicePrefixが異なる

同じdevice
→ LocalSequenceが再利用されない
```

したがって、User scope内でBox.codeは構造的に一意となる。

### 初回online要件との整合
箱目録では、新しいlocal DBを利用開始するにはonline認証が必要という方針が既にある。その初回online処理でDevicePrefixを取得できるため、以降はofflineでも正式Box.codeを生成できる。

### sequence枯渇
4文字sequenceは文字集合31文字を使うため、1 deviceあたり`31^4 = 923,521`個のcode空間を持つ。

sequence上限に達したdeviceでは新しいBox.codeを発行せず、ONLINE時に新DevicePrefixをserverから追加取得して新しいnamespaceへ切り替える。既存Box.codeは変更しない。

### server側の防御
構造上衝突しないことを前提とするが、DBにはUser scope内のBox.code unique constraintを残す。

想定外の重複が検出された場合:
- 既存Boxを上書きしない
- 自動的に別codeへ差し替えて同期成功扱いにしない
- integrity errorとして処理し、原因を調査可能にする

これは通常のcollision retryではなく、不変条件破壊の検出として扱う。

## 既存互換
既存互換は不要。

- 旧`BX-XXXXX`
- 旧`BX-xxxxx-yyyyy`
- その他legacy形式

はv0.8仕様では無効。開発中データは破棄または再作成で対応し、migration/legacy parserは作らない。

## 現行実装との差異
- `codegen.ts`方式は廃止対象
- `id.ts`の単純乱数生成も最終方式ではない
- DevicePrefixのserver払い出しとlocal永続化が必要
- device-local counter管理が必要
- Box生成とcounter更新を同一IndexedDB transactionで扱う必要がある
- `qrpayload.ts`の`/b/<code>`生成は削除・修正対象
- `QrLabel24.tsx`のcode直接QR化は維持できる

## 根拠
乱数のみの方式では、極低確率でもserver受理時のcollisionによって印刷済みQRの再発行が必要になる。DevicePrefixをserverがUser scope内で一意に払い出し、device内では単調counterを使うことで、offline作成時点からBox.codeを正式確定できる。

これにより「仮発行」「同期後のcode差し替え」「印刷済みQR無効化」という運用を避けられる。また、既に初回online認証を必須としているため、DevicePrefix取得のためだけに新たなonline制約を追加する必要もない。

## 次の判断候補
DevicePrefixの**device登録・失効・再セットアップ時のserverデータモデル**を確定する。

推奨候補:
- serverにUser配下のDevice登録recordを持つ
- `deviceId`はclient生成UUID、DevicePrefixはserver払い出し
- 同じdeviceIdで再ログインした場合は同じprefixを返す
- local dataが消えた場合は旧deviceIdを復元しようとせず、新deviceIdとして登録して新prefixを取得
- 旧Device record/prefixは再利用せず保持し、過去に発行したBox.codeとの一意性を永久に保つ
