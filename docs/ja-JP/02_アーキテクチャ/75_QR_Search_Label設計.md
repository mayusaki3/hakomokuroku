[目次](../README.md) > アーキテクチャ > QR / Search / Label設計

# QR / Search / Label設計

## 1. QR payload
QR payloadはcanonical `Box.code` 文字列そのもの。

URL、JSON、User ID、server endpoint等は埋め込まない。

例:
```text
BX-AB2CDEF3
```

## 2. QR scan validation
scan resultはtrim後にBox.code canonical formatへ完全一致する場合だけlookup対象とする。

- canonical code → lookup
- `UNASSIGNED` → physical label対象外としてreject
- URL/JSON/任意文字列 → `INVALID_QR_CODE`
- legacy code → compatibilityを持たず `INVALID_QR_CODE`

大文字小文字の自動補正や類似文字補正は行わない。

## 3. Local-first lookup
QR読取後は現在ログインUserのlocal DBだけを最初に検索する。

```text
scan
  -> validate canonical code
  -> local boxes.code exact lookup
  -> active Box found: Box detailを開く
  -> tombstone found: deleted表示
  -> not found: online状態に応じて処理
```

Box.codeはUser内uniqueなので複数候補UIは不要。

## 4. Offline behavior
offlineでlocalにactive Boxが存在すれば、そのBoxを通常通り開く。pending local create/updateも表示対象。

localにtombstoneがあれば「削除済み」と表示し、通常detailへは遷移しない。

localに存在しない場合、server不存在とは断定しない。

表示:
```text
この端末のデータには見つかりません。
オンライン時に同期して確認してください。
```

offline not-foundから新規Boxを同じcodeで作成する機能は提供しない。Box.codeはDevice生成規則でのみ発行する。

## 5. Online not-found
local lookupで見つからずonline/authenticatedの場合、QR専用のserver Business lookup結果をlocal Businessへ直接insertしない。

canonical flow:
1. 通常incremental Pullを実行
2. Outbox reapplyを含む通常local adopt
3. local `boxes.code` を再lookup
4. foundならdetailへ
5. still not foundなら「登録されていません」と表示

incremental Pullが `FULL_RESYNC_REQUIRED` の場合は通常Full Resyncを実行後に再lookupする。

これによりQR経路だけがSyncChangeLog/cursor/Outbox規則を迂回することを防ぐ。

## 6. Sync blocked/error
QR lookupのためのsyncが失敗した場合:

- `AUTH_REQUIRED`: 「再ログイン後に確認してください」
- `RESTORE_LOCKED`: 「復元処理中のため現在確認できません」。local既存Boxは閲覧可能
- network/timeout/5xx: 「同期できないため、この端末のデータだけでは確認できません」
- `FULL_RESYNC_REQUIRED`: Full Resyncへ遷移し、完了後に同じcodeを再lookup
- local DB error: lookup不能としてstorage/local DB errorを表示

error時に「未登録」と断定しない。

## 7. Deleted Box
local/server canonical tombstoneに一致した場合は「削除済み」と表示する。

Box.codeはimmutableかつ再利用しないため、削除済みcodeを新しいBoxへ割り当てない。

serverでtombstoneがphysical purge済みの場合でもDevicePrefix/sequenceのcode generation規則によりcode再利用は行わない。

## 8. Pending local Box
この端末で新規作成済みだがserver未PushのBoxもQR lookup対象。

local exact lookupで見つかればonline確認を待たずdetailを開く。

UIには通常sync statusを表示し、未同期であることを確認可能にする。

## 9. Scanner capability
camera permission拒否、camera非搭載、browser capability不足の場合はQR scannerを開始できない。

その場合はBox.code手入力lookupをfallbackとして提供する。

手入力もQRと同じcanonical validation/local-first lookup規則を使用する。

## 10. Security boundary
QR codeは認証情報ではない。

読み取ったBox.codeだけで別UserのBoxを取得してはならない。server accessは常にauthenticated User scope。

QR payloadにUser identityを含めないため、別Userで同じBox.codeが存在する可能性は許容される。

## 11. Search

### 11.1 Scope
v0.8の通常検索は現在Userのlocal Businessを対象とする。

対象entity:
- Box
- Item
- BoxLocation

server search APIを検索の必須経路にしない。offlineでも同じ基本検索を使用できる。

### 11.2 Search fields
Box:
- `code`
- `name`
- `tags[]`
- `note`
- 参照先BoxLocationの `name`

Item:
- `name`
- `tags[]`
- `note`
- 所属Boxの `code`
- 所属Boxの `name`
- 所属BoxLocationの `name`

BoxLocation:
- `name`
- `note`

対象外:
- entity id
- userId
- `meta`
- photoId/photoHash
- photo binary
- createdAt/updatedAt/serverUpdatedAt
- revision/contentHash/syncSeq
- SyncConflict/Outbox等のcontrol data

### 11.3 Query normalization
検索入力:
1. trim
2. Unicode NFC
3. locale-independent case fold相当でcase-insensitive比較

Business保存値そのものは検索のために変更しない。

v0.8では:
- ひらがな/カタカナ自動同一視をしない
- 漢字から読み仮名を推測しない
- 全角/半角の積極的NFKC変換をしない
- typo/fuzzy/semantic searchをしない
- stemmingをしない

これらは検索結果の予測可能性を優先するため。

### 11.4 Matching
query全体のsubstring matchを基本とする。

例:
```text
query = "工具"
"電動工具" -> match
"工具箱"   -> match
```

複数語入力はUnicode whitespaceでtokenizeし、**AND** 条件。

各tokenはentityの検索対象fieldのどれか1つにsubstring matchすればよい。tokenごとに別fieldへmatchしてよい。

例:
```text
query = "BX-AB2C 工具"

Box.code = BX-AB2CDEF3
Box.name = 電動工具
-> match
```

空queryは検索結果一覧を返さず、検索未実行状態とする。

### 11.5 Tags
tagは各tag stringを個別fieldとしてsubstring matchする。

tag完全一致専用filterは通常free-text searchとは分離し、将来UI filterとして追加可能。v0.8 free-textではsubstring。

### 11.6 Deleted data
通常検索結果からtombstone entityを除外する。

ただしactive Item/Boxが参照するreserved `UNASSIGNED` はrelationship表示に利用可能。

削除済みデータを探す管理/履歴検索はv0.8通常検索対象外。

### 11.7 Pending local changes
local Businessが検索正本なので:
- 未Push create
- 未Push update
- Outbox reapply後のlocal state

を即時検索結果へ反映する。

local delete済みtombstoneは即時通常検索から除外。

### 11.8 Offline behavior
offlineでもlocal DB内の検索は通常通り動作する。

結果画面にはoffline状態を表示できるが、「server全体に対する完全な結果」とは表現しない。

Full Resync未完了のnew DBなどlocal datasetが未構築の場合:
```text
この端末のデータ同期が完了していないため、検索結果は不完全です。
```
と表示する。

### 11.9 Online synchronization
検索実行ごとにnetwork requestや強制Syncは行わない。

通常background/manual Syncによりlocal Businessが更新されたら検索結果を再評価する。

利用者が明示的に「同期して再検索」を実行できるUIは許可する。その場合も通常Syncを使用し、server search結果を直接localへ混入させない。

### 11.10 Result grouping
結果はentity typeを保持して表示する。

最低限:
- Box: code + name + location
- Item: name + parent Box code/name
- BoxLocation: name

同一entityを複数field matchで重複表示しない。

v0.8ではrelevance scoreによる順位付けを仕様化しない。安定した表示順として:
1. entity type
2. display name/code
3. entity idを最終tie-break

を使用する。

UIがentity type filterを提供してもmatching semanticsは変えない。

### 11.11 Performance boundary
v0.8はlocal datasetに対する単純検索を正とする。

実測で全件scanがUI性能要件を満たさない場合、normalized search indexをlocal derived dataとして追加可能。ただし検索対象field/matching semanticsは本書から変更しない。

検索indexはBusiness contentではなく再構築可能なlocal derived dataとする。

## 12. 設計残件
- 24mm tape label layout
- print/export/browser capability fallback

[目次](../README.md) > アーキテクチャ > QR / Search / Label設計
