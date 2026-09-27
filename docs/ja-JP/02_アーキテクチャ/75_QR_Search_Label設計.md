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

## 11. 設計残件
- Search対象field・matching・offline挙動
- 24mm tape label layout
- print/export/browser capability fallback

[目次](../README.md) > アーキテクチャ > QR / Search / Label設計
