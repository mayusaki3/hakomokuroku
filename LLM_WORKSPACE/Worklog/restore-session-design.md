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
- appliedAt?
- currentConflictIndex
```

`backupHash`は読み込んだbackup内容を識別するために使用する。restore再開のために元backupファイルを再指定する必要はない。

`appliedAt`はrestore適用transactionがBusiness / Outboxとともに正常commitしたことを示すlocal commit markerであり、単なるUI完了時刻ではない。

## 4. RestoreConflict

競合判断はsession配下に永続保存する。

```text
RestoreConflict
- restoreSessionId
- entityType
- entityId
- conflictType
- existingSnapshot
- existingContentHash
- backupSnapshot
- resolution
    null
    KEEP_EXISTING
    USE_BACKUP
- stale
- resolvedAt
```

利用者が1件判断するたびに`resolution`をIndexedDBへ即時保存する。

`existingContentHash`は競合作成時点のlocal Business内容を表す。RestoreSessionの判断中も通常の箱目録操作を許可するため、適用前のstale判定に使用する。

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
- 再開時は未解決またはstaleになった競合から続行する

### キャンセル

- `APPLYING`開始前なら利用者はrestoreをキャンセル可能
- RestoreSessionのstatusを`CANCELLED`とし、stagingと未適用の判断情報を破棄可能にする
- Business / SyncState / Outboxは変更しない

### 完了

- すべての必須判断が解決され、かつstale競合がない場合にのみ`APPLYING`へ進む
- 適用transaction commit後に`appliedAt`が存在することを適用済みの正本とする
- `appliedAt`確認後に`COMPLETED`へ収束する
- 完了後のstagingは削除可能

## 7. 競合選択中の通常利用とstale判定

**確定:** RestoreSessionが`RESOLVING`の間も、通常の箱・アイテム・置き場所等の閲覧・編集を原則許可する。

- restore競合を作成した時点で、対象entityの`existingContentHash`を保存する
- 利用者の`KEEP_EXISTING / USE_BACKUP`選択は、その時点のexisting snapshotに対する判断として保存する
- `APPLYING`へ遷移する直前に、すべての競合対象entityについて現在のBusiness contentHashを再計算/取得し、保存済み`existingContentHash`と比較する
- hash一致なら、その競合の既存判断は有効なまま適用可能
- hash不一致なら、その競合だけを`stale=true`として既存resolutionを無効化する
- stale化した競合は最新existing snapshot / 最新existing contentHashへ更新し、同じbackup snapshotとの比較を利用者へ再提示する
- stale対象以外の判断済みresolutionは維持する
- stale化により内容がbackupと同一になった場合はUNCHANGED相当として利用者再選択なしで解決可能
- stale判定は`updatedAt`ではなくbusiness `contentHash`で行う
- stale競合が残る間は`APPLYING`へ進まない
- RestoreSession判断中の通常編集自体を禁止・rollbackしない

### 根拠

restoreの競合選択が長時間に及ぶ場合、アプリ全体をロックすると通常利用を不必要に妨げる。一方、競合作成時snapshotに対する選択を、その後編集されたentityへそのまま適用すると利用者の新しい変更を上書きする危険がある。

business contentHashをcompare-and-revalidate用に使えば、時刻ずれや単なるmetadata変更に依存せず「利用者が判断した対象内容がまだ同じか」を判定できる。変更があったentityだけ再判断に戻すことで、安全性を維持しつつ他の判断済み作業を失わない。

## 8. 適用原則

- 競合選択中にentityを部分適用しない
- `KEEP_EXISTING`は対象Businessを変更しない
- `USE_BACKUP`は通常のlocal business updateとしてBusiness更新 + contentHash再計算 + Outbox生成を行う
- restore由来であってもOutboxのbaseRevision等は現在local SyncStateを基準にする
- backup由来のrevision / syncSeq / cursor等をそのまま採用しない
- Box.code immutable / User-scope unique制約を含む既存のrestore検証規則を優先し、識別子不整合は選択競合ではなくrestore errorとする
- `APPLYING`開始前にstale再検証を必ず完了する

## 9. APPLYINGの原子性と中断範囲

**確定:** `RESOLVING`までは自由に中断可能とし、`APPLYING`開始後は利用者による手動中断を提供しない。

- 全競合のresolutionが確定した後、APPLYING直前にstale再検証を実施する
- staleが1件でもあれば`RESOLVING`へ戻し、その対象だけ再判断する
- staleがなければ、その時点のstaging + resolution + current baselineを適用対象の確定snapshotとして固定し、statusを`APPLYING`へ遷移する
- `APPLYING`ではBusiness更新、必要な参照修正、contentHash再計算、Outbox生成/更新を、対象local DBで可能な限り単一IndexedDB readwrite transactionにまとめる
- 同一transactionで扱えるlocal tableは一括してatomicにcommit/rollbackする
- `KEEP_EXISTING`対象はBusinessを変更しない
- `USE_BACKUP`対象は通常local business updateと同じ規則で反映する
- transaction成功後にのみrestore適用済みとみなす
- transaction失敗時はBusiness / Outbox / 参照修正 / `appliedAt`をすべてrollbackし、部分restoreを残さない
- transaction失敗後はRestoreSessionを`ERROR`または安全に再試行可能な状態として保持し、stagingとresolutionを失わない
- `APPLYING`中に利用者が「中断」を押して処理途中で止めるUIは提供しない
- restore適用transactionの実行中は、同一local DBに対する競合するBusiness writeを直列化/待機させ、確定snapshot検証後からcommitまでのraceを防ぐ

## 10. 適用commit markerとクラッシュ復旧

**確定:** `RestoreSession.appliedAt`をrestore Business適用commit済みの正本markerとして使用する。

- `appliedAt`はserver sync metadataではなく、端末localのRestoreSession管理情報
- `appliedAt`の値はlocal restore適用transaction commit時の時刻を記録する
- Business / Outbox / 必要な参照修正と`appliedAt`更新を**同一IndexedDB transaction**に含める
- transactionがabort/rollbackした場合はBusiness変更と同時に`appliedAt`も残らない
- transactionがcommitした場合はBusiness変更と`appliedAt`が必ず同時に存在する
- `status=APPLYING`かつ`appliedAt != null`で起動/復旧した場合、Business適用は完了済みと判定し、restoreを再適用せず`COMPLETED`へ収束させる
- `status=APPLYING`かつ`appliedAt == null`ならBusiness適用transactionは未commitと判定し、staging/resolutionを使って安全に再試行する
- `status=COMPLETED`では`appliedAt`必須とする
- `appliedAt`は適用済み判定にだけ使い、business `updatedAt`やsync conflict winner判定には使わない
- `COMPLETED`へのstatus更新とstaging cleanupはcommit marker確認後の後処理でよく、クラッシュしても次回起動時に再実行可能とする
- cleanupの失敗はrestore Business適用失敗とは扱わない

### 根拠

Business適用transactionのcommit直後、`COMPLETED`へのstatus更新前にアプリが終了すると、statusだけでは「未適用なのか、適用済みなのか」を区別できない。Business/Outboxと同一transactionでcommit markerを保存すれば、IndexedDBのatomicityを利用して適用済み境界を一意に判定できる。

`appliedAt`をmarkerにすれば追加のcommit ID照合機構を必要とせず、単一端末local restoreの用途には十分である。時刻値そのものの順序性には依存せず、null/non-nullだけをcommit判定に使用する。

## 11. 根拠

競合ごとに判断直後からBusinessへ反映すると、10件中4件だけ解決した状態でアプリ終了した場合に「部分restore済み」の曖昧な状態が残る。RestoreSessionへ判断だけを永続化し、全判断後に適用すれば、途中終了・ブラウザ再起動・利用者都合の中断を安全に扱える。

また元backupファイルを再指定させる方式では、ブラウザのfile handle権限やファイル移動・削除に依存して再開不能になる可能性がある。restore開始時に必要内容をlocal stagingへコピーすることで、再開可能性をrestore session自身で保証できる。

## 12. 次の設計判断候補

RestoreSessionの同時存在数を確定する必要がある。

推奨案:
- User local DBごとに未完了RestoreSessionは最大1件
- `PREPARING / RESOLVING / APPLYING / ERROR(retryable)`のsessionが存在する間は新しいrestore開始を禁止する
- 利用者は既存sessionを再開するか、APPLYING前ならキャンセルしてから新しいbackup restoreを開始する
- `COMPLETED / CANCELLED`はactive sessionとして数えず、cleanup対象とする
- これにより複数backupのstaging・競合判断・適用順序の相互干渉を避ける
