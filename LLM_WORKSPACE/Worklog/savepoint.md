# 箱目録 作業 SavePoint

更新: 2026-09-15
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`

## 1. 作業目的
箱目録を完成させる。HLDocS v0.7.0は作業管理・仕様整理に利用するが、その未完成・不整合をブロッカーにしない。

作業順: 要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証。重要判断には根拠を残す。現在は設計段階で、アプリケーションコードはまだ変更しない。

詳細記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`
補足調査: `LLM_WORKSPACE/Worklog/box-code-investigation.md`

## 2. 現在位置
**全体アーキテクチャ / データモデル / 同期設計の最終確定中。**

## 3. 主要確定事項

### リリース・業務
- v0.8 = Vision以外の完成版、v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真field = `thumbs`
- QR payload = canonical `Box.code`文字列そのもの
- Item「取り出す」= `boxId=UNASSIGNED`の通常UPDATE、Item「削除」= DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- BoxLocationはUser scoped独立flat master、Boxが`locationId`参照
- Vision対象はBox/Item写真のみ

### ユーザー分離・同期
- business identity=`(User.id, entityId)`。User間データは完全分離
- API scopeは認証session/tokenからserverが確定
- local DB=`hk-local-v2-<User.id>`
- server metadata=`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- baseRevision一致=通常更新。不一致時contentHash同一=UNCHANGED、異なる=CONFLICT
- SyncChangeLogがPull差分履歴の正本。syncSeqはDB全体で単調増加signed 64-bit
- local 3層=Business / SyncState / Outbox。local業務変更+Outboxは同一IndexedDB transaction
- 通常同期=Pull → Outbox reapply → Push → Pull
- tombstone物理削除可能=DELETE受理server時刻+30日、SyncChangeLog保持=90日
- cursor未設定の新規DBはFull Resync。snapshotSeq固定、type別paging、staging完了後のみ採用
- Outbox reapply順=BoxLocation → Box → Item

### timestamp / canonicalization
- `createdAt / updatedAt / deletedAt`はbusiness時刻、`serverUpdatedAt`はserver canonical更新時刻
- client business timestampは競合勝者・Pull順序・cursor・retentionに使わない
- RFC3339/ISO8601 offset必須、server保存UTC milliseconds
- contentHashはentity type固定business schemaをcanonical化後SHA-256
- metadata時刻、revision、syncSeq、contentHash自身、userId、entity idはhash対象外
- active/deleted状態はhash対象
- optional文字列はtrim、意味上値なしならnull
- tagsはtrim + NFC、空除去、exact重複除去、case-sensitive、決定的sort
- optional配列は意味上空なら`[]`
- 必須参照IDはnull/空/未指定不可。未設定参照はreserved `UNASSIGNED`
- `Box.name / Item.name / BoxLocation.name`等の必須表示文字列はtrim + NFC、trim後空はvalidation error、内部空白/case保持

### Box.code
**確定:** legacy互換なし。全データで単一形式のみ有効。

```text
BX-<DevicePrefix 4文字><LocalSequence 4文字>
```

使用alphabet:
```text
ABCDEFGHJKMNPQRSTUVWXYZ23456789
```

- `O / I / L / 0 / 1`は使用しない
- suffix 8文字 = DevicePrefix 4文字 + LocalSequence 4文字
- canonicalはASCII uppercase。scanner/input小文字はuppercase化後に検証
- `Box.code`は作成時点で正式確定し、仮発行を行わない
- QRは作成直後から正式ラベルとして印刷可能
- sync collisionを理由とするBox.code再発行は行わない
- canonical Box.codeはimmutable
- legacy形式はbackup/restore/scan/search/Push/Pull/Full Resyncを含め受理しない
- 開発中の旧形式データは破棄または再作成し、migrationは作らない

#### DevicePrefix / LocalSequence
- DevicePrefixはserverがUser scope内で一意に割り当てる4文字
- LocalSequenceはdevice内の4文字単調増加counter
- 1 prefixあたり最大`31^4 = 923,521` code space
- internal counterは整数`0..923520`
- 表示4文字は上記31文字alphabetによる固定長4桁base31表現
- 初回Boxはcounter=`0`をencodeして使用する
- Box作成transaction内で「現在counterをcodeに使用 → Box/Outboxを作成 → counterを次値へincrement」をatomicに行う
- transaction失敗時はBox/Outbox/counter更新をすべてrollbackする
- 正常commit後に同期・写真upload・UI処理等の後続処理が失敗しても、そのcodeは別Boxへ再利用しない
- commit済みBox自身を保持し、そのBoxの後続処理をretryする
- counterは巻き戻さず、一度commit済みの値を再利用しない
- counter=`923520`を正常使用した時点で当該prefixをlocal exhaustedとして扱う
- exhausted prefixでは次Boxを作成せず、onlineで同じdeviceIdへ新DevicePrefixを取得してから新counter=`0`で続行する
- 既存Box.codeはprefix切替時も変更しない
- DB上の`(User.id, Box.code)` unique制約は不変条件検査として保持する

根拠: 整数counterをlocal正本にし固定長base31へencodeすることで、文字列incrementの曖昧さを排除する。Box/Outbox/counterを同一transactionに含めることで、クラッシュやtransaction失敗時の二重採番・counterだけ先行する状態を防止する。commit済みcodeを再利用しないことで、作成直後から印刷可能なBox.codeの不変性を維持する。

#### Device登録record
**確定:** serverにUser配下のdevice registrationを持ち、prefix allocationは1対多で分離する。

Device registration:
```text
deviceId   : client生成UUID
createdAt
lastSeenAt
```

Device prefix allocation:
```text
deviceId
prefix
createdAt
retiredAt? / status
```

- `deviceId`はclientが初回セットアップ時にUUID生成し、localへ永続保存する
- serverは`(User.id, deviceId)`を一意として扱う
- DevicePrefixはUser scope内で一意
- 同じdeviceIdに複数DevicePrefixを時系列で割り当て可能
- Box新規作成には最新のactive prefixだけを使用する
- sequence枯渇時もdeviceIdは変更せず、同じdeviceIdへ新prefixを追加割当する
- 過去prefixはretired扱いにしても永久予約を維持し、別device・別allocationへ再利用しない
- 過去prefixで作成済みのBox.codeはそのまま有効で、変更しない
- local dataを消去して端末を再セットアップした場合だけ新deviceIdを生成し、新しいDevicePrefixをserverから取得する
- 旧deviceId/DevicePrefix/counterを推測・復元して再利用しない
- device registration / prefix allocationにはbusiness syncのrevision/contentHash/syncSeqを持たせず、Box/Item等とは別のsystem registration dataとして扱う
- `lastSeenAt`はserver管理時刻で、認証済み端末がdevice registration APIまたはsyncを正常利用した際に更新可能

根拠: `deviceId`を端末identityとして固定し、counter namespaceであるDevicePrefixを別recordへ分離することで、sequence枯渇を理由に端末identityを変更せずに済む。過去prefixを永久予約すれば、既存ラベルを維持したまま同一端末で採番空間を継続拡張できる。

#### DevicePrefix払い出しAPI
**確定:** 認証済みUserとclient `deviceId`でdevice registrationをidempotentに取得・作成し、必要時のみactive prefixを追加割当する。

- Userはsession/tokenからserverが確定する
- 初回device登録時は`deviceId`だけを受け取り、device registration + 最初のactive prefixをserver transaction内で作成する
- 同じdeviceIdの通常再登録/再ログインでは既存active prefixを返し、新規prefixを増やさない
- sequence枯渇時だけ、同じdeviceIdに対して明示的なprefix追加割当を要求する
- prefix追加割当requestは`deviceId`と`expectedActivePrefix`を送る
- `expectedActivePrefix`はclientが使い切った現在のactive prefixを指定する
- serverは認証User配下の当該deviceについて現在active prefixをtransaction内で取得し、`expectedActivePrefix`と比較する
- 一致した場合のみ旧active prefixをretiredにし、新しいprefixを割り当ててactiveへ切り替える
- すでに別requestでactive prefixが切替済みで不一致の場合は、さらにprefixを発行せず、現在のactive prefixを返す
- したがって同じ`expectedActivePrefix`による再送・多重request・response lossでも、1回の枯渇につき新prefixは最大1件だけ追加される
- prefix追加割当はserver transaction内で行い、旧active prefix retired化と新active prefix作成をatomicにする
- `(User.id, deviceId)`と`(User.id, prefix)`の一意制約をDBで保持する
- 1 deviceあたりactive prefixは常に最大1件
- 過去に払い出したprefixはallocation recordを保持し、永久予約として再利用しない
- 4文字namespaceが本当に枯渇した場合のみ`DEVICE_PREFIX_EXHAUSTED`を返す
- `DEVICE_PREFIX_EXHAUSTED`時は既存Boxの閲覧・編集・同期を継続可能とし、新しいprefixが必要なBox新規作成だけを停止する
- initial registrationは同じdeviceIdならidempotentに同じactive prefixを返す
- clientは新active prefix取得後にlocalへ永続保存し、そのprefix用LocalSequenceを`0`から開始する

#### DevicePrefix server割当方式
**確定:** prefix値はserverが暗号学的乱数で候補生成し、DB一意制約で確定する。

- 候補は`ABCDEFGHJKMNPQRSTUVWXYZ23456789`の31文字alphabetから4文字をcryptographically secure random sourceで生成する
- `(User.id, prefix)` unique制約を最終的な未使用判定とする
- candidate collision時は既存allocationを変更せず、server内部で別candidateを再抽選する
- 通常のcollisionはclientへ露出しない
- 全prefixの事前予約表やper-user巨大counterは持たない
- 実装上の再試行回数超過だけではnamespace枯渇と判定しない
- 再試行で候補確保できない場合は、当該Userで未使用prefixが実際に存在するかを別途確認する
- 未使用prefixが存在するならallocationを継続し、存在しないことを確認できた場合だけ`DEVICE_PREFIX_EXHAUSTED`とする
- namespace総数は1 Userあたり`31^4 = 923,521` prefix
- prefixの永久予約方針により、retired prefixも使用済み数へ含める

根拠: 乱数割当ならdevice数やprefix追加回数に依存する中央sequenceを管理せずに済み、User scope unique制約で一意性を保証できる。乱数collisionはnamespace使用率が上がれば増えるため、単純なretry上限を枯渇判定に使わず、`DEVICE_PREFIX_EXHAUSTED`は実際に未使用空間がない場合だけ返す。

#### DevicePrefix高使用率fallback
**確定:** 通常はsecure-random allocationを使用し、collisionが異常に続いた場合だけ決定的fallbackへ切り替える。

- 通常経路はsecure-random candidate生成 + `(User.id, prefix)` unique制約 + collision時再抽選
- random collisionが異常に続いた場合のみfallback確認へ入る
- fallbackでは当該Userに永久予約されている使用済みprefix集合を取得する。active/retiredを問わずすべて使用済みとして扱う
- 31文字alphabetによる4文字空間を決定的な順序で走査し、使用済み集合に存在しない最初のprefixをcandidateとする
- fallback candidateも最終的には同じ`(User.id, prefix)` unique制約で確定し、並行allocationとの競合が起きた場合は次の未使用候補へ進む
- 使用済みprefix数が`923,521`件に達していることを確認できた場合はnamespace完全枯渇として`DEVICE_PREFIX_EXHAUSTED`を返す
- 使用済み件数が`923,521`未満ならrandom retry失敗だけを理由に`DEVICE_PREFIX_EXHAUSTED`とはしない
- fallback走査は高使用率・異常collision時のみの例外経路であり、通常allocationごとに全namespaceを走査しない

根拠: random allocationは通常利用で軽量だが、namespace使用率が高くなるとcollision確率が上がる。使用済み集合と決定的走査をfallbackに限定することで通常時の簡潔さを保ちつつ、高使用率でもrandom collisionをnamespace枯渇と誤認せず、最後の未使用prefixまで確実に割り当てられる。

#### Box.code用local device stateのbackup/restore
**確定:** `deviceId / activePrefix / LocalSequence counter`は端末固有system stateとし、通常のユーザーデータbackup/restore対象には含めない。

- `deviceId`は端末identityなのでbackupへ含めない
- active/retired DevicePrefix allocation情報はserver-side system registration dataであり、通常backupへ含めない
- local `activePrefix`およびLocalSequence counterも通常backupへ含めない
- backup内の既存Box.codeはBoxのbusiness dataとしてそのまま保持・復元する
- 別端末へbackupをrestoreしても、復元先端末は自分自身の`deviceId`とserverから割り当て済みのactive prefixを使用して新規Boxを採番する
- restoreによって復元元端末のprefix/counter namespaceを複製しない
- 同一端末へのrestoreでもdevice stateはbackupから上書きせず、その端末に現在存在するdevice stateを維持する
- device stateが存在しない新規/再セットアップ端末ではonline認証後に新deviceIdを生成し、DevicePrefixをserverから取得してから新規Box作成を許可する
- restoreされた既存Box.codeが復元先deviceのprefixと無関係でも正常とし、Box.codeはimmutableのまま維持する

根拠: device stateまでbackup/restoreすると、同一`deviceId + prefix + counter` namespaceが複数端末へ複製され、offlineで同じBox.codeを発行できる危険がある。既存Box.codeだけをbusiness dataとして持ち運び、新規採番は各端末固有namespaceへ分離することで、backupの可搬性とBox.code一意性を両立する。

#### backup/restore時のBox.code整合性
**確定:** restoreは既存Box.codeを尊重し、Box.code不整合を自動修復しない。

- backup内Boxのbusiness identityは`Box.id`
- 同じ`Box.id`かつ同じ`Box.code`なら同一entityとしてmerge対象にできる
- 同じ`Box.id`で`Box.code`が異なる場合はBox.code immutable規則違反としてrestoreを拒否し、利用者対応が必要なエラーとする
- 異なる`Box.id`で同じ`Box.code`が存在する場合はUser scope unique違反としてrestoreを拒否し、利用者対応が必要なエラーとする
- restore処理はBox.codeを自動再発行・書換え・再採番しない
- backup内Box.code自身も現行canonical formatを満たさなければrestoreを拒否する
- merge時も既存canonical Box.codeを保持し、backup側/既存側どちらかのcodeへ勝手に寄せない

根拠: Box.codeは物理QRラベルへ印刷されるimmutable business identifierであり、restore都合で書き換えると現物ラベルとの対応が壊れる。同一IDのcode不一致や別IDのcode重複は単純なmerge競合ではなく識別子不変条件の破壊なので、自動修復より明示的拒否を優先する。

### 写真モデル
- dedupなし。写真ごとに独立`photoId`
- photoId=論理写真ID、photoHash=保存原画像bytesのSHA-256相当
- Photoは独立sync entityではなく親Box/Item/BoxLocationのphotos配列要素
- 写真差し替えは新photoId、順序はbusiness意味あり
- 各親0〜10枚
- 保存原画像=client生成WebP、長辺1600px、q0.85、拡大なし、EXIF補正、最大5MiB
- thumbnail=保存原画像からWebP、長辺400px、q0.8、最大256KiB
- original BlobはphotoId単位、blob-first upload、未参照30日でGC候補
- thumbnail bytesは親contentHash対象外

### BoxLocation / UNASSIGNED
- BoxLocationはUser scoped独立flat master
- reserved Box/BoxLocation `UNASSIGNED`を各Userで保証しclient変更禁止
- Box削除時子Item→UNASSIGNED、Location削除時子Box→UNASSIGNED
- parent DELETE + child correctionはserver 1 transaction

## 4. 現行実装との差異
- Prisma sync metadata/composite user identity不足、current Push ownership risk、Pull timestamp基準
- revision/contentHash/Outbox/SyncState/Conflict/Full Resync snapshot-staging未実装
- canonicalization/field normalization未実装
- IndexedDB固定`hk-local-v1`、BoxLocationモデル不一致
- Box.code生成が`id.ts`/`codegen.ts`の2系統。どちらも確定方式へ置換対象
- Device registration / 1:N DevicePrefix allocation / active-retired管理 / `expectedActivePrefix`付き追加割当API未実装
- DevicePrefix secure-random allocation / User-scope unique retry / deterministic fallback / exhaustion確認未実装
- LocalSequence整数counter・base31固定長encode・Box/Outbox/counter atomic transaction未実装
- device stateを通常backupから除外する仕様未実装
- restore時Box.code immutable/unique検証未実装
- `qrpayload.ts`の`/b/<code>`生成は確定仕様と矛盾
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- photoId独立モデル、Blob分離同期、server検証、thumbnail/original API・cache管理未実装

## 5. ロードマップ
0. 現状棚卸し — 完了
1. v0.8/v1.0要件仕様 — 主要方針確定
2. 全体アーキテクチャ確定 — **現在（最終点検）**
3. データモデル・同期仕様確定
4. 箱・アイテム・写真・置き場所仕様完成
5. QR・検索仕様完成
6. バックアップ・PWA・印刷仕様完成
7. 各機能テストケース完成
8. 不足テスト実装
9. 既存実装修正
10. v0.8完成・受入
11. Vision/LLM詳細要件・設計・テスト
12. Vision/LLM実装完成
13. v1.0完成・受入

## 6. 次のアクション
同期・データモデル設計の残る主要未定義を最終点検する。

次の判断候補: **backup restoreで同一Box.id + 同一Box.codeをmergeする場合の内容競合をどう扱うかを確定する。**

推奨候補:
- restoreは通常sync conflictとは別処理として扱う
- 同一Box.id + 同一Box.codeでbusiness contentが同じならUNCHANGED相当
- 内容が異なる場合は自動でupdatedAt勝者を選ばず、利用者に既存優先 / backup優先を選択させる
- 選択後は通常のlocal business updateとして反映し、Outboxを生成してserverと同期する
- backup側のsync metadata/revision/cursor等は持ち込まない

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
