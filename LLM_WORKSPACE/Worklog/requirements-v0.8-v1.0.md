# 箱目録 v0.8 / v1.0 要件整理（作業記録）

## 1. リリース方針

### v0.8 必須
- 認証
- 箱管理
- アイテム管理
- 写真管理
- 置き場所管理
- QR発行・読み取り
- 検索
- IndexedDB
- オフライン
- サーバー同期
- バックアップ / リストア
- QRラベル印刷
- PWA

### v1.0 必須
- v0.8 全機能
- Vision / LLM画像認識

### 対象外
- 高度なテーマ機能の追加開発
- v1.0必須ではないUIカスタマイズ

## 2. 正式登録フロー

正式な標準登録順序は次のとおり。

1. 箱登録
2. アイテム
3. 箱写真
4. ラベル
5. 場所

現行 `apps/web/src/app/(authed)/register/RegisterClient.tsx` の順序を正式仕様の基礎とする。

## 3. アイテムの取り出しと削除

アイテムには異なる2操作を持たせる。

### 3.1 取り出す
- 「箱から取り出した」を表す。
- アイテム自体は削除しない。
- `boxId` を仮置き箱 `UNASSIGNED` に変更する。
- 名前、タグ、メモ、写真等は保持する。

### 3.2 削除する
- 「アイテムを捨てた」を表す。
- `deletedAt` を設定して論理削除する。
- 同期による削除伝播完了後に物理削除可能とする。

UIでは「取り出す」と「削除する」を併用し、意味を明確に区別する。

## 4. 箱削除

- 箱削除時、その箱のアイテムは削除しない。
- 所属アイテムは仮置き箱 `UNASSIGNED` に移動する。
- 箱自体は `deletedAt` を設定して論理削除する。
- 箱に紐づく置き場所情報も削除対象として同期する。

## 5. 写真保存方式

正式フィールドは `thumbs` とする。

現行 `apps/web/src/lib/db.ts` と Prisma schema の `thumbs` を基準とする。
`apps/web/src/lib/backup.ts` に残る `photoThumbs` は実装修正対象。

## 6. 同期競合方式

- `updatedAt` が新しい側を採用する。
- `updatedAt` が古い側は上書きしない。
- `updatedAt` が同一で内容が異なる場合は競合とする。
- 競合時は自動上書きせずユーザー確認とする。
- v0.8ではレコード単位でローカル版 / サーバー版を提示して採用側を選択する方針。

## 7. 削除伝播

論理削除フィールドは `deletedAt` に統一する。

基本ライフサイクル:

1. 削除操作
2. `deletedAt` 設定
3. 同期対象としてPush
4. 他端末がPullして削除状態を反映
5. 削除伝播完了後に物理削除可能

物理削除の実施条件・保持期間は詳細設計で確定する。

## 8. バックアップID / ハッシュ

バックアップ時に既存IDを保持する。
各データ単位に内容ハッシュを付与する。

リストア時の基本ルール:

- IDが存在しない: バックアップのIDを維持して復元
- ID一致 + ハッシュ一致: 同一データと判断しID維持
- ID一致 + ハッシュ不一致: 別データと判断し、インポート側へ新IDを発行
- ID不一致: バックアップ側IDを維持

箱IDを再発行した場合は `Item.boxId`、`BoxLocation.boxId` 等の参照を同一処理内で再マッピングする。

ハッシュ計算対象にはIDを含めない方針。

## 9. Vision / LLM

現在実装されているVision設定をベースにする。

現行の主な基盤:
- `VisionProvider`: none / openai / claude / gemini
- `UserSetting.visionApiKeyEnc`
- `visionPromptName`
- `visionPromptTags`
- `visionPromptNote`
- Vision設定画面
- 設定 get / save / disable / test API

v1.0ではこの基盤を再利用して、写真解析から候補情報生成・ユーザー確認・登録まで完成させる。

## 10. QR内容

QR payload は箱コードのみとする。

`QR payload = Box.code`

URLは格納しない。

## 11. 現在確認済みの重要な実装差異

### バックアップ
`apps/web/src/lib/backup.ts` は以下の問題を持つ。
- `thumbs` ではなく `photoThumbs` を扱う箇所がある。
- `BoxLocation` がバックアップ対象に含まれていない。
- replaceリストアでIDを無条件再発行している。

### 同期
現行 `apps/web/src/lib/sync.ts` / `app/api/sync/*` は基本Push/Pullのみ。
- `deletedAt` 未対応
- 同時刻競合のユーザー確認未対応
- Push APIは受信データの `updatedAt` 比較なしにupsertする。
- Prismaの `@updatedAt` によりサーバー更新時刻がサーバー側で再設定されるため、端末側 `updatedAt` を競合判定基準として使うには設計変更が必要。

### データモデル
現行 Dexie / Prisma の Box、Item、BoxLocation に `deletedAt` はない。

## 12. 要件ID（現在の整理）

主な体系:
- REQ-BOX-xxx
- REQ-ITEM-xxx
- REQ-REG-xxx
- REQ-PHOTO-xxx
- REQ-LOC-xxx
- REQ-QR-xxx
- REQ-SEARCH-xxx
- REQ-OFFLINE-xxx
- REQ-SYNC-xxx
- REQ-BACKUP-xxx
- REQ-PRINT-xxx
- REQ-AUTH-xxx
- REQ-VISION-xxx
- REQ-NFR-xxx

このファイルは作業記録であり正本要件仕様ではない。正式成果物化時に docs 配下へ反映し、本一時記録は不要になった範囲から削除する。
