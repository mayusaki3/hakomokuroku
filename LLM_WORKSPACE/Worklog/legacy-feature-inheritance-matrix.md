# 箱目録 旧版機能継承マトリクス

更新: 2026-09-27
対象: `mayusaki3/hakomokuroku`
比較元: `develop` に残る旧実装
目的: v0.8再設計で旧版機能を意図せず欠落させないための棚卸し

> 本文書は設計作業用の追跡表であり、正式仕様の正本ではない。
> 各項目は正式docsへ反映した後に「反映済み」とする。

## 1. 分類

- **v0.8継承**: Vision以外の完成版としてv0.8に必要。
- **新仕様へ置換**: 旧機能の目的は維持するが、現在の設計へ置き換える。
- **v1.0**: Vision / LLM画像認識としてv1.0で完成させる。
- **対象外候補**: 旧版には存在するが、v0.8完成条件へ含めるか利用者確認が必要。
- **廃止**: 意図的に削除すると利用者確認済みのものだけに使用する。

## 2. 登録・Box・Item

| 旧版機能 | 旧実装例 | 現行方針 | 分類 | 状態 |
|---|---|---|---|---|
| 標準登録wizard | /register/* | Box→Items→Box photo→Label→Location | v0.8継承 | 設計済み |
| Box新規登録 | /boxes/new, /register/box | DevicePrefix方式でcode発行 | 新仕様へ置換 | 設計済み |
| Box一覧/詳細/編集 | /boxes, /boxes/[id] | local Business CRUD | v0.8継承 | 要UI最終確認 |
| Box削除 | /boxes/[id] | child Item→UNASSIGNED + tombstone | 新仕様へ置換 | 設計済み |
| Item新規登録 | /boxes/[id]/items/new | 登録wizardおよびBox詳細から登録 | v0.8継承 | 要UI最終確認 |
| Item一覧 | /items | User全Item一覧 | v0.8継承 | 要UI最終確認 |
| Box内Item一覧 | /boxes/[id]/items | Box所属Item一覧 | v0.8継承 | 要UI最終確認 |
| Box内Item絞り込み | /boxes/[id]/items の name/tag検索 | 必須機能としては継承しない。Box内はカテゴリ等による並べ替えを優先 | 廃止候補 | **方針確定: 検索の必要度は低い** |
| Item詳細 | /items/[id] | name/tags/note/photos/所属Box | v0.8継承 | 要UI最終確認 |
| Item取り出し/移動 | moveItem | boxId変更、取り出しはUNASSIGNED | 新仕様へ置換 | 設計済み |
| Item削除 | removeItem | tombstone | 新仕様へ置換 | 設計済み |

## 3. Photo

| 旧版機能 | 現行方針 | 分類 | 状態 |
|---|---|---|---|
| Item写真複数登録 | 0〜10 PhotoRef | v0.8継承 | 設計済み |
| Box写真登録 | 0〜10 PhotoRef | v0.8継承 | 設計済み |
| camera/file選択 | Web/PWA capabilityで入力 | v0.8継承 | 要UI最終確認 |
| WebP縮小/thumbnail | original 1600/q.85, thumb 400/q.8 | 新仕様へ置換 | 設計済み |
| 写真削除 | 即時Business update + 10秒Undo | 新仕様へ置換 | 設計済み |
| **写真並べ替え** | PhotoRef順序はbusiness-significant | v0.8継承 | **UI設計追記必要** |
| 写真原寸/preview表示 | local original/thumbnail利用 | v0.8継承 | 要UI最終確認 |

## 4. Search / QR

| 旧版機能 | 現行方針 | 分類 | 状態 |
|---|---|---|---|
| 全体text検索 | Box/Item/BoxLocation local search | 新仕様へ置換 | 設計済み |
| **Item検索** | Item name/tags/noteを検索対象 | v0.8継承 | **設計済み** |
| Box検索 | code/name/location/tags等 | v0.8継承 | 設計済み |
| BoxLocation検索 | 新Data Modelに合わせ追加 | 新仕様へ置換 | 設計済み |
| Box内Item絞り込み | 必須検索としては採用せず、カテゴリ等の並べ替えを採用 | 新仕様へ置換 | **方針確定: 複数tagsをカテゴリとしてgroup表示** |
| QR camera scan | canonical Box.codeを読み取る | 新仕様へ置換 | 設計済み |
| QR hit時Box+Item表示/遷移 | local-first lookup | v0.8継承 | 要UI最終確認 |
| QR local miss | offlineではserver不存在と断定しない | 新仕様へ置換 | 設計済み |
| 旧URL/hk: QR互換 | canonical code onlyへ変更 | 廃止候補 | **利用者確認必要** |

## 5. Label / Print

| 旧版機能 | 現行方針 | 分類 | 状態 |
|---|---|---|---|
| QR label | canonical Box.code | 新仕様へ置換 | 設計済み |
| tape印刷 | 24mm standard label | 新仕様へ置換 | 設計済み |
| A4 label印刷 | 現設計はbrowser print/PDF/PNG中心 | 対象外候補 | **利用者確認必要** |
| preview | same renderer input | v0.8継承 | 設計済み |
| printer-specific operation | optional adapter | 新仕様へ置換 | 設計済み |

## 6. Authentication / User / Device

| 旧版機能 | 現行方針 | 分類 | 状態 |
|---|---|---|---|
| User新規登録 | v0.8認証に必要 | v0.8継承 | **詳細UI/API再確認必要** |
| ID/password Login | v0.8認証に必要 | v0.8継承 | **詳細UI/API再確認必要** |
| Logout | session解除、local DB保持 | 新仕様へ置換 | 設計済み |
| TOTP login | 旧版MFA | v0.8継承候補 | **利用者確認必要** |
| TOTP setup/disable | 旧版MFA設定 | v0.8継承候補 | **利用者確認必要** |
| recovery code再発行 | 旧APIあり | v0.8継承候補 | **利用者確認必要** |
| User名 | User profile | v0.8継承候補 | **利用者確認必要** |
| User icon | camera/file/rotate/save | v0.8継承候補 | **利用者確認必要** |
| 旧device token label | Device/DevicePrefixへ再整理 | 新仕様へ置換 | **UI対応要確認** |
| token revoke/revokeAll | 旧APIあり | 対象外候補 | **新認証方式との整合確認必要** |
| User switch | User別DB lifecycle | 新仕様へ置換 | 設計済み |

## 7. Vision / LLM

v1.0へ延期すること自体は確定しているが、旧版機能を抽象的な「Vision」一語だけで失わないよう以下をv1.0継承対象として保持する。

| 旧版機能 | v1.0での扱い | 状態 |
|---|---|---|
| provider選択 none/OpenAI/Claude/Gemini | 継承候補 | 要正式要件化 |
| provider API key | secure storage方式を再設計して継承 | 要正式要件化 |
| 名前用prompt | 継承候補 | 要正式要件化 |
| タグ用prompt | 継承候補 | 要正式要件化 |
| メモ用prompt | 継承候補 | 要正式要件化 |
| Vision disable | 継承候補 | 要正式要件化 |
| test画像upload/camera | 継承候補 | 要正式要件化 |
| test result name/tags/note | 継承候補 | 要正式要件化 |
| **Item登録写真からAI認識** | **v1.0の中心機能として明示的に設計対象** | **設計未着手** |
| Box写真からAI認識 | Vision対象はBox/Item写真という現要件に従う | 設計未着手 |
| AI結果のフォーム反映/利用者修正 | AIを正本にせず候補として扱う方向で設計必要 | 設計未着手 |
| offline時のVision | server/provider access不能時のfallback要設計 | 設計未着手 |

## 8. Settings / Theme / Help

| 旧版機能 | 分類 | 状態 |
|---|---|---|
| Settings home | v0.8継承候補 | 要画面整理 |
| Theme選択 | 対象外候補 | **利用者確認必要** |
| Theme追加/編集 | 対象外候補 | **利用者確認必要** |
| wallpaper色/画像/camera | 対象外候補 | **利用者確認必要** |
| header/input/button等のtheme vars | 対象外候補 | **利用者確認必要** |
| Help page | v0.8継承候補 | **内容/位置づけ確認必要** |

「高度なテーマ機能の追加開発は対象外」は、既存Theme機能を削除する決定とは解釈しない。
維持・縮小・廃止は利用者確認後に確定する。

## 9. Backup / Sync / PWA

旧版のendpoint/tokenベースSync設定は、現在のUser認証・Outbox・Push/Pull設計へ置換する。
旧設定値/UIをそのまま継承しない。

Backup/Restore、offline、PWA、Syncは現行設計を正とし、旧実装は機能目的の確認資料として扱う。

## 10. 現時点で確認された設計漏れ

v0.8について、少なくとも以下は設計完了前に処理する。

1. Box内Item一覧は複数tagsをカテゴリとして利用する。通常一覧はItem重複なし、カテゴリ表示では複数tag groupへの重複表示を許容する。独立category/primary categoryは追加しない。
2. PhotoRef順序変更に対応する写真並べ替えUI。
3. User新規登録/Loginの最終UI/API境界。
4. MFA/TOTPをv0.8へ維持するか。
5. User名/User icon/device管理をv0.8へ維持するか。
6. 旧QR URL / `hk:` payload互換を廃止してよいか。
7. A4 label印刷を維持するか。
8. Theme既存機能を維持・縮小・廃止のどれにするか。
9. Helpをv0.8完成機能として整備するか。

v1.0については、Vision旧機能を正式要件へ具体化する。

## 11. 設計完了判定への影響

この棚卸しが完了するまで、`design-completion-checklist-v0.8.md` の以下を完了扱いにしない。

- 現行実装との差分一覧
- 要件→設計traceability
- 利用者による設計完了承認

次工程では「10. 現時点で確認された設計漏れ」を上から利用者確認し、確定内容を正式docsへ反映する。
