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

## 13. 設計残件
- Service Worker cache対象/更新失敗時挙動の詳細確認
- auth session expiry中のoffline操作と再認証後sync
- User切替時local DB lifecycle
- storage quota/eviction時の通常data保護

[目次](../README.md) > アーキテクチャ > PWA / Offline / Authentication設計
