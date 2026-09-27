[目次](../README.md) > アーキテクチャ > PWA / Offline / Authentication設計

# PWA / Offline / Authentication設計

## 1. Principle
PWA application shell更新とUser Business data更新を分離する。

Service Worker/cache更新によってIndexedDB Business、Outbox、photo original、DeviceStateを削除・初期化してはならない。

application updateの失敗はlocal Businessの破壊理由にならない。

## 2. Install policy
PWA installは任意。browser tab利用とinstalled PWAでBusiness semanticsを変えない。

install可能性はbrowser capabilityに従う。

- install可能: browser/native install UIを利用可能
- install不可:通常web appとして利用継続
- install拒否:機能制限を設けない

独自の強制install requirementは設けない。

## 3. Application shell cache
Service Worker precache対象:
- application entry HTML/shell
- versioned JS/CSS bundle
- application icon/manifest
- offline画面に必要なstatic asset
- local UIに必須のbundled locale/resource

precache対象外:
- authenticated API response
- Sync Pull/Push response
- Restore response
- photo original/thumbnail Business binary
- User固有Business JSON

User dataをCache StorageへBusiness正本として保存しない。User dataはIndexedDB/local photo storesを使用する。

## 4. Runtime cache
v0.8ではauthenticated Business API responseを汎用runtime cacheへ保存しない。

static asset以外をruntime cacheする場合は、User dataを含まないpublic/reconstructible resourceだけに限定する。

network failure時に古いAPI responseをserver responseとして返すService Worker戦略は禁止。

## 5. Service Worker update
new Service Workerを取得しても、active applicationを即時強制reloadしない。

canonical flow:
```text
new version detected
  -> install/waiting
  -> UIに「更新があります」
  -> safe reload boundary確認
  -> new worker activate
  -> reload
  -> IndexedDB open/migration
  -> local state継続
```

safe reload boundary:
- local Business transaction実行中でない
- photo encode/write中でない
- Restore apply進行中でない
- Full Resync adopt transaction中でない
- print/export生成中でない

通常Outboxが存在すること自体はreload禁止理由にしない。Outboxはpersistentだからである。

## 6. Forced update
security/compatibility上serverが旧clientを拒否する必要がある場合でも、local dataを削除して更新しない。

旧clientでserver APIが非互換の場合:
1. local editingを必要に応じてread-only/block
2. pending local dataが保持されていることを確認
3. update/reloadを要求
4. migration後に通常Sync

protocol incompatibilityを理由にOutboxを破棄しない。

## 7. Cache versioning
application shell cacheはapplication build/version単位でnamespaceを分ける。

new worker activate後:
- current version cacheを保持
- obsolete application shell cacheを削除可能
- IndexedDB/cache以外のUser dataへ触れない

cache cleanup失敗はBusiness failureにしない。次回activation等で再試行可能。

## 8. Offline startup
network無しで起動した場合:
- cached application shellが利用可能なら起動
- current authenticated Userを安全に特定できるlocal session contextがある場合、そのUserのlocal DBを開く
- local Business閲覧/編集を許可する範囲はAuthentication sectionで定義
- server-only operationはoffline表示

application shell cacheが無く初回offline accessの場合はPWAとして起動保証できない。

## 9. Update check
browser/Service Worker標準update mechanismを使用する。

app foreground復帰時や通常起動時にupdate checkを行ってよいが、Business Syncと同一transaction/成功条件にしない。

update check failure:
- current cached versionで継続
- local Business/Outbox変更なし
- network復旧後再試行

## 10. Cache corruption/failure
static cache entry不足・decode failure等でcurrent shellが正常起動できない場合:
- network利用可能: current deploymentから再取得
- network不可: offline起動不能を表示

この場合もIndexedDBを自動削除しない。

Service Worker registration failure時は通常web appとしてnetwork利用を継続できる場合は継続する。

## 11. Version compatibility
application buildは少なくとも以下を内部的に識別可能にする:
- app version/build id
- supported local DB generation/schema version
- supported sync protocol version

Service Worker cache versionとlocal DB generationを同じ番号として扱う必要はない。

local schema migration規則はData Model設計を正とする。

## 12. Install/update UI
最低限:
- install可能なら非強制install導線
- update waitingなら「更新があります」
- safeなら「更新して再読み込み」
- unsafe operation中なら操作完了後までactivate/reloadを延期
- update失敗時はcurrent version継続可能なら継続

自動reloadで入力途中の画面を突然破棄しない。

## 13. Service Worker fetch strategy

### 13.1 Request classification
Service Workerはrequestを次のclassへ分類する。

1. navigation
2. versioned static asset
3. non-versioned static/application resource
4. authenticated API
5. photo/blob API
6. other external/network resource

Business correctnessに関わるrequestをstatic cache fallbackへ混在させない。

### 13.2 Navigation
same-origin navigationは **network-first with cached app-shell fallback**。

```text
navigation
  -> network available: current deployment response
  -> network failure: compatible cached app shell
  -> shell unavailable: offline startup unavailable
```

networkから取得したHTMLを無制限に世代混在させない。current buildのshell cacheへ属するものだけをcurrent shellとして扱う。

offline fallback HTMLがserver Business dataを埋め込んだsnapshotを持つ設計は禁止。

### 13.3 Versioned static assets
content hash/build hashをURLに持つJS/CSS/font/icon等は **cache-first**。

- precache manifestに含まれるassetはinstall時に取得
- missing cache entryはnetwork fallback
- hash URLはimmutableとして扱える
- response validation失敗時はcacheへ保存しない

new worker installは必須precache assetが揃わなければ成功扱いにしない。

### 13.4 Non-versioned static resources
manifest、icon alias等の非versioned resourceはstaleな世代固定を避けるためnetwork-firstまたは明示version keyで管理する。

offline時はcurrent known-good cacheへfallback可能。

### 13.5 Authenticated API
`/api/*` のauthenticated responseはService Worker Cache Storageへ保存しない。

特に:
- Sync Pull/Push
- Full Resync
- SyncConflict
- Restore
- Device registration/prefix
- User-scoped Business API

はnetwork-only。

offline時はsynthetic success/cached successを返さずnetwork unavailableとしてapplicationへ通知する。

### 13.6 Photo/blob API
server photo original/thumbnail/status/upload/confirmもService Worker Cache Storageへ保存しない。

local photo binaryはPhoto / Blob設計のIndexedDB storesを使用する。

GET photoをbrowser HTTP cacheが保持すること自体はplatform behaviorとして許容するが、Business correctnessはHTTP cache hitを前提にしない。

### 13.7 External resources
v0.8 application shellに必須のresourceをthird-party CDNへ依存させないことを原則とする。

外部resourceを使用する場合:
- offline availabilityを保証しない
- failureでBusiness dataを変更しない
- authentication token/User dataを外部originへ送らない

### 13.8 Install atomicity
new worker install時はcurrent buildの必須precache setをすべて取得・検証してからinstall成功。

途中失敗:
- new workerをactivateしない
- old active worker/cacheを維持
- current applicationを継続

partial new cacheは後でcleanup可能だがcurrent cacheとして参照しない。

### 13.9 Activation
activationはsafe reload boundaryで実施する。

activate後:
1. new cacheをcurrentとして扱う
2. client reload
3. app/local DB compatibility確認
4. obsolete shell cache cleanup

obsolete cache cleanupが失敗してもnew app/Business処理をrollbackしない。

### 13.10 Mixed-version tabs
複数tab/windowが存在する場合、new worker activationで旧tabを即時破壊しない。

reloadを要求された旧clientはserver protocol compatibility範囲なら継続可能。非互換ならserver operationをblockしupdate要求を表示する。

異なるapp versionが同一local DBを同時に危険なschemaで開く状態は避ける。local schema migration開始前に他clientへreload/close要求を出し、安全にexclusive migrationできない場合はmigrationを開始しない。

### 13.11 Update/install failure states
最低限UI state:
- UPDATE_AVAILABLE
- UPDATE_INSTALL_FAILED
- UPDATE_RELOAD_REQUIRED
- UPDATE_BLOCKED_BY_ACTIVE_OPERATION
- OFFLINE_SHELL_UNAVAILABLE

failure時にlocal Businessをresetするactionを既定導線にしない。

### 13.12 Recovery
Service Worker/cacheだけが壊れている場合:
- online: registration/cacheを再構築
- offline: known-good shellが無ければ起動不可
- IndexedDBは保持

Service Worker registrationを解除/再登録するrecoveryを実装しても、IndexedDB deletionと連動させない。

## 14. Authentication expiry / offline editing

### 14.1 Separate authentication from local ownership
server authentication sessionとlocal DB ownershipを分離する。

server session/tokenが期限切れでも、端末上で既に認証済みUser identityへ安全にbindingされたlocal session contextが残っている場合、そのUserのlocal DBをoffline modeで開ける。

local session contextは最低限:
```text
userId
lastAuthenticatedAt
localSessionVersion
```

を持つ。server token/password等のcredentialをBusiness DBへ保存しない。

### 14.2 Offline unlock boundary
v0.8でoffline editingを許可する条件:
- 過去にonline authentication成功済み
- local session contextのUser IDが明確
- 対応する `hk-local-v2-<User.id>` を特定可能
- explicit logout/user switchでlocal session bindingが解除されていない

条件を満たさない場合、network無しでUserを推測してDBを開かない。

「最後に存在するDBを自動選択」は禁止。

### 14.3 Session expired while online
server APIが `AUTH_REQUIRED` を返した場合:
- local Business閲覧は継続可能
- local Business編集は継続可能
- Business + Outbox commitは通常通り
- Push/Pull/photo upload/Device prefix allocation/Restore等server operationを停止
- UIを `AUTH_EXPIRED` stateへ
- 再認証を要求

未同期変更を削除・rollbackしない。

### 14.4 Session expires while offline
offline中はserver session validityを確認できない。

local session contextが有効ならoffline editingを継続し、server operationはnetwork unavailableとしてpending。

「offlineだからsessionが有効」とは判定しない。online復帰後の最初のserver accessで認証状態を確認する。

### 14.5 Operations allowed while auth expired
許可:
- local Box/Item/BoxLocation閲覧
- local create/update/delete
- local photo追加/削除/Undo
- local search
- local QR lookup
- local label preview/export
- local backup export（local dataだけで完結可能な範囲）

server access不要な操作だけを許可する。

不可/保留:
- Sync Push/Pull
- Full Resync
- server photo confirm/download
- Restore
- Device register/new prefix allocate
- server conflict resolve
- server canonical存在確認を必要とするQR not-found判定

### 14.6 Box creation and DeviceState
auth expired/offlineでもhealthy DeviceStateに未使用LocalSequenceがあれば新規Box作成可能。

activePrefixがexhaustedしnew prefix allocationが必要な場合はserver authenticationが必要なので、新規Box作成だけをblockする。

既存Businessの編集は継続可能。

### 14.7 Reauthentication
再認証成功時、返されたauthenticated User IDをlocal session contextのUser IDと比較する。

same User:
1. local session context更新
2. server operation再開
3. normal Syncを `Pull -> Outbox reapply -> required blob upload -> Push -> Pull` で実行
4. conflictは通常SyncConflict

different User:
- 現在開いている旧User DBへ新User credentialでSyncしない
- 旧User DBをclose
- User switch lifecycleへ遷移
- 新Userのlocal DBを別途open

cross-user Outbox移送は禁止。

### 14.8 Reauthentication failure
credential failure/network failure等で再認証できない場合:
- local data保持
- Outbox保持
- AUTH_EXPIRED/offline state継続
- destructive resetを提示しない

### 14.9 Explicit logout
explicit logoutはserver session/tokenを破棄し、current Userのlocal session bindingを解除する。

logoutだけではUser local DB/Outbox/photoを自動削除しない。

logout後は再認証なしにそのUser DBを自動openしてoffline editingを再開しない。

local data削除は別の明示的なdevice data removal操作として扱う。

### 14.10 Security boundary
offline local accessはserver authenticationの代替ではない。

端末OS/browser profile自体を共有する脅威に対する追加local encryption/PIN lockはv0.8必須範囲外。

ただしlogout後にlocal sessionを自動復活させないことで、application levelのUser切替境界を維持する。

## 15. User switch / local DB lifecycle

### 15.1 Principle
User switchはlocal Businessのmigrationではなく、active User scopeの切替。

```text
User A
  -> hk-local-v2-A close
  -> authenticated User B confirm
  -> hk-local-v2-B open/create
```

User AのrecordをUser B DBへcopy/moveしない。

### 15.2 Switch precondition
User switch開始時、新規Business操作の受付を一時停止する。

以下の短時間local operationが進行中なら完了または安全にabortしてから切替:
- IndexedDB Business + Outbox transaction
- photo local commit
- Box + DeviceState sequence transaction
- Full Resync adopt
- local schema migration

Restore apply request送信後などserver commit判定が必要なoperationは、そのUserのrecovery marker/stateを保持してDBをcloseする。別Userとして続きを実行しない。

### 15.3 Pending Outbox
Outboxの有無はUser switch禁止理由にしない。

User Aにpending Outboxがあっても:
- User A DB内に保持
- User Bへ移送しない
- backgroundでUser B credentialを使ってPushしない
- User Aへ再ログインした時に通常Sync再開

switch前の強制Syncは要求しない。offlineでもUser switch可能な範囲を維持する。

### 15.4 Photo state
User Aの:
- photoOriginals
- photoThumbnails
- photoUploadStates
- Undo/recovery dependency

はUser A scopeに保持する。

User Bから参照/再利用しない。

### 15.5 DeviceState
DeviceStateもUser-local。

同一physical browser/deviceでもUserごとに別deviceId/prefix stateを持てる。

User B DBにDeviceStateが無い場合:
- online/authenticatedなら通常Device setup
- offlineではnew prefixを取得できないためnew Box.code発行不可
- 既存User B Businessがlocalに存在する場合、その編集は可能

User A DeviceStateをUser Bへ流用しない。

### 15.6 Existing User DB
User Bの `hk-local-v2-B` が既に存在:
1. DB open
2. schema compatibility確認
3. local session bindingをBへ
4. local Businessを即時表示可能
5. onlineならnormal Sync

server canonicalを毎回Full Resyncしてから表示する必要はない。

### 15.7 New User DB
User B DBが存在しない:
1. `hk-local-v2-B` schema作成
2. `pullCursor=null`
3. online/authenticatedならFull Resync
4. DeviceState setup
5. local dataset構築後normal operation

Full Resync完了前はlocal dataset不完全表示を明示する。

### 15.8 Switch while offline
offline User switchは、切替先Userについてexplicit logoutで解除されていない有効なlocal session/profile bindingが端末に残っている場合のみ許可可能。

単にDB fileが存在することだけを根拠にUser Bへ切り替えない。

新しいUserへの初回switchはonline authentication必須。

### 15.9 Explicit logout
logout:
- current DBへのnew operation停止
- current DB close
- local session binding解除
- server credential/session破棄

保持:
- Business
- Outbox
- photo binaries/upload state
- SyncState/conflict
- DeviceState
- RestoreApplyMarker

logoutとdevice-local data deletionは別操作。

### 15.10 Remove local data
利用者が明示的に「この端末のUser dataを削除」した場合のみUser DBをphysical delete可能。

削除前:
- pending Outbox有無を確認
- unconfirmed photo/local-only data有無を確認
- server未反映dataがある場合はloss warning + explicit confirmation

削除対象は指定UserのDBのみ。他User DB/cacheを巻き込まない。

Service Worker app-shell cacheはUser DB削除対象ではない。

### 15.11 Background operation boundary
active authenticated User以外のUser DBに対してbackground Syncを行わない。

v0.8ではmulti-user background Syncを実装しない。

これによりcredential/User scope取り違えを避ける。

### 15.12 Multi-tab
同一browser profileで異なるUserを複数tabから同時利用することをv0.8の保証対象にしない。

User switch eventを同origin clientsへ通知し、旧Userを開いているtabには:
- operation停止
- reload/login要求
を行う。

旧tabが別User credentialでserver requestを送ることを防止する。

## 16. Storage quota / eviction

### 16.1 Data classes
local storageをloss impactで分類する。

**Class A: loss禁止 / primary local state**
- Business stores
- Outbox
- SyncState / SyncConflict
- DeviceState
- RestoreApplyMarker
- current Business/Outboxから参照されるphoto original
- server未CONFIRMED photo original
- active Undo/recovery dependencyのoriginal

**Class B: reconstructible / cache**
- photo thumbnail（originalから再生成可能な場合）
- obsolete Service Worker application shell cache
- rebuildable search/index derived data
- completed/expired temporary stagingで再取得可能なもの

Class Aをapplicationの自動quota cleanup対象にしない。

### 16.2 Persistent storage request
browserがStorageManager persistent storageを提供する場合、local Businessを保持するUserについてpersistent storageを要求してよい。

- granted: eviction risk低減として扱う
- denied/unsupported: application利用を禁止しない
- persistent=trueでもbackup代替とはみなさない

permission/stateをUI診断情報として表示可能。

### 16.3 Quota monitoring
StorageManager estimate等が利用可能ならusage/quotaを監視する。

固定byte thresholdだけに依存せず、少なくとも:
- normal
- storage pressure
- write failed/quota exceeded
をapplication stateとして扱う。

APIが利用不能なら実際のwrite failureを最終判定とする。

### 16.4 Cleanup order
storage pressure時のautomatic cleanup順:
1. unreferenced thumbnails
2. referenced thumbnailsでoriginalから再生成可能なもの
3. obsolete application shell cache
4. expired/completed temporary staging
5. Photo / Blob設計で削除条件を満たす30日超local orphan original

削除前に現在のBusiness / Outbox / Undo / recovery / upload dependencyを再確認する。

Class Aは削除しない。

### 16.5 Capacity-increasing operations
cleanup後も安全な空き容量を確保できない場合、既存dataを削除して書込みを継続しない。

容量増加が大きいoperationをblock:
- new photo ingestion
- backup restoreでlocal容量を大きく増やす処理
- Full Resync staging開始（必要容量を確保できない場合）

small Business editはtransaction commitが可能な限り許可する。ただしIndexedDB writeがQUOTA_EXCEEDEDならcommit失敗として扱い、BusinessとOutboxを部分commitしない。

### 16.6 Photo save failure
photo encode後、Blob保存またはparent Business transactionがquotaで失敗:
- PhotoRefをBusinessへ残さない
- partial blob/temporary dataをcleanup可能
- existing Business/Outboxを変更しない
- UIにstorage不足を表示

Photo / Blobのblob-first atomic boundaryを維持する。

### 16.7 Business write failure
Business + Outbox transactionがquota等でcommitできない場合:
- transaction全体rollback
- UI上で「保存済み」と表示しない
- retry前にcleanup可能なClass Bをcleanup
- それでも失敗なら利用者へstorage確保を要求

Outboxだけ、またはBusinessだけがcommitされた状態を許さない。

### 16.8 Browser/platform eviction
browser/OSによるorigin storage evictionはapplicationから完全には防止できない。

起動時にexpected local session bindingに対してDB不存在/必須store欠落を検知した場合:
- 自動的に「正常な空DB」とみなして未同期dataが無かったと断定しない
- local storage lossとして表示
- online/authenticatedならserver canonicalからFull Resync
- new DeviceState setup
- server未反映だったlocal-only Business/photoは復元不能の可能性を明示

失われたold DeviceStateのprefix/counterをBox一覧から推測・復元しない。

### 16.9 Partial corruption / partial loss
DBは存在するがstore/record整合性が壊れている場合、Data Modelのcorruption policyを適用し自動DB deleteしない。

特にOutbox safetyが不明な場合はdestructive reset禁止。

photo thumbnail欠落は再生成可能。
photo original欠落はPhoto / Blob recovery ruleに従い、参照中originalを「cache miss」と同等扱いしない。

### 16.10 Cache Storage eviction
Service Worker Cache Storageだけ失われ、IndexedDBが健全:
- onlineならapp shell再取得
- offlineでshell無しなら起動不能
- IndexedDB dataはresetしない

app shell lossとBusiness lossを同一recoveryにしない。

### 16.11 User notification
storage pressure時は少なくとも:
- storage容量不足
- 写真追加停止
- local data保護のため自動削除していないこと
- browser/device storage確保の案内
を表示可能にする。

browser storage eviction riskが高い/永続化不可の場合、backup exportを推奨導線として表示してよい。

### 16.12 Backup boundary
Backupはquota/eviction対策として有効だが、applicationが自動的にUser file systemへbackupを書き出したと仮定しない。

normal Backup/Restore仕様はBackup / Restore設計を正とする。

## 17. PWA / Offline / Authentication設計完了
v0.8のPWA / Offline / Authentication設計残件は完了。

browserごとのStorageManager/PWA/Service Worker capability差は実装/検証工程で確認する。

[目次](../README.md) > アーキテクチャ > PWA / Offline / Authentication設計
