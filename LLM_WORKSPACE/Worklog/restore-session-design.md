# RestoreSession 設計判断記録

更新: 2026-09-15
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`
状態: 設計確定事項

## 1. 目的
backup/restore時に複数entityの内容競合が発生した場合、利用者が1件ずつ判断している途中で画面を閉じたりアプリを終了したりしても、判断済み内容を失わず後から再開できるようにする。

## 2. restore競合の基本方針

同一`Box.id + Box.code`でbusiness contentが同一ならUNCHANGED相当とする。

business contentが異なる場合は`updatedAt`等で自動勝者を決めず、利用者が次のどちらかを選択する。

- `KEEP_EXISTING`: 現在のlocal内容を維持する
- `USE_BACKUP`: backup内容を採用する

`USE_BACKUP`はrestore専用のsync metadataを持ち込まず、通常のlocal business updateとして反映し、Outboxを生成する。backup側のrevision/cursor/serverUpdatedAt等は採用しない。

## 3. RestoreSession

restoreは一括で直ちにBusinessへ適用せず、永続的な作業単位`RestoreSession`を作成する。

概念model:

```text
RestoreSession
- id
- backupHash
- status
    PREPARING
    RESOLVING
    APPLYING
    COMPLETED
    CANCELLED
    ERROR
- createdAt
- updatedAt
- currentConflictIndex
```

`backupHash`は読み込んだbackup内容を識別するために使用する。restore再開のために元backupファイルを再指定する必要はない。

## 4. RestoreConflict

競合判断はsession配下に永続保存する。

```text
RestoreConflict
- restoreSessionId
- entityType
- entityId
- conflictType
- existingSnapshot
- backupSnapshot
- resolution
    null
    KEEP_EXISTING
    USE_BACKUP
- resolvedAt
```

利用者が1件判断するたびに`resolution`をIndexedDBへ即時保存する。

## 5. staging

restore開始時に、restore処理に必要なbackup内容をIndexedDB内のRestoreSession staging領域へコピーする。

- 元backupファイルへの継続アクセスに依存しない
- ブラウザ再起動後も同じRestoreSessionを再開できる
- stagingは通常Business / SyncState / Outboxとは別領域に保持する
- staging中のbackup entityはcanonical Businessとして表示・同期しない
- backup側sync metadataはstagingへ保持する必要がある場合でも参考情報扱いとし、Business/SyncStateへ直接導入しない

## 6. 中断・再開

### 中断

- `RESOLVING`中は任意の時点で中断可能
- RestoreSessionとstaging、競合一覧、判断済みresolutionを保持する
- Business / SyncState / Outboxは競合選択だけを理由に変更しない
- 次回起動時に未完了RestoreSessionを検出し、「復元作業を再開」できる
- 再開時は未解決の競合から続行する

### キャンセル

- `APPLYING`開始前なら利用者はrestoreをキャンセル可能
- RestoreSessionのstatusを`CANCELLED`とし、stagingと未適用の判断情報を破棄可能にする
- Business / SyncState / Outboxは変更しない

### 完了

- すべての必須判断が解決された後にのみ`APPLYING`へ進む
- 適用完了後に`COMPLETED`とする
- 完了後のstagingは削除可能

## 7. 適用原則

- 競合選択中にentityを部分適用しない
- `KEEP_EXISTING`は対象Businessを変更しない
- `USE_BACKUP`は通常のlocal business updateとしてBusiness更新 + contentHash再計算 + Outbox生成を行う
- restore由来であってもOutboxのbaseRevision等は現在local SyncStateを基準にする
- backup由来のrevision / syncSeq / cursor等をそのまま採用しない
- Box.code immutable / User-scope unique制約を含む既存のrestore検証規則を優先し、識別子不整合は選択競合ではなくrestore errorとする

## 8. 根拠

競合ごとに判断直後からBusinessへ反映すると、10件中4件だけ解決した状態でアプリ終了した場合に「部分restore済み」の曖昧な状態が残る。RestoreSessionへ判断だけを永続化し、全判断後に適用すれば、途中終了・ブラウザ再起動・利用者都合の中断を安全に扱える。

また元backupファイルを再指定させる方式では、ブラウザのfile handle権限やファイル移動・削除に依存して再開不能になる可能性がある。restore開始時に必要内容をlocal stagingへコピーすることで、再開可能性をrestore session自身で保証できる。

## 9. 次の設計判断候補

RestoreSessionが`RESOLVING`の間も通常の箱目録操作を許可する場合、session作成後に対象entityが編集される可能性がある。そのため、**restore開始時の`existingSnapshot`からBusinessが変化した場合のstale判定・再競合化規則**を確定する必要がある。

推奨案:
- 通常利用は止めない
- RestoreConflict作成時にexisting側のbusiness contentHashを記録する
- `APPLYING`直前に現在のcontentHashと比較する
- 一致なら選択済みresolutionを適用可能
- 不一致ならその競合判断をstaleとして無効化し、最新existing vs backupで再度利用者判断を要求する
- stale対象以外の判断は維持する

これにより長時間のrestore判断中でもアプリ全体をロックせず、古いsnapshotに対する判断を誤適用しない。
