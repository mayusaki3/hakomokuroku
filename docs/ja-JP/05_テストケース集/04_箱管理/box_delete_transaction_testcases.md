<!--
HLDocS:LLM-MANAGED
doc_id: doc-20261020-232500Z-BOXD
lang: ja-JP
canonical_title: Box削除トランザクション テスト仕様
document_type: testspec
canonical_document: true
-->

# Box削除トランザクション テスト仕様

参照仕様: `docs/ja-JP/02_アーキテクチャ/40_DBスキーマ定義.md` §6, §6.1, §16.3, §17。

本書は既存仕様の検証条件を整理する。現時点では実装・テストのPASSを主張しない。

## テストケース

| testcase_id | 条件 | 期待結果 |
|---|---|---|
| BOX_DELETE-TC-01 | active Boxを削除 | 対象Boxは物理削除せず `deletedAt` を設定 |
| BOX_DELETE-TC-02 | 対象Boxにactive直下Itemが複数 | 直下Itemの `boxId=null`。Itemは削除しない |
| BOX_DELETE-TC-03 | 対象Boxにactive直下子Boxが複数 | 直下子Boxの `parentBoxId=null, locationId=null` |
| BOX_DELETE-TC-04 | 子Boxの下に孫Box・Itemが存在 | 孫以下の参照関係は変更しない |
| BOX_DELETE-TC-05 | 対象Boxに削除済み直下Item・子Boxが存在 | active対象だけ補正。削除済みレコードを復活・変更しない |
| BOX_DELETE-TC-06 | 変更された各Item/Boxと対象Box | 各レコードの `revision`, `contentHash`, `serverUpdatedAt`, `syncSeq` が整合し、各変更に対応する `SyncChangeLog` が存在 |
| BOX_DELETE-TC-07 | 複数レコードを一度に変更 | `syncSeq` は変更ごとに異なり、DB全体で単調増加 |
| BOX_DELETE-TC-08 | 処理途中に例外 | Box tombstone・子要素補正・同期メタデータ・変更ログ・sequence採番が一括ロールバック |
| BOX_DELETE-TC-09 | 別UserのBox IDを指定 | 別Userのデータは変更しない |
| BOX_DELETE-TC-10 | 同一Boxへの重複削除・revision不一致 | 既存のrevision/競合規則に従い、不正な二重更新を行わない |
| BOX_DELETE-TC-11 | 対象Boxに子要素なし | 対象Boxのtombstoneと同期変更ログだけが記録される |
| BOX_DELETE-TC-12 | 子Boxが別BoxLocationに置かれていない状態 | 削除後も `locationId=null` を維持し、存在しない場所IDを作らない |

## 実行条件

- 開発用 `dev.db` ではなく独立した一時SQLite DBを使用する。
- User A/B、親Box、子Box、孫Box、直下Item、削除済みレコードをfixtureとして用意する。
- 各ケースでDBのBusiness行・SyncSequence・SyncChangeLogを直接照合する。
- 失敗注入は同一transactionの途中で行い、処理前後の状態を比較する。
- 既存の同期API仕様と競合規則に従う。APIの新規プロトコルは本テスト仕様で定義しない。

## 実装状況（2026-10-20）

`apps/web/src/app/(authed)/boxes/[id]/delete/route.ts` はHTTP 501の仮実装。上記ケースは未実施。
