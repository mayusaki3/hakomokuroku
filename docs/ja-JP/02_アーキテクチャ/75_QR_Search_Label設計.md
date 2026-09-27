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

## 12. 24mm tape label

### 12.1 Purpose
24mm tape labelはBoxをphysical識別し、QR scanまたは目視code入力でBox detailへ到達するためのラベル。

primary identity:
- QR: canonical `Box.code`
- human-readable: canonical `Box.code`

Box nameは補助情報でありidentityではない。

### 12.2 Logical size
テープ幅は24mm。

印刷機固有の上下左右hardware margin、cut margin、feed量はlabel content layoutと分離し、print adapter側で扱う。

content safe areaは上下各2mmを最低余白として、中央20mm高以内に主要contentを配置する。

label長は固定しない。Box name長とprinter capabilityに応じて必要長を算出するが、v0.8の標準target lengthは **70mm** とする。

標準logical canvas:
```text
70mm x 24mm
```

### 12.3 Standard layout
横長1段構成。

```text
+--------------------------------------------------------------------+
|  +----------------+   BX-AB2CDEF3                                  |
|  |                |   電動工具                                     |
|  |       QR       |                                                |
|  |                |                                                |
|  +----------------+                                                |
+--------------------------------------------------------------------+
     QR area            text area
```

- left: QR
- right upper: Box.code
- right lower: Box.name
- QR/codeをnameより優先

### 12.4 QR
QR payloadはBox.codeそのもの。

QR logical size:
- **18mm x 18mm**
- quiet zoneをQR生成物内に含める
- square aspect ratio固定
- raster化時はmodule boundaryを整数pixelへ合わせる
- interpolation/blur禁止

QR error correctionは **M** を標準とする。

printer解像度によって18mmでmodule integer alignmentを満たせない場合は、18mm以下で最大の整数module sizeへ縮小して中央配置する。拡大補間はしない。

### 12.5 Box.code text
Box.codeは省略禁止。

- canonical stringをそのまま表示
- uppercase
- single line
- QR右側の最上位visual priority
- monospaced fontを優先するが必須ではない
- font fallbackでも全文が入るsizeへ縮小可能
- ellipsis禁止
- wrap禁止

目視入力できることを目的とする。

### 12.6 Box.name
Box.nameは補助表示。

- single lineを標準
- text area幅を超える場合はellipsis
- QR/codeを縮小してnameを優先しない
- nameが空になることはBusiness validation上ない
- emoji/unsupported glyph等はprinter/font fallback結果に依存し、QR/code identityには影響させない

v0.8ではlabel上へLocation、Item count、tag、noteを追加しない。

### 12.7 Reserved Box
reserved `UNASSIGNED` Boxはphysical label print対象外。

### 12.8 Deleted Box
tombstone Boxの新規label生成は禁止。

既にphysical labelが残っている場合、scanするとQR lookup規則により「削除済み」となる。

### 12.9 Pending local Box
localで作成済みかつ未PushのBoxもlabel生成可能。

Box.codeはlocal atomic allocation時点で確定・immutableなのでserver Push完了を印刷条件にしない。

UIには未同期状態を表示し、利用者が認識できるようにする。

### 12.10 Rendering
label rendererへのBusiness inputは最低限:
```text
boxCode
boxName
```

rendererはQR payloadをboxCodeから生成する。

Business photo等をlabel rendererへ渡さない。

logical render outputはprinter adapterから独立したvector-first representationを推奨し、最終raster化は出力先解像度に合わせる。

### 12.11 Print verification
実装/テストでは最低限:
- QR scan可能
- Box.code全文目視可能
- 24mm幅からcontentがはみ出さない
- long Box.nameでもQR/code layout不変
- printer margin差でQRがclipされない

を確認する。

特定printer機種のhardware marginはadapter/capability testで別途検証する。

## 13. Print / Export capability

### 13.1 Principle
label rendererとoutput mechanismを分離する。

```text
Box Business
  -> logical label renderer
  -> output
       |- browser print
       |- PDF export
       |- image export
       \- optional printer adapter
```

特定printer SDK/APIをv0.8の必須依存にしない。

### 13.2 Browser print
v0.8の標準print pathはbrowser print。

- print専用document/viewを生成
- logical size 70mm x 24mmをCSS print sizeへ指定
- application navigation/header/footerを印刷対象外
- browserのheader/footer追加は可能なら無効化を案内
- scaleは100%を基本とし、fit-to-pageによる自動縮小を避ける
- printer hardware margin/cut/feedは利用者のdriver/printer設定またはadapter側責務

Web applicationからOS print dialogを自動確定しない。

### 13.3 PDF export
browser printが不適切/利用不能な場合のportable fallbackとしてPDF exportを提供する。

- page size: 70mm x 24mm
- 1 Box = 1 pageを標準
- QRはvectorまたはlossless integer-aligned representation
- Box.codeは全文保持
- Box.name ellipsis ruleはlabel layoutと同一
- PDF metadataへBusiness secretを追加しない

複数Box一括exportを将来提供する場合も1 label = 1 logical pageを維持する。

### 13.4 Image export
画像出力はPNGを標準fallbackとする。

- transparentではなく明示的background
- output解像度はtarget printer DPI指定可能
- DPI不明時は高解像度logical renderから生成
- QR moduleを整数pixel alignment
- JPEGは禁止しないがQR labelの標準exportには使用しない

画像exportはprinter driverや外部label softwareへ渡す用途。

### 13.5 Optional printer adapter
printer vendor SDK、WebUSB、WebBluetooth、native bridge等はoptional adapter。

adapter contract:
- logical label input/outputを変更しない
- Box.code/QR payloadを書き換えない
- hardware margin/cut/feed/raster DPI等だけをdevice capabilityへ変換
- unsupported deviceでapplication全体をfailureにしない

v0.8では特定vendor printerへのdirect-print対応を完成条件に含めない。

### 13.6 Capability detection
UIは利用可能なoutput pathだけを有効表示する。

最低限:
- browser print可能 → 「印刷」
- file generation/download可能 → 「PDF保存」「PNG保存」
- optional adapter available → device-specific print action

capability判定不能時にdirect printを推測して実行しない。

### 13.7 PWA / mobile
installed PWAでもbrowser/OSがprintを提供する場合はbrowser printを利用可能。

print APIがない、またはPWA/browser制約で安定しない場合:
1. PDF export
2. PNG export
の順でfallbackを提示する。

mobileで外部share/save UIを利用する場合も生成物のlabel layoutは同一。

### 13.8 Permission / API failure
optional device APIでpermission拒否・device disconnect・unsupportedが発生してもlabel Business dataは変更しない。

表示例:
- printer permission denied
- printer disconnected
- direct print unsupported

その場でPDF/PNG fallbackを選択可能にする。

### 13.9 Offline
label rendering、PDF/PNG exportは必要resourceがlocal cache済みならoffline利用可能とする。

QRはBox.codeからlocal生成するためserver access不要。

browser printもOS/browserがoffline printを許せば利用可能。

optional adapterがnetwork/cloud vendor serviceを必要とする場合、そのadapterだけoffline unavailableとする。

### 13.10 Failure boundary
print/export failureはBusiness transactionではない。

- Box/Outboxを変更しない
- sync stateを変更しない
- Box.codeを再発行しない
- print成功履歴をBusiness metadataへ記録しない

v0.8ではpersistent print historyを持たない。

### 13.11 Preview
print/export前にlogical label previewを表示する。

previewは同じrenderer inputを使い:
- QR
- Box.code
- Box.name truncation
を確認可能にする。

previewとexportで別layout implementationを持たない。

## 14. QR / Search / Label設計完了
v0.8のQR / Search / Label設計残件は完了。

特定printer機種のadapter実装・実機検証は実装/検証工程で扱う。

[目次](../README.md) > アーキテクチャ > QR / Search / Label設計
