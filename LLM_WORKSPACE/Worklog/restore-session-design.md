# RestoreSession 設計判断記録

更新: 2026-09-18
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`
状態: 設計確定事項

## 1. 目的
backup/restore時に複数entityの内容競合が発生した場合、利用者が1件ずつ判断している途中で画面を閉じたりアプリを終了したりしても、判断済み内容を失わず後から再開できるようにする。

## 2. restore競合の基本方針
- 同一identityでbusiness content同一ならUNCHANGED相当。
- business content差異は`KEEP_EXISTING / USE_BACKUP`を利用者が選択する。
- `updatedAt`で自動勝者を決めない。
- `USE_BACKUP`は通常local business updateとして反映しOutboxを生成する。backup側sync metadataは導入しない。

## 3. RestoreSession
```text
RestoreSession
- id
- backupHash
- status: PREPARING | RESOLVING | APPLYING | COMPLETED | CANCELLED | ERROR
- createdAt
- updatedAt
- appliedAt?
- currentConflictIndex
```
- backup内容をstagingへ保持し、元backupファイル再指定なしで再開可能にする。
- `appliedAt`はBusiness / Outboxと同一transactionでcommitされる適用済みmarker。

## 4. RestoreConflict
```text
RestoreConflict
- restoreSessionId
- entityType
- entityId
- conflictType
- existingSnapshot
- existingContentHash
- backupSnapshot
- resolution: null | KEEP_EXISTING | USE_BACKUP
- stale
- resolvedAt
```
- 判断ごとに即時永続化する。
- RESOLVING中も通常編集を許可する。
- APPLYING直前にcurrent business contentHashと`existingContentHash`を再比較する。
- 不一致の競合だけstale化してresolutionを無効化し、最新existing vs backupを再判断する。
- 他の判断済みresolutionは維持する。

## 5. 中断・再開
- `RESOLVING`中は任意に中断可能。
- session / staging / resolutionを保持する。
- 競合選択中はBusiness / SyncState / Outboxへ部分適用しない。
- 起動時に未完了sessionを検出して再開可能にする。
- APPLYING前ならキャンセル可能。Business未変更のままstagingを破棄する。

## 6. APPLYING
- 全競合解決 + staleなしでのみ開始する。
- APPLYING開始後の利用者手動中断は提供しない。
- Business更新、参照修正、contentHash再計算、Outbox生成/更新、`RestoreSession.appliedAt`を可能な限り単一IndexedDB readwrite transactionに含める。
- transaction失敗は全rollbackし部分restoreを残さない。
- stale検証後からcommitまで競合Business writeを直列化する。
- `APPLYING + appliedAtあり`なら再適用せずCOMPLETEDへ収束する。
- `APPLYING + appliedAtなし`なら未commitとして安全に再試行する。

## 7. active RestoreSession数
- User local DBごとにactive未完了sessionは最大1件。
- active=`PREPARING / RESOLVING / APPLYING / ERROR(retryable)`。
- active session中は新規restore開始禁止。
- 既存sessionを再開、またはAPPLYING前ならキャンセルしてから新規restoreする。
- COMPLETED / CANCELLEDはactiveに数えずcleanup対象。

## 8. backupの自己完結性と写真 — 確定
- 通常backupはserverや元端末へ依存せず復元できる自己完結型とし、Businessデータ、thumbnail、保存原画像を含める。
- device namespace、SyncState、Outbox、restore staging、tombstoneは含めない。

## 9. RestoreSession stagingの写真保持 — 確定
- Business stagingとoriginal blob stagingを論理的に分離する。
- original blobはRestoreSession専用blob stagingへ保持する。
- RESOLVING中はblob stagingを保持し、元backupファイルなしで再開可能にする。
- 最終結果でcanonical Businessから参照される写真だけを適用対象とする。
- キャンセル時はblob stagingを削除可能。
- staging作成時にoriginal bytesからphotoHashを再計算しmanifest値と照合する。

## 10. staging容量不足 — 確定
- `PREPARING`でbackup manifestを検証し必要staging容量を見積もる。
- quota/usageは参考値、実際のIndexedDB staging write成功を最終判定とする。
- Businessへ一切反映する前にstaging copyを完了する。
- quota不足/write failure/hash不一致等ならPREPARING失敗とし途中stagingをcleanupする。

## 11. 現行実装との差異
現行`apps/web/src/lib/backup.ts`は`hakomokuroku-backup@1`のJSONでBox/Item中心、`photoThumbs`を扱い、original blobを含まず、BoxLocationも対象外である。現行mergeは`updatedAt`で勝者を選び、replaceではID再採番を行う。確定仕様・テスト完成後の実装段階で置換対象とする。

## 12. backup container形式 — 確定
```text
<backup container: ZIP>
├─ manifest.json
├─ checksums.json
├─ photos/
│  └─ <photoId>.webp
└─ thumbnails/
   └─ <photoId>.webp
```
- container物理形式はZIP、論理schema versionはmanifestで管理する。
- JSONへのBase64埋め込みは使用しない。
- 現行JSONとのlegacy互換は必須にしない。

## 13. thumbnail backup entry — 確定
- path=`thumbnails/<photoId>.webp`。
- manifestに`thumbnailPath`, `thumbnailHash`, `thumbnailSize`を保持する。
- `thumbnailHash`はbackup integrity専用でparent Business `contentHash`には含めない。
- 欠落・hash不一致・size不一致ならPREPARING失敗。originalから暗黙再生成しない。

## 14. backup container integrity — 確定
- v0.8は破損検出を目的とし暗号署名/MACは導入しない。
- root `checksums.json`で`manifest.json`を含む全論理entryをSHA-256検証する。
- PREPARINGでpath安全性、重複、必須entry、schema、hash、manifest mappingを検証する。
- 意図的改ざんの真正性保証はv0.8対象外。

## 15. backup file identity — 確定
```text
extension : .hkmbackup
MIME type : application/vnd.hakomokuroku.backup+zip
file name : hakomokuroku-backup-YYYYMMDD-HHmmss.hkmbackup
```
- filename timestampは利用者local timeの表示情報。
- 正本時刻は`manifest.json.exportedAt` UTC RFC3339 milliseconds。
- extension/MIMEだけを信用せず内容を検証する。
- valid contentならMIMEが空/`application/zip`、または別extensionでもrestore可能。
- `application/vnd.hakomokuroku.backup+zip`は箱目録が使用するvendor-tree形式のMedia Type名であり、v0.8時点でIANA正式登録済みであることを意味しない。

## 16. backup export時のoriginal収集 — 確定
- export開始時にactive Business snapshotを固定する。
- snapshotから必要な全`photoId / photoHash`を列挙する。
- local original cacheのblobは実bytes hash一致時のみ利用する。
- localに無い/不正なら認証済みserver original APIから取得しhash検証する。
- 全originalが揃うまで完成backupを出力しない。
- offline不足、server取得不能/hash不一致はexport失敗。不完全backupを生成しない。
- export途中のBusiness編集は許可し、対象は開始時snapshotに固定する。

## 17. backup取得originalのlocal cache policy — 確定
- backup生成だけを理由としてserverから取得したoriginalを通常local original cacheへ永続追加しない。
- server取得originalはZIP生成に必要な期間だけbackup専用一時データとして保持する。
- backup処理は通常cacheのLRU/最終利用時刻を更新しない。
- 通常cacheへの保存は閲覧/明示download等の通常cache policyに従う。
- 可能ならserver responseをZIP writerへ逐次渡し、temporary storageが必要なら通常cacheと別namespace/storeにする。

## 18. backup exportの中断・再開 — 確定
- v0.8ではpersistent resumable jobにせず1回のforeground operationとする。
- 利用者キャンセルは許可する。
- page/PWA終了やsuspensionで失われた場合は最初から再実行する。
- 未完成`.hkmbackup`を完成backupとして保存しない。
- progressはsnapshot、original X/Y、backup生成、完了を表示する。

## 19. 未同期Outboxとbackup snapshot — 確定
- backupはserver canonicalではなく、export開始時のlocal Business viewを正本とする。
- 未同期CREATE/UPDATEもlocal Businessへ反映済みなら含め、localでdeleted扱いのentityはactive backupから除外する。
- sync成功をbackup開始条件にしない。
- Outbox/baseRevision/syncSeq/revision/cursor等は含めない。
- restore後はbackup由来sync stateを復元せず、採用Businessに必要なOutboxをrestore先で新規生成する。
- snapshotは同一IndexedDB read transactionまたは同等の一貫性境界で取得する。

## 20. backup/restore User所有権境界 — 確定
- backupは作成したUserに所属し、同一Userへのrestoreだけを許可する。
- manifest必須field `ownerUserId`にbackup作成時のauthenticated `User.id`を保持する。
- restore PREPARINGでcurrent User.idと完全一致比較し、不一致は`BACKUP_OWNER_MISMATCH`として適用前に拒否する。
- 認証credential/secretはbackupへ含めない。
- 同一Userなら別deviceへrestore可能。device namespaceはrestoreしない。
- account間移行は将来別のimport/transfer機能として設計する。

## 21. backup暗号化 — 確定
- v0.8ではapplication-level backup暗号化を導入しない。
- `.hkmbackup`は写真やBusiness内容を含む暗号化されていないZIP containerであることをUI/仕様で明示する。
- checksumsは破損検出用で機密性/真正性を保証しない。
- 保存先保護はOS/device/cloud storage側へ委ねる。
- 将来暗号化する場合は新backup container/schema versionとしてKDF/AEAD/UXを含めて設計する。

## 22. backup保持世代・自動backup — 確定
- v0.8はmanual exportのみ。自動backup/世代管理/rotationは導入しない。
- 保存済みfile一覧/path/世代数を箱目録canonical stateとして管理しない。
- `lastBackupExportAt`はlocal preferenceの参考表示としてのみ保持可能で、file存在保証には使わない。

## 23. 写真0枚backupのcontainer構造 — 確定
- 写真0枚でも同じ`.hkmbackup` ZIP、manifest schema、validation pipelineを使用する。
- photo count=0、photo metadata=`[]`。
- directory entryは任意でchecksums対象外。
- 写真0枚なのにphoto binary logical entryがある場合はinvalid。

## 24. Business 0件の完全空backup — 確定
- authenticated Userのactive Businessが0件でも正常なmanual backupを生成する。
- 各Business collection=[]、count=0。非Business必須metadataは通常どおり保持する。
- restoreはidentity単位mergeであり、backupに存在しないexisting entityを削除・変更しない。
- 空backup restoreはBusiness変更なしで正常完了可能。

## 25. backupにだけ存在するBusiness entity — 確定
- backupに存在しrestore先に同一identityがないBusiness entityは、整合性validation通過後に個別確認なしで自動追加する。
- 単なるidentity不存在はRestoreConflictにしない。
- 自動追加対象はstagingに保持し、APPLYING transactionで他のrestore変更とまとめて反映する。
- 通常local CREATEとしてcontentHashとOutbox CREATEをrestore先で生成する。
- identity/code/photo等の不整合は既定の利用者判断またはrejectへ回す。

## 26. restore適用前の最終summary確認 — 確定
- RESOLVING完了後、APPLYING直前の利用者summary確認を必須にする。
- 新規追加/backup採用更新/現在値維持/UNCHANGED/stale等をentity type別に表示する。
- stale/未解決conflictがあれば実行不可。
- 利用者の明示的な「復元を実行」操作だけでAPPLYINGへ進む。
- summary後のBusiness変更に備え、実行時にもstale再検証する。

## 27. restore完了とserver syncの境界 — 確定
- restoreの成功・`COMPLETED`成立条件はlocal atomic commitの成功とし、server sync成功をrestore完了条件に含めない。
- restore機能から専用の即時syncをtriggerしない。
- restoreで生成されたOutboxは通常sync schedulerへ渡す。
- offline中でもrestoreを完了できる。
- UIでは「復元完了」とsync状態を分離する。
- 後発sync conflictは通常sync conflictとして扱い、過去RestoreSessionをFAILEDへ戻さない。

## 28. restore完了後の履歴 — 確定

**確定:** v0.8では、完了・キャンセル・終了可能な失敗sessionの重いRestoreSession dataをcleanupし、代わりに軽量なlocal-only `RestoreHistory` summaryを直近20件まで保持する。

```text
RestoreHistory
- id
- restoreSessionId
- startedAt
- finishedAt
- backupExportedAt?
- result
- addedCount
- updatedCount
- keptCount
- unchangedCount
- conflictCount
- errorCategory?
```

- `RestoreHistory.id`はlocal history record identity、`restoreSessionId`は元sessionとの診断上の対応用とする。
- `result`は少なくとも`COMPLETED / CANCELLED / FAILED`を区別する。
- `finishedAt`はCOMPLETEDなら完了時、CANCELLEDなら取消時、FAILEDなら終了確定時を保持する。
- COMPLETEDでは最終summary/適用結果から件数を確定して履歴へ保存する。
- CANCELLED/FAILEDでは未適用のstaging内容を「復元済み件数」として記録しない。必要な診断件数がある場合もresultと区別可能な情報として扱う。
- `errorCategory`はFAILED時の必要最小限の分類のみとし、backup内容・例外stack・credential等の詳細を保存しない。
- backup Business snapshot、existing/backup conflict snapshot、original photo blob、thumbnail blob、RestoreConflict詳細、Outbox、SyncState、server revision等はRestoreHistoryへ保持しない。
- 履歴はcanonical Businessではなく、sync対象でもbackup対象でもない。
- User別local DB内に保持するため`ownerUserId`は重複保持しない。
- 最大20件。21件目を追加するときは`finishedAt`が古い履歴から削除する。同時刻の場合は安定したidentity順で削除対象を決める。
- 利用者による履歴全消去を許可する。履歴消去はBusiness、Outbox、SyncState、backup fileへ影響しない。
- active/retryable RestoreSessionは履歴化して削除しない。再開に必要なsession/staging/conflictを保持する。
- COMPLETED後はRestoreHistory作成を先に行い、その後に重いstaging/blob/conflictをidempotent cleanupする。cleanup失敗はrestore失敗へ戻さず、次回startup等で再試行する。
- CANCELLEDおよびnon-retryable FAILEDも、Businessが適用されていないことを確認してから履歴化し、重いsession dataをcleanupする。

### 根拠
再開に必要なRestoreSession dataはactive中だけ保持すればよく、完了後まで写真blobやBusiness snapshotを残すとlocal storageを不必要に消費する。一方、軽量summaryを直近20件残せば「いつ復元したか」「何件変更されたか」「失敗/取消だったか」を利用者と開発者が確認でき、storage負荷とprivacy残留を小さく保てる。

## 29. RestoreHistoryのbackup識別表示 — 確定

**確定:** `RestoreHistory`には利用者が選択したbackup file名を永続保存しない。履歴上のbackup識別には`backupExportedAt`と短いcontent fingerprintを使用する。

- restore開始/summary等、そのrestore操作中のUIでは選択したfile名を一時表示してよい。
- file名はRestoreHistory、Business、SyncState、Outbox等へ永続化しない。
- `RestoreHistory`に`backupFingerprint`を追加する。
- `backupFingerprint`はrestore開始時に算出するbackup container全bytesのSHA-256 `backupHash`から、表示用として先頭12 hexadecimal charactersを小文字で派生する。
- fingerprint算出元の完全`backupHash`はRestoreSessionの同一backup判定・再開整合性確認等に必要な間だけ保持し、完了後のRestoreHistoryには完全hashを残さない。
- `backupExportedAt`はhash検証済みmanifestの`exportedAt`を使用する。
- UIでは例えば「2026-09-18T...Z / 1a2b3c4d5e6f」のように、生成時刻とfingerprintを組み合わせて識別できるようにする。表示形式自体はUI仕様で決める。
- fingerprintはbackup真正性・署名・所有権を証明する値として扱わない。同じcontainer bytesを識別するための目印に限定する。
- 12 hexの表示fingerprintが履歴内で偶然重複しても、履歴recordをmerge/deleteしない。RestoreHistory identityは独立した`id`である。
- file名に含まれ得る個人情報・任意文字列を診断履歴へ残さない。

### 根拠
file名は利用者やOSが変更でき、backup content identityとして信頼できない。また任意の個人情報を含み得る。hash検証済みmanifestの生成時刻とcontainer content由来fingerprintなら、保存情報を限定しつつ複数backupを実用上判別しやすい。短縮fingerprintは表示用なので衝突をidentity判定へ利用しないことで安全性も維持する。

## 30. 同一backupの再restore — 確定

**確定:** 同じbackup containerを複数回restoreすることを許可する。過去のrestore実績は警告情報として利用できるが、restore開始禁止条件にはしない。

- 過去RestoreHistoryに同じ`backupFingerprint`が存在してもrestoreを開始できる。
- restore開始時に算出した完全`backupHash`と、active RestoreSession等で保持している完全hashを比較できる場合は完全hashを優先する。
- RestoreHistoryは短縮fingerprintだけを保持するため、fingerprint一致だけで「完全に同じbackup」と断定しない。UIでは「以前復元したbackupと同じ可能性があります」等、表示用fingerprintの性質に合う表現を使用する。
- 同一backupであることを十分確認できる場合も警告はinformationalとし、利用者が続行できる。
- 再restoreのたびに現在のBusinessを基準としてPREPARING / RESOLVINGを最初から実行する。
- 前回RestoreSessionのresolution、staging、conflict snapshotを再利用しない。
- 現在Businessとbackup Businessが同一ならUNCHANGEDとして扱い、不要なBusiness write / Outboxを生成しない。
- 現在Businessが前回restore後に変更されていれば、通常のcontent conflict規則に従って`KEEP_EXISTING / USE_BACKUP`を再判断する。
- backupにのみ存在するentityは通常どおりvalidation後に自動追加する。
- 再restoreごとに独立したRestoreSessionを作成し、完了/取消/失敗時は独立したRestoreHistory recordを残す。
- active RestoreSessionが既に存在する場合は、既確定の「User local DBごとにactive最大1件」規則を優先し、新しい再restoreを並行開始しない。

### 根拠
同じbackupは、前回restore後の誤編集を戻すなど再利用する正当な用途がある。重複検出を禁止条件にするとrecovery能力を不必要に制限する。一方で毎回現在Businessとの比較をやり直せば、古いresolutionを誤適用せず、UNCHANGED最適化と現在状態に対する競合判断を両立できる。

## 31. backup exportedAtの異常時刻 — 確定

**確定:** manifestの`exportedAt`が要求形式としてvalidである限り、現在時刻との差が大きいことだけを理由にrestoreを拒否しない。

- `exportedAt`はUTC RFC3339 milliseconds `YYYY-MM-DDTHH:mm:ss.SSSZ`を必須とする。
- invalid、offset-less、milliseconds欠落等、schemaの時刻表現に違反する値はPREPARINGでinvalid backupとして拒否する。
- validな`exportedAt`は、未来/過去の大きさだけではinvalidにしない。
- `exportedAt`をcontent conflictの勝者判定、`KEEP_EXISTING / USE_BACKUP`の自動選択、Business上書き可否、restore適用順序に使用しない。
- restore correctnessはowner/schema/checksums/identity/contentHash/reference/photo validation等で判定する。
- restore時の現在時刻より24時間を超えて未来なら、summaryで「バックアップ生成時刻が現在時刻より大きく未来です。端末時計またはバックアップを確認してください」相当の警告を表示する。
- 未来24時間以内は時計差・timezone表示等を考慮し、v0.8では専用警告を必須にしない。
- 過去backupには固定の失効期限を設けない。summaryに生成日時と現在からの経過期間を表示し、古さの判断を利用者へ委ねる。
- 異常時刻警告があっても、他のvalidationが通過していれば利用者はrestoreを続行できる。
- 時刻警告はUX情報であり、RestoreHistoryのresultやbackup fingerprintを変更しない。

### 根拠
backupの有効性をwall-clockへ依存させると、端末時計の誤設定だけで正常なrecovery dataを利用不能にする危険がある。既確定のsync/business timestamp方針と同様に時刻を競合correctnessから切り離し、明らかな未来時刻だけ利用者への注意情報として扱う。

## 32. backup総容量とresource safety — 確定

**確定:** v0.8ではbackup container全体または写真総容量に固定のアプリ独自hard limitを設けず、entry単位の制約・manifest先行検証・実storage quotaを組み合わせてrestore可否を判定する。

- backup全体のbyte数だけを理由とする固定上限は設けない。
- PREPARING前半でhash検証済みmanifestのcount/size情報から、Business staging、thumbnail、original blob等の必要容量を見積もる。
- `navigator.storage.estimate()`等が利用可能ならquota/usageを参考にし、明らかに不足する場合は大容量展開前に中止できる。
- storage estimateはadvisoryであり、restore可否の正本ではない。最終判定は実際のIndexedDB staging write成功とする。
- quota/write failureならBusiness / SyncState / Outboxへ触れずPREPARING失敗とし、partial stagingをcleanupする。
- ZIP内はmanifest/checksumsで宣言・許可されたlogical file entryだけを処理し、unknown extra logical file entryは既確定どおり拒否する。
- original photoは保存原画像仕様の最大5MiB、thumbnailは最大256KiBをentry単位で検証する。
- manifest宣言count、path mapping、declared size、実entry size、checksum/hashの整合を検証する。
- ZIP directory entryはlogical dataとして展開対象に数えない。
- ZIP parserへ「全entryを無条件に一括展開」させず、central directory等からentry metadataを確認してから許可entryを順次検証/stagingする実装を優先する。
- 圧縮後sizeが小さくても、展開後sizeがentry制約を超えるものは拒否する。
- manifest/checksums等のcontrol JSONには、写真総容量とは別のresource safety上限を仕様化してから実装する。
- 実運用で巨大backup自体が問題になることが確認された場合は、将来schema/container versionで総容量上限、分割backup、streaming restore等を再検討する。

### 根拠
利用可能storageは端末・browserごとの差が大きく、固定総容量上限は十分なstorageを持つ端末の正当なrestoreまで妨げる。一方、entry単位の展開後size制約、manifest/checksum整合、許可entry限定、実quota判定を組み合わせれば、固定総量制限なしでも破損ZIPや典型的なZIP bombによる無制限展開を抑制できる。

## 33. control JSON resource safety上限 — 確定

**確定:** v0.8 backup readerは、展開後raw UTF-8 bytesで`manifest.json <= 64 MiB`、`checksums.json <= 16 MiB`をresource safety上限とする。

- 上限はZIP内のcompressed sizeではなく、decompressed/raw entry bytesに適用する。
- `manifest.json`が64 MiBを超える、または`checksums.json`が16 MiBを超える場合、PREPARINGで`BACKUP_RESOURCE_LIMIT_EXCEEDED`相当として拒否する。
- ZIP entry metadataでuncompressed sizeを信頼できる形で取得できる場合はparse前の早期判定に利用する。ただしmetadataだけを信用せず、streaming/read時にも実raw byte countが上限を超えないことを確認する。
- 上限超過entryを一旦全量memoryへ展開してから判定しない。
- raw bytesはstrict UTF-8としてdecodeする。invalid UTF-8はinvalid backupとして拒否する。
- JSON parse後もschema validationを必須とし、上限内だから安全・validとはみなさない。
- schemaでは少なくとも配列count、required field、文字列形式/長さ、path、hash、size、Business/photo mappingを検証する。
- この値はBox/Item/Photo等のproduct上の件数上限ではなく、v0.8 reader implementationのresource safety ceilingである。
- writerは通常、この上限へ近づく前に利用者へbackup生成不能を明示する。readerだけが上限を持ちwriterがそれを超えるbackupを正常生成する状態を許容しない。
- 実運用で正当なbackupが上限へ達する場合、互換性影響を確認した上でreader/writer双方の実装上限を引き上げることは可能とする。

### 根拠
control JSONはbinary photoと異なりparse時にmemory/CPUを消費するため、固定backup総容量制限を設けない場合でも個別の安全境界が必要になる。64 MiB/16 MiBは通常の箱管理metadataに十分な余裕を確保しながら、異常なJSONをparse前に遮断するための実装上の防御線とする。

## 34. restore時のBusiness文字列validation — 確定

**確定:** backup専用のBusiness文字列長制約は新設せず、restoreでもcanonical Business schemaと同じfield validationを必須適用する。

- Box.name、Item.name、note、tag、BoxLocation.name等のBusiness fieldは、それぞれのcanonical Business仕様で定義する最大長・required/optional・正規化・許可形式を正本とする。
- 同じvalidation ruleをUI入力、API、sync Push、backup export validation、restore PREPARINGで共通利用できる構造を目標とする。
- restoreは「信頼済み内部data」扱いにせず、canonical Businessへ入る入力経路としてvalidationする。
- canonical上限を超える値やinvalidなBusiness snapshotはtruncate、substring、silent normalizationによる救済を行わず、invalid backupとしてPREPARINGで拒否する。
- Unicode normalizationは既確定のBusiness canonicalization規則に従う。required display stringはtrim + NFC後empty reject、case/internal whitespaceは保持する等、restoreだけ別規則を持たせない。
- tag等、既確定の配列canonicalizationも同じ規則を使用する。
- Business fieldの具体的最大文字数が未確定のものは、このbackup仕様で仮の数値を定めない。Box / Item / BoxLocation等のBusiness仕様化で決定し、backup仕様はそれを参照する。
- manifest自身のcontrol field（schema identifier、version、entry path、hash algorithm/hash text、MIME等）はBusiness fieldではないため、backup manifest schema側で別途resource/format上限を定義する。

### 根拠
同じBusiness entityに通常入力・sync・restoreで異なるvalidationを持たせると、restore経由でだけcanonicalに存在できる値や、逆に正常なBusinessをrestoreだけ拒否するvalidation driftが生じる。Business schemaを唯一の正本にすることで、contentHash・sync・search・UIを含む後続処理の前提を統一できる。

## 35. backup manifest schema/version — 確定

**確定:** v0.8で初めて正式仕様化するself-contained ZIP backupをbackup format version 1とする。development途中の実装は正式な旧backup formatとして扱わず、version履歴にも数えない。

manifestの識別field:
```json
{
  "schema": "hakomokuroku-backup",
  "version": 1
}
```

- `schema`はexact string `hakomokuroku-backup`。
- `version`はJSON integer `1`。
- 現行development implementationに存在する`hakomokuroku-backup@1`形式は互換対象にしない。
- restoreは`schema === "hakomokuroku-backup"`かつ`version === 1`をv0.8 native formatとして受理する。
- unknown schemaはinvalid/unsupported backupとして拒否する。
- future version 2以上はreaderが明示対応していなければ`BACKUP_VERSION_UNSUPPORTED`相当で拒否し、推測変換しない。
- 将来version migrationを導入する場合は、入力versionごとの明示的migration/compatibility ruleを仕様化する。
- container extension/MIMEはschema versionとは独立し、既確定の`.hkmbackup`を継続する。

### 根拠
version番号は正式に存在するformatの互換性系列を表す。v0.8が最初の正式backup formatであるためversion 1から開始するのが自然であり、互換対象でないdevelopment途中の実装のために番号を消費しないことで、利用者向けformat historyと実装上のcompatibility semanticsを一致させる。

## 36. manifest top-level構造 — 確定

**確定:** `manifest.json`はcontrol metadata、canonical Business snapshot、photo binary inventoryを分離したtop-level構造とする。

```json
{
  "schema": "hakomokuroku-backup",
  "version": 1,
  "ownerUserId": "...",
  "exportedAt": "2026-09-18T00:00:00.000Z",
  "business": {
    "boxes": [],
    "items": [],
    "boxLocations": []
  },
  "photos": []
}
```

- top-level required fieldsは`schema`, `version`, `ownerUserId`, `exportedAt`, `business`, `photos`。
- `business`はactive canonical Business snapshotをentity type別arrayで保持する。
- v1のBusiness collectionは少なくとも`boxes`, `items`, `boxLocations`をrequiredとし、0件でも`[]`を保持する。
- tombstone、SyncState、Outbox、device state、RestoreSession等は`business`へ含めない。
- `photos`はbackupに含まれるphoto binary inventoryであり、Business entityそのものとして扱わない。
- parent Business側にはphoto reference/orderを保持し、`photos` inventoryにはbinary validation/retrievalに必要なmetadataを保持する。
- Business count/photo countをtop-levelへ重複保持しない。array lengthを正本とする。
- 全logical entryのchecksum一覧はroot `checksums.json`だけを正本とし、manifestへ重複保持しない。
- v1ではunknown top-level fieldおよびunknown `business` collectionを拒否する。
- 将来新しいBusiness entity typeやtop-level sectionを追加する場合は、reader compatibilityを明示したschema/version変更として扱う。

### 根拠
control metadata・Business snapshot・binary inventoryを分離することでvalidation責務が明確になる。countやchecksumの重複保存を避けることで、同じ情報を複数箇所に持つことによる不整合条件も減らせる。unknown fieldをv1で拒否すれば、未対応dataを黙って無視した不完全restoreを防止できる。

## 37. photos[] binary inventory schema — 確定

**確定:** v1の`photos[]`は、photo identityとoriginal/thumbnail binaryのpath・hash・sizeを保持する。

```json
{
  "photoId": "<UUID>",
  "photoHash": "<SHA-256 hex>",
  "originalPath": "photos/<photoId>.webp",
  "originalSize": 123456,
  "thumbnailPath": "thumbnails/<photoId>.webp",
  "thumbnailHash": "<SHA-256 hex>",
  "thumbnailSize": 23456
}
```

- 全field required。
- v1ではoriginal / thumbnailともstored formatをWebP固定とし、photoごとのMIME/format fieldは持たない。
- `photoId`はcanonical photo identityで、canonical UUID表現としてBusiness/photo仕様と同じvalidationを使用する。
- `photoHash`はoriginal entryのdecompressed/raw bytesに対するSHA-256 lowercase hexadecimal 64 charsとし、canonical photo content identityとして既存Business referenceでも使用する。
- `thumbnailHash`はthumbnail entryのdecompressed/raw bytesに対するSHA-256 lowercase hexadecimal 64 chars。backup integrity用であり、parent Business contentHashへ含めない。
- `originalSize` / `thumbnailSize`はdecompressed/raw binary byte lengthを表すnon-negative JSON integer。実際のentry bytesとexact一致を要求する。
- originalは既確定のstored-original上限5MiB以下、thumbnailは256KiB以下を別途要求する。
- `originalPath`はexact `photos/<photoId>.webp`、`thumbnailPath`はexact `thumbnails/<photoId>.webp`。canonical path以外、別photoIdを指すpath、absolute/traversal/backslash pathは拒否する。
- `photos[]`内の`photoId`重複はinvalid backupとして拒否する。
- path重複もinvalid backupとして拒否する。
- Business snapshotが参照する全photoId/photoHashについて、対応する`photos[]` entryがexactly one存在することを要求する。
- `photos[]`に存在するがBusiness snapshotから一切参照されないorphan photo inventory entryはv1では拒否する。active Business backupに不要なbinaryを含めない。
- unknown fieldはv1で拒否する。
- 将来WebP以外を許可する場合はschema/version compatibilityを明示してformat情報を導入する。

### 根拠
v1でbinary formatが固定ならMIME/formatの重複保存は不整合条件を増やす。identity・canonical path・raw byte size・hashを明示すれば、ZIP entry安全性、backup completeness、photo identityを相互検証できる。orphan inventoryを拒否することでactive Business snapshotに必要なdataだけを自己完結backupへ含める。

## 38. photoIdのBusiness parent ownership — 確定

**確定:** v0.8では`1 photoId = exactly 1 Business parent`をcanonical invariantとする。

- Box / Item / BoxLocation等の全Business parentを横断して、1つの`photoId`はexactly one parentからのみ参照される。
- 同じparent内のphoto reference arrayでも同じ`photoId`を複数位置に重複させない。
- Business snapshot内で同じ`photoId`が2回以上出現するbackupはPREPARINGでinvalid backupとして拒否する。
- `photos[]` inventoryは既確定どおりphotoIdごとにexactly one entry。
- 同じ画像bytesを複数parentまたは同一parentへ複数回追加する場合は、それぞれ独立したnew `photoId`を生成する。`photoHash`が同じであることは許可する。
- photoHash一致を理由にphotoIdを共有・merge・deduplicateしない。
- photoの削除/replacementはowner parentのphoto reference/orderをBusiness updateし、参照されなくなったphoto binaryは既確定のserver GC/cache規則に従う。
- v0.8でparent間photo移動専用operationを導入する場合でも、既存photoIdを複数parentへ一時共有する状態は作らない。必要ならnew photoIdとして追加し旧参照を削除する。
- Business schema、sync Push validation、backup export、restore PREPARINGで同じownership invariantを検証する。
- server original/thumbnail authorizationの「authenticated Userのcurrent canonical parentから参照されていること」という既確定条件は、この単一parent ownershipを前提に適用できる。

### 根拠
既確定の「photo dedupを行わない」「photoIdはlogical identity」「同じbytesでも別photoIdを許可する」方針と整合する。単一parent ownershipに限定すれば、photo array order、parent contentHash、削除、authorization、orphan GCの責務が明確になり、Photoを独立sync entityにしない設計を維持しやすい。

## 39. backup Business snapshotのmetadata境界 — 確定

**確定:** backup Business snapshotにはBusiness recoveryに必要なidentity/content/timestamps/contentHashを含め、server convergence用sync protocol metadataは含めない。

### 含める
- entity `id`
- entity typeごとのcanonical Business fields
- canonical referencesおよびphoto reference/order
- `createdAt`
- `updatedAt`
- `contentHash`

### 含めない
- `revision`
- `baseRevision`
- `syncSeq`
- `serverUpdatedAt`
- server change log / cursor
- Outbox state / Outbox version
- SyncConflict / restore conflict state
- device/sync runtime metadata
- その他、restore destinationで再構築すべきprotocol state

### deletedAt
- v1 normal backupはactive Business snapshotのみを対象とするため、`deletedAt`はmanifest Business entityへ保存しない。
- backupに存在するentityはactive stateとして解釈する。
- tombstone/deletion historyをbackupで再現しない。

### restore validation
- PREPARINGで各Business entityのcanonical Business contentから`contentHash`を仕様どおり再計算する。
- manifestに保存された`contentHash`とexact一致しなければinvalid backupとして拒否する。
- ZIP/checksums validationが通っていてもcontentHash mismatchを許可しない。
- `createdAt` / `updatedAt`は既確定のRFC3339/ISO8601 representation ruleでvalidationする。
- timestampの新旧はrestore conflict winnerや上書き可否に使用しない。

### apply後のsync
- `USE_BACKUP`またはbackup-only auto-addで採用するBusiness content/timestampsはbackup snapshot値を基礎とする。
- destination側のrevision/baseRevision/Outbox等はbackupから復元せず、destinationの現在canonical/sync stateに対する通常のlocal CREATE/UPDATEとして生成する。
- restore元でsyncedだったかunsyncedだったかは復元しない。
- restore completionは既確定どおりlocal atomic commitで成立し、その後normal sync schedulerがOutboxを処理する。

### 根拠
Business recoveryに必要なsnapshot情報とserver convergence protocol stateを分離することで、backup元のsync状態を復元先へ誤移植せずに済む。contentHashを保存し、restore時にcanonical contentから再計算することで、container checksumとは別にBusiness canonicalizationの整合性も検証できる。

## 40. USE_BACKUP時のcreatedAt / updatedAt — 確定

**確定:** 既存entityへの`USE_BACKUP`ではrestore先の`createdAt`を保持し、backup-only auto-addではbackupの`createdAt`を採用する。`updatedAt`は採用するbackup snapshot値を保持する。

### 既存entity + USE_BACKUP
- destination existing entityの`createdAt`を保持する。
- backupの`createdAt`で上書きしない。
- backupの`updatedAt`を採用する。
- restore操作時刻を`updatedAt`へ代入しない。
- backup Business contentを採用した後、canonical ruleから`contentHash`を再計算/確認する。
- destination側のsync protocol metadataは既確定どおり通常local UPDATEとして生成する。

### backup-only auto-add
- backupの`createdAt`を採用する。
- backupの`updatedAt`を採用する。
- destinationでは通常local CREATEとしてOutbox等を生成する。
- serverへCREATEされた場合も、既確定のbaseRevision 0 CREATE規則に従いclient `createdAt`をcanonical作成時刻として扱う。

### createdAt差異
- 同じentity idでdestinationとbackupの`createdAt`が異なること自体はidentity conflictにしない。
- `createdAt`の新旧でrestore winnerを決めない。
- PREPARINGではbackup timestamp representation自体のvalidationは必須。
- 必要ならsummary/diagnosticで差異を表示できるが、restore可否には使用しない。

### 根拠
`createdAt`はidentityが最初に成立した時刻であり、既存identityの通常UPDATEでは変更しない。restoreをdestination上の通常local UPDATEとして扱う既存方針、およびserver側の既存entity UPDATEでcanonical createdAtを保持する規則と一致する。一方、destinationに存在しないentityはbackup snapshotの生成履歴を引き継ぐことができる。

## 41. USE_BACKUP時のupdatedAt巻き戻り — 確定

**確定:** `USE_BACKUP`でbackup snapshotを採用する場合、backupの`updatedAt`がdestination current entityより古くても、その値をそのまま採用する。

- `updatedAt`はBusiness content snapshotが最後に編集された時刻として扱う。
- restore operationの実行時刻をBusiness `updatedAt`へ代入しない。
- backup `updatedAt`がdestinationより古い、同じ、未来のいずれでも、representationがvalidなら採用できる。
- timestampの大小をrestore conflict winner、上書き可否、Outbox優先度、sync cursor/revision correctnessへ使用しない。
- restore実行時刻はRestoreSession / RestoreHistoryの`finishedAt`等、operation metadataで別に記録する。
- UIで「最近復元したentity」を示す必要がある場合はRestoreHistory等から表現し、Business `updatedAt`をrestore時刻へ偽装しない。
- sort/searchが`updatedAt`を利用する場合、restore直後でもbackup snapshot本来の時系列位置へ戻ることを仕様上許容する。
- extremeだがformat-validなtimestampも既確定規則どおり保持する。

### 根拠
backupは特定時点のBusiness snapshotを回復するものであり、利用者が`USE_BACKUP`を選択したなら、そのsnapshotが持つBusiness timestampも復元する方が意味が一貫する。restore操作履歴は専用metadataで保持できるため、Business timestampへ操作時刻を混在させる必要がない。

## 42. manifest collection order — 確定

**確定:** `business.boxes[]`, `business.items[]`, `business.boxLocations[]`, `photos[]`のmanifest collection順にはBusiness semanticsを持たせず、writerはcanonical identityによるdeterministic ascending sortで出力する。

- `business.boxes[]`: `id` ascending。
- `business.items[]`: `id` ascending。
- `business.boxLocations[]`: `id` ascending。
- `photos[]`: `photoId` ascending。
- comparisonはcanonical identifier stringのcode point/byte-equivalentな決定的比較規則を仕様化し、locale依存sortを使用しない。
- readerはv1 canonical formatとしてcollection sort orderをvalidationし、未sort collectionをinvalid backupとして拒否する。
- duplicate identityはsort orderとは別にinvalid backupとして拒否する。
- parent Business entity内部のphoto reference array順は表示順というBusiness semanticsを持つため、sortせずsnapshot順を保持する。
- tag等、既にBusiness canonicalizationでsort規則を持つfieldはその規則に従う。
- manifest collection order自体はentity contentHashへ含めない。contentHashは各entity単位のcanonical Business contentから計算する。
- deterministic manifest collection orderは同一snapshotのserialization差異を減らすためのcanonical format ruleであり、ZIP metadataを含むcontainer bytes全体の完全再現性までは保証しない。

### 根拠
collection順にBusiness意味がない場合、writerごとのquery順やruntime/locale差をそのまま保存する理由はない。canonical sortをwriter/reader双方で要求すれば、validation、diff、diagnosticsが単純になり、同一Business集合の不要なmanifest差異も減らせる。一方、photo display orderのように意味のあるarrayはその順序を保持することで、serialization orderとBusiness semantic orderを分離できる。

## 43. checksums.json exact schema — 確定

**確定:** root `checksums.json`はlogical file entryのcanonical pathとSHA-256 hashだけを保持する。

```json
{
  "algorithm": "sha256",
  "entries": [
    {
      "path": "manifest.json",
      "hash": "<64 lowercase hex>"
    },
    {
      "path": "photos/<photoId>.webp",
      "hash": "<64 lowercase hex>"
    },
    {
      "path": "thumbnails/<photoId>.webp",
      "hash": "<64 lowercase hex>"
    }
  ]
}
```

- top-level required fieldは`algorithm`, `entries`のみ。unknown fieldはv1で拒否する。
- `algorithm`はexact string `sha256`。
- each entry required fieldは`path`, `hash`のみ。unknown fieldはv1で拒否する。
- `hash`は対象logical fileのdecompressed/raw bytesに対するSHA-256 lowercase hexadecimal exactly 64 chars。
- `size`はchecksumsへ保存しない。binary sizeはmanifest `photos[]`を正本とし、manifest/checksums control JSON自体のsizeはreader resource limitで検証する。
- `entries[]`はcanonical relative path ascendingでdeterministic sortする。comparisonはlocale非依存のcanonical string比較を使用する。
- readerもcanonical sort済みであることを要求し、未sortをinvalid backupとして拒否する。
- `manifest.json`をexactly once含める。
- manifest `photos[]`で宣言された全original/thumbnail logical fileをそれぞれexactly once含める。
- `checksums.json`自身は含めない。
- directory entryはlogical fileではないため含めない。
- duplicate path、missing logical file、checksumsに未記載のlogical file、manifestから導出できないunknown logical fileを拒否する。
- zero-photo backupでは`entries[]`は`manifest.json`の1件のみ。
- v1はalgorithm selectionを持たない。将来hash algorithmを変更/追加する場合はschema/version compatibilityを明示する。

### 根拠
checksums.jsonの責務をpath→hash対応へ限定することで、manifestに既に存在するbinary sizeとの重複・不整合を避けられる。canonical path sortとstrict schemaによりwriter/readerを決定的にし、未対応dataを黙って無視する余地を減らす。

## 44. control JSON serialization — 確定

**確定:** v1 writerの`manifest.json` / `checksums.json` serializationはdeterministicに固定する。一方readerはsemantic/schema validationを正本とし、byte formattingの非canonical性だけではrejectしない。

### writer
- UTF-8 without BOM。
- line endingはLF。
- 2-space indentationでpretty-printする。
- trailing whitespaceを出力しない。
- file末尾にLFを1つ付ける。
- object key orderは各schemaで定義したfield順に固定する。
- array orderは各既確定canonical orderに従う。
- JSON escapingはvalid JSONとして必要なescapeを行う。ASCII化だけを目的とした任意のUnicode escapeは行わない。
- number/string/null等はschemaが許可するrepresentationだけを出力する。

### reader
- strict UTF-8としてdecodeし、invalid UTF-8を拒否する。
- UTF-8 BOMはrejectする。
- control JSON size limit、JSON syntax、schema、required/unknown field、type/value constraint、canonical array order等を検証する。
- object key order、indentation、一般的whitespace、末尾LFの有無など、意味に影響しないformat差だけではrejectしない。
- checksum検証は実際にZIPへ格納されたraw/decompressed file bytesを対象にするため、writer canonical formattingと異なるmanifestでも、checksumsがその実bytesと一致しsemantic validationを満たすなら受理できる。
- readerは入力JSONを再serializeしてchecksum比較しない。

### fingerprintとの関係
- backup fingerprintはcontainer bytes全体のSHA-256であり、JSON formattingやZIP metadataの差で変化し得る。
- 「同じBusiness snapshotなら同じbackup fingerprintになる」とは定義しない。
- fingerprintは既確定どおり履歴上の識別補助であり、Business identity/authenticity保証ではない。

### 根拠
writerをdeterministicにすればdiff、debug、fixture生成、実装検証が安定する。一方readerまで装飾的serializationを強制すると、意味的・integrity的に正しいbackupをwhitespace等だけで拒否する脆弱なformatになる。raw-byte checksumで実際のfile bytesのintegrityを検証できるため、readerは意味・安全性をstrictにし、装飾差を許容する。

## 45. ZIP compression / metadata policy — 確定

**確定:** canonical writerはentry種別ごとにcompression methodを固定するが、readerは安全に検証可能なSTORE / DEFLATEを許容する。

### writer
- `manifest.json`: DEFLATE。
- `checksums.json`: DEFLATE。
- `photos/*.webp`: STORE。
- `thumbnails/*.webp`: STORE。
- directory entryは生成不要。
- ZIP encryption / encrypted entryを生成しない。
- ZIP64はarchive size / entry count等で必要な場合のみZIP libraryに許可する。
- entry timestamp、extra field等のnon-semantic ZIP metadataへBusiness意味を持たせない。
- archive-level / entry commentは生成しない。
- compression level、entry timestamp、extra fieldのbyte-level canonicalizationまではv1で保証しない。

### reader
- STORE / DEFLATE compression methodを許可する。
- canonical writerの推奨methodと異なることだけをinvalid理由にしない。
- STORE / DEFLATE以外のcompression methodはv1でrejectする。
- encrypted ZIP / encrypted entryはrejectする。
- ZIP64は使用libraryが安全にparse/readできることを前提に許可する。
- logical path/schema/checksum/actual decompressed size/resource limitsを正本として検証する。
- ZIP extra field/commentをBusiness dataとして解釈しない。
- archive-level / entry commentは無視できるが、canonical writerは生成しない。
- extra field等を利用してpath safety、size limit、duplicate detection等を迂回する構造はrejectする。

### fingerprintとの関係
- compression level、entry timestamp、extra field等が異なればcontainer bytesおよびbackup fingerprintは変化し得る。
- fingerprintはlogical Business snapshotのcanonical hashとは定義しない。

### 根拠
control JSONはDEFLATEの効果が期待でき、既に圧縮済みのWebPはSTOREの方が余分な圧縮処理を避けやすい。一方、integrityはdecompressed/raw logical bytesのchecksumで検証するため、安全に展開できるSTORE/DEFLATEならreaderがwriterと同じmethodを強制する必要はない。これにより生成方針を安定させつつinteroperabilityを維持できる。

## 46. ZIP physical entry order — 確定

**確定:** canonical writerのZIP physical entry orderを固定するが、readerはphysical orderへ依存しない。

### canonical writer order
1. `manifest.json`
2. `photos/<photoId>.webp` — `photoId` ascending
3. `thumbnails/<photoId>.webp` — `photoId` ascending
4. `checksums.json`

- originalとthumbnailはphotoIdごとに交互配置せず、category単位でまとめる。
- directory entryは生成しない。
- `checksums.json`は全checksum対象logical entryのraw/decompressed bytes hashが確定した後、最後に生成・書き込みする。
- writerのentry orderはBusiness semanticsではなくcanonical serialization/debug rule。

### reader
- ZIP central directory等からlogical entriesを列挙し、physical entry orderがcanonical writer orderと異なっても、それだけではrejectしない。
- duplicate canonical pathはphysical orderに関係なくrejectする。
- logical path、schema、checksum、size、resource/path safety等を正本としてvalidationする。
- reader processing orderは安全性/streaming都合で自由に選べるが、Business適用はPREPARING完了前に行わない。

### fingerprintとの関係
- physical entry orderが異なるとcontainer bytes/fingerprintは変化し得る。
- 同一logical snapshotのfingerprint一致は保証しない。

### 根拠
writer順を固定するとfixture、debug、manual inspectionが安定し、checksumsを最後に生成するstreaming exportとも整合する。一方、readerがphysical orderへ依存しなければ、semantic/integrity上validな別実装backupとのinteroperabilityを維持できる。

## 47. export中のphoto concurrent change — 確定

**確定:** backup export開始時に固定したBusiness snapshotと必要`photoId/photoHash`集合を唯一のexport対象とし、一度snapshotとの一致を検証してexport pipelineへ取り込んだbinaryは、その後のcurrent state変化では無効化しない。

- export開始時にactive local Business snapshotと、そのsnapshotが参照する必要photoId/photoHash集合を固定する。
- originalはlocal cache、必要ならauthenticated server fetchから取得するが、採用条件はsnapshotのphotoId/photoHashとの一致。
- originalはZIPへ書き込む直前またはstreaming中にSHA-256を計算し、snapshot `photoHash`とexact一致を要求する。
- snapshot取得後にcurrent Businessからphoto referenceが削除されても、snapshotが参照しているbinaryは今回backupへ含める。
- snapshot取得後にcurrent Businessが別photoへreplacementされても、今回backupではsnapshot側photoを使用する。
- server fetch中に404、authorization失効、network failure等でsnapshot binaryを完全取得できなければ、そのphotoをmissing/unavailableとしてexport全体を失敗させる。
- 完全取得・hash validation済みbinaryについて、export完了前にcurrent serverへ再照会して存在確認しない。
- export途中に同一photoIdでcurrent側に別hashが観測されても、snapshot hash以外へ差し替えない。
- thumbnailもsnapshot parent referenceに対応するbinaryとして、既確定のthumbnailHash/size validationを行い、取得済みvalid dataをcurrent state変化だけで無効化しない。
- 全required logical entriesが揃い、manifest/checksums/ZIP生成が完了するまでcompleted backupとしてhandoffしない。
- export完了後のcurrent Businessとの差異は次回backupの対象とする。

### 根拠
export開始時snapshotを固定した後にcurrent stateへ追従すると、parent Businessとphoto binaryが異なる時点から混在する。snapshot photoHashに一致するbinaryを確保できたかだけを基準にすれば、concurrent edit/deleteがあっても一貫したBusiness snapshot backupを生成できる。

## 48. export時のthumbnail欠損/破損 — 確定

**確定:** backup export時は利用可能なcanonical thumbnailを検証して使用し、欠損/破損時は検証済みstored originalからcanonical thumbnail ruleでexport用thumbnailを再生成してよい。

- local thumbnailが利用可能でcanonical thumbnail metadata/hashがある場合は、それとvalidationして採用する。
- local thumbnailが欠損、decode不能、hash/size不一致等でinvalidな場合は、検証済みstored originalからcanonical thumbnail生成規則で再生成する。
- canonical thumbnail generationは既定のstored originalを入力とし、max 400px、no upscale、WebP quality 0.8、既定orientation済みoriginalを前提とする。
- 再生成したthumbnailのactual bytesから`thumbnailHash`と`thumbnailSize`を計算し、backup manifestへ記録する。
- export専用thumbnail再生成はBusiness contentHash、revision、syncSeq、createdAt、updatedAtを変更しない。
- exportのためだけに再生成したthumbnailをnormal local cacheへpersistすることは必須としない。
- server canonical thumbnailを取得できる場合でも、検証済みstored originalからcanonical ruleで再生成可能ならexport pipeline内での再生成を許可する。
- original自体を取得・photoHash validationできない場合、thumbnailだけを根拠にbackupを完成させない。
- restore PREPARING側では引き続きbackupに格納済みthumbnailのhash/size/entryをstrict validationし、missing/invalid thumbnailをsilent regenerationしない。

### 根拠
thumbnailはBusiness identityではなくderived representationであり、parent contentHashにも含めない。writerがself-contained backupを完成させる段階でcanonical originalから必要なderived binaryを生成することはBusiness snapshotを変更しない。一方restore時のsilent regenerationを禁止することで、受け取ったbackup containerそのものの完全性検証は維持できる。

## 49. thumbnail generation determinism — 確定

**確定:** thumbnail生成のsemantic ruleは固定するが、encoded WebP bytes / hashのcross-browser・cross-library完全決定性はv0.8のformat要件としない。

- canonical thumbnail generation semantics:
  - inputはvalidation済みstored original。
  - stored originalは既にorientation適用済みであることを前提とする。
  - aspect ratio維持。
  - max dimension 400px。
  - no upscale。
  - output WebP。
  - quality 0.8。
- writerは生成したactual thumbnail bytesから`thumbnailHash` / `thumbnailSize`を計算してmanifestへ記録する。
- 同一original/photoHashから別browser/library/encoder versionで生成したthumbnail bytes/hashが異なっても、それだけではBusiness inconsistency、photo identity collision、backup invalidとはしない。
- restoreはbackup内のactual thumbnail bytesがそのmanifest `thumbnailHash/thumbnailSize`と一致することを検証し、restore環境で再生成した値との一致を要求しない。
- server thumbnail repairもderived representationの更新として扱い、Business revision/contentHash/syncSeqを変更しない既確定方針を維持する。
- encoder固有差は、canonical visual/geometry/output format/size constraintsを満たす範囲で許容する。
- 将来pixel-exact / byte-exact thumbnail再現性が必要になった場合はencoder/version/parameterまでformat contractとして固定する別version設計とする。

### 根拠
thumbnailはderived representationでありBusiness identityはoriginal `photoHash`で担保される。cross-platformでencoded bytesまで固定するとbrowser/codec実装への強い依存が生じる一方、backup integrityは実際に格納したthumbnail bytesのhashで十分検証できるため、v0.8でbyte-exact再現性を要求する利点は小さい。

## 50. export original decode validation — 確定

**確定:** backup export対象の全stored originalは、raw-byte `photoHash`一致・size制約に加えて、WebP画像として正常にdecode可能であることを必須条件とする。

- export対象originalごとに、snapshotの`photoHash`とのSHA-256 exact一致を検証する。
- original actual byte sizeが既確定の上限5MiB以下であることを検証する。
- WebPとしてdecode可能であることを検証する。
- thumbnailが既にvalidでもoriginal decode validationを省略しない。
- hash一致でもdecode不能なoriginalはvalid backup sourceとして扱わない。
- decode failureは`PHOTO_ORIGINAL_INVALID`等の明確なerror categoryとしてexport全体を失敗させる。
- local copyがinvalidで、authenticated serverから同じphotoId/photoHashのcanonical copyを取得可能な場合は、規定された有限retryの範囲で再取得してvalidationしてよい。
- 同一hash bytesで恒常的にdecode失敗する場合、無限retryしない。
- invalid originalから既存thumbnailだけを採用してbackupを完成させない。
- export failure時はBusiness / SyncState / Outboxを変更しない。
- UIは可能な範囲で対象photo数およびparentを示し、元写真の再登録/修復が必要であることを案内する。
- restore PREPARING側でもoriginal entryはphotoHash/sizeだけでなくWebP decode validationを行い、将来利用不能なbinaryをcanonical originalへpromoteしない。

### 根拠
backupは将来復元可能なself-contained snapshotである必要がある。raw bytesのhash一致はbytes identityを証明するが、そのbytesが期待するWebP画像として利用可能であることまでは保証しない。export/restore双方でdecode validationを行えば、破損binaryを正常なbackup/canonical dataとして固定化することを防げる。

## 51. thumbnail decode validation — 確定

**確定:** thumbnailもhash/size validationに加えてWebP decode validationを必須とする。

### export
- 既存thumbnailを採用する場合、expected `thumbnailHash` / `thumbnailSize`が存在する場合の一致だけでなく、WebPとしてdecode成功することを要求する。
- decode不能、hash/size不一致等はinvalid thumbnailとして扱う。
- invalid/missing thumbnailは、validation済みstored originalから既確定canonical thumbnail ruleで再生成してよい。
- 再生成したthumbnailもWebP decode成功を確認してからbackupへ格納する。
- actual generated bytesから`thumbnailHash` / `thumbnailSize`を計算する。
- thumbnail validation/repairはBusiness contentHash、revision、syncSeq、createdAt、updatedAtを変更しない。

### restore PREPARING
- backup thumbnail entryについてchecksum、manifest `thumbnailHash`、`thumbnailSize`、WebP decode成功を全て要求する。
- decode失敗時はinvalid backupとしてPREPARING failure。
- restore時のsilent thumbnail regenerationは行わない。
- image dimensionsもcanonical thumbnail constraintに適合することを検証する。max dimensionは400px以下とし、0/invalid dimensionを拒否する。
- no-upscaleはthumbnail単独では完全に証明できないため、必要な場合は対応originalのdecoded dimensionsとの関係も検証する。
- thumbnail decode validationはBusiness contentHash/revisionへ影響しない。

### 根拠
thumbnailはBusiness identityではないが、self-contained backupから復元後に一覧等で直接利用するbinaryである。writer側ではinvalid thumbnailをoriginalから修復して完全なbackupを生成でき、reader側では受け取ったbackupそのものをstrictに検証することで、integrityと表示可能性の双方を維持できる。

## 52. original decoded dimensions — 確定

**確定:** canonical stored originalのdecoded dimensionsはexport/restore双方で検証し、max dimension 1600px以下を必須とする。

- decoded `width` / `height` はpositive integerでなければならない。
- 0、negative、non-finite、decoderがdimensionを確定できない画像はinvalid。
- `max(width, height) <= 1600`。
- aspect ratioにbackup固有の追加制限は設けない。
- decoder/browser/library自身のresource safety limitはこのcanonical constraintとは別に適用してよい。
- export時はphotoHash一致、actual size <= 5MiB、WebP decode成功に加えてdimension constraintを検証する。
- restore PREPARINGでもchecksum/photoHash/size/decode/dimensionsを同じcanonical constraintで検証する。
- 1600px超のoriginalは5MiB以下かつdecode可能でもcanonical stored originalではないためrejectする。
- backup export処理内で1600px超originalを勝手にresize/re-encodeして別photoHashへ変換しない。
- 修復が必要な場合はnormal Business photo replacement/re-registrationとして新しいcanonical photoを作成する。
- thumbnailは既確定どおりpositive dimensionsかつmax dimension 400px以下。
- 将来original resolution policyを変更する場合はBusiness/photo canonical specification変更として扱い、backup reader compatibilityを明示する。

### 根拠
canonical ingestionがmax 1600pxである以上、backup経路だけcanonical invariantを緩める理由はない。またcompressed byte sizeだけではdecode時のmemory/resource消費を十分制限できないため、decoded dimensionsの検証はuntrusted backupに対するresource safetyにもなる。

## 53. WebP actual format validation — 確定

**確定:** original/thumbnailはfilename extensionやBlob MIMEだけではなく、actual binaryがWebP containerであることを検証し、その上で既確定のdecode/hash/size/dimensions validationを行う。

- v1 backupのoriginal/thumbnail actual formatはWebP固定。
- pathの`.webp`、Blob `type`、HTTP `Content-Type`は補助metadataであり、format判定のauthoritative sourceとしない。
- minimum binary signature checkとして先頭RIFF headerの`RIFF`、RIFF size field、`WEBP` FourCCを検証する。
- declared RIFF container sizeとactual entry sizeの整合を、利用decoder/libraryで安全に確認可能な範囲で検証する。
- signature一致だけでvalid imageとはみなさない。
- originalはphotoHash、size <= 5MiB、WebP decode、positive dimensions、max dimension <= 1600pxを全て要求する。
- thumbnailはthumbnailHash、size <= 256KiB、WebP decode、positive dimensions、max dimension <= 400pxを全て要求する。
- export writerがlocal/server/generated binaryを採用する際にも同じactual-format validationを行う。
- restore PREPARINGではpathが`.webp`でもactual binaryがWebPでなければrejectする。
- decoderがformat sniffingでJPEG/PNG等をdecodeできてもWebP signature/containerを満たさなければrejectする。
- malformed RIFF/WEBP containerはdecoder/libraryで可能な範囲のstructural validationを行い、ambiguous/unsafeなものはrejectする。
- 将来AVIF等を採用する場合はBusiness/photo canonical specificationおよびbackup schema/version compatibilityとして明示する。

### 根拠
extension/MIMEはmetadataでありuntrusted inputのactual formatを保証しない。v1 format contractをWebP固定とする以上、binary container identityと実decodeの両方を検証することでformat spoofingを防ぎ、canonical photo invariantをbackup/export/restoreで共通化できる。

## 54. animated WebP — 確定

**確定:** v0.8のcanonical stored photoおよびbackup v1ではstatic WebPのみ許可し、animated WebPはrejectする。

- original / thumbnailともanimated WebPをcanonical binaryとして許可しない。
- WebP container validationで`VP8X` animation flag、`ANIM`、`ANMF`等のanimation indicationを検出した場合はinvalidとする。
- export/restore PREPARING双方で同じstatic-only validationを行う。
- normal ingestionでanimated GIF / animated WebP等を入力可能とする場合、canonical conversion段階で単一静止frameへ変換し、新しいstatic WebPとして保存する。
- animation frame count、duration、loop count等をBusiness metadataへ保持しない。
- backup export処理中に既存animated stored originalをfirst-frameへ自動変換しない。変換するとphotoHash/Business snapshot identityが変わるため、invalid canonical dataとして通常のphoto replacement/re-registrationで修復する。
- thumbnailも常にsingle-frame static WebPとして生成する。
- 将来animationをBusiness機能として導入する場合はphoto canonical format、resource limits、thumbnail/Vision behavior、backup schema/version compatibilityを明示的に拡張する。

### 根拠
箱目録のphotoは箱・アイテム・場所の静止記録用途でありanimation保持の製品要件がない。static-onlyとすることでframe数/duration/decode負荷等の追加attack surfaceを避け、thumbnail生成、Vision、backup validationを単純かつ一貫して維持できる。

## 55. WebP metadata policy — 確定

**確定:** canonical stored original / thumbnailはEXIF・XMP・ICCP等のmetadata chunkを保持しない。orientationだけcanonical pixelへ反映し、metadata自体は除去する。

- ingestion時にsource orientationをdecodeしてpixel orientationへ焼き込む。
- EXIF Orientationはcanonical stored WebPへ保持しない。
- EXIF GPS、camera model、撮影日時その他EXIF metadataをBusiness情報として自動保存しない。
- XMP metadataをcanonical stored binaryへ保持しない。
- thumbnailもmetadataなしのstatic WebPとする。
- ICCP/color profileもv0.8ではcanonical binaryへ保持しない。color-management metadata preservationは製品要件外とする。
- canonical writer/re-encode pipelineは可能な限りmetadata chunkを生成しない。
- actual WebP container validationで`EXIF`、`XMP `、`ICCP` chunkを検出したcanonical original/thumbnailはinvalidとする。
- export/restore処理はmetadataをその場で削除してphotoHashを変更しない。既にcanonical storage/backup内に禁止metadataを含むbinaryがある場合はinvalid dataとして扱う。
- 修復はnormal photo replacement/re-registrationを通じてmetadata-free canonical binaryを生成する。
- 将来color profileや撮影metadataを利用する場合はprivacy、UI、Business schema、canonical photo format、backup compatibilityを含む別仕様として導入する。

### 根拠
現在の箱目録では撮影metadataをBusiness機能として利用しない一方、EXIF GPS等は不要なprivacy leakになり得る。orientationだけをpixelへ反映しmetadataを除去することで表示結果を維持しつつ、canonical formatとbackupを単純化できる。

## 56. WebP chunk allowlist — 確定

**確定:** canonical stored WebPは静止画像表現に必要な既知chunkのみをallowlistし、unknown/不要chunkをrejectする。

### 許可するchunk
- simple lossy WebP: `VP8 `
- simple lossless WebP: `VP8L`
- extended static WebP: `VP8X`
- extended lossy alphaで必要な場合: `ALPH`
- `VP8X`使用時のimage payloadとして仕様上妥当な`VP8 `または`VP8L`

### 禁止するchunk
- animation: `ANIM`, `ANMF`
- metadata/color profile: `EXIF`, `XMP `, `ICCP`
- canonical photo specで明示的に許可していないunknown/unrecognized chunk

### validation
- RIFF/WebP containerのchunk boundary、declared length、padding、組み合わせ/order等を、採用parser/libraryで安全に検証可能な範囲でstructural validationする。
- simple/extended WebPとして不正なchunk combinationはrejectする。
- signature/chunk allowlistだけではなく、既確定のactual decode、dimensions、hash、size validationも全て必要。
- export writerがlocal/server/generated binaryを採用するときと、restore PREPARINGで同じallowlistを適用する。
- normal ingestion/re-encode outputがこのallowlist内に収まることをtestで保証する。
- 将来必要なWebP extension chunkが増えた場合はcanonical photo specificationを更新し、明示的にallowlistへ追加する。unknown chunkを自動許可しない。

### 根拠
canonical storageは任意WebP fileのarchiveではなく、箱目録が生成・利用する静止写真の内部形式である。必要な静止画像chunkだけに限定すれば、lossy/lossless/alphaを維持しながらprivacy/security/parser attack surfaceを抑え、export/restore/normal ingestionで同じcanonical invariantを共有できる。

## 57. canonical WebP alpha channel — 確定

**確定:** v0.8のcanonical stored original / thumbnailではstatic WebPのalpha channelを許可する。

- transparent inputはcanonical conversion時にalphaを保持してよい。
- alpha有無をBusiness metadataとして別管理しない。
- alphaを理由に背景色へflattenしてcanonical pixels/photoHashを変更しない。
- thumbnailもalpha保持を許可する。
- WebP chunk allowlistでは、extended lossy alphaの`VP8X + ALPH + VP8 `およびWebP仕様上alphaを内包可能な`VP8L`をvalid static representationとして扱う。
- alpha付き画像にもoriginal max dimension 1600px / max 5MiB、thumbnail max dimension 400px / max 256KiB等の既確定resource limitsを同様に適用する。
- export/restoreのdecode/dimension/hash/size/container validationもalpha有無で緩和しない。
- Vision providerがalpha inputを直接扱えない場合はVision adapter側のtemporary representationとしてflatten/format conversionしてよいが、canonical originalは変更しない。
- UIはalpha専用Business behaviorを持たず、browser image renderingに委ねる。

### 根拠
alphaを禁止するとtransparent sourceのためだけに背景色選択という追加canonical ruleが必要になり、元画像の意味/pixelsを不要に変更する。WebPはstatic alphaを正式に扱えるため、静止画の範囲で許可する方がnormal ingestion・backup・displayを単純に保てる。

## 58. lossy / lossless WebP — 確定

**確定:** canonical readerはstatic lossy WebP（`VP8 `）とstatic lossless WebP（`VP8L`）の両方を許可し、v0.8 normal ingestion writerは原則として現行のlossy WebPを生成する。

- originalのv0.8 default writerはWebP quality 0.85。
- thumbnailのv0.8 default writerはWebP quality 0.8。
- lossless WebPもstatic、metadata-free、allowlisted chunks、decode可能、dimension/size制約等の全canonical invariantを満たせばvalid canonical stored binaryとする。
- export/restoreはvalid lossless original/thumbnailをlossyへre-encodeしない。
- `photoHash` / `thumbnailHash`はactual stored/exported bytesから計算する。
- losslessであること自体をBusiness metadataへ保存しない。
- v0.8 writerにinput特性によるlossy/lossless自動選択ロジックは追加しない。
- 将来、screenshot/text/graphic等にlossless writer optimizationを追加しても、既存reader format contract内で対応可能。
- losslessであってもoriginal <= 5MiB、thumbnail <= 256KiB等のresource limitsを緩和しない。
- normal ingestion writerがsize上限を満たせない場合の処理はphoto ingestion specificationで別途確定する。

### 根拠
readerをlossy限定にするとWebPが正式に持つlossless static representationを不必要に排除し、将来のwriter最適化にもformat migrationが必要になる。一方v0.8 writerは写真主体の現行quality設定を維持することで追加実装を避けられる。

## 59. normal ingestion original size fallback — 確定

**確定:** normal photo ingestionでfirst canonical encodeが5MiBを超えた場合、まずmax dimension 1600pxを維持したままqualityを有限段階で下げ、それでも収まらない場合のみmax dimensionを有限段階で縮小する。

- first attemptはmax dimension 1600px / WebP quality 0.85。
- actual encoded sizeが5MiB以下ならそのbytesをcanonical originalとして採用する。
- 5MiB超の場合、1600pxを維持してqualityを有限candidate sequenceで下げて再encodeする。
- 初期quality候補は`0.85 -> 0.80 -> 0.75 -> 0.70`を基本とし、exact ladderはphoto ingestion specification/testで固定する。
- quality候補を使い切っても5MiB超の場合のみ、max dimensionを有限candidate sequenceで段階的に縮小する。
- 各dimension段階では定義済みquality candidate sequenceを有限回試行する。
- 無限retry、continuous binary search、端末性能に応じた非決定的探索は行わない。
- minimum quality / minimum dimensionの最終candidateでも5MiBを超える場合は`PHOTO_TOO_LARGE`として登録失敗。
- 採用したactual bytesをcanonical stored originalとし、そのbytesから`photoHash`を計算する。
- thumbnailは採用済みcanonical originalから生成する。
- source upload fileそのものはcanonical storageへ保存しない。
- successful optimizationを通常時にwarning表示することは必須としない。ただしdiagnostic/debug情報として採用dimension/qualityを記録可能とする。
- backup/export/restoreではこのfallback変換を行わない。既存canonical originalは既確定invariantに適合するかをvalidationするだけとする。

### 根拠
5MiB canonical invariantを維持しつつ、encoder差や高entropy画像でも利用者による事前加工を可能な限り不要にできる。qualityを先に下げることで解像度を保持し、有限candidate sequenceに限定することで処理時間・test条件・失敗条件を明確にできる。

## 60. 5MiB fallback candidate ladder — 確定

**確定:** normal photo ingestionの5MiB fallbackは、quality ladder `0.85, 0.80, 0.75, 0.70`とmax-dimension ladder `1600, 1440, 1280, 1024`pxの有限candidate sequenceに固定する。

### candidate順序
1. 1600 / 0.85
2. 1600 / 0.80
3. 1600 / 0.75
4. 1600 / 0.70
5. 1440 / 0.85
6. 1440 / 0.80
7. 1440 / 0.75
8. 1440 / 0.70
9. 1280 / 0.85
10. 1280 / 0.80
11. 1280 / 0.75
12. 1280 / 0.70
13. 1024 / 0.85
14. 1024 / 0.80
15. 1024 / 0.75
16. 1024 / 0.70

- 各candidateのdimension値はlong edgeのmax dimension。
- first actual encoded size <= 5MiB candidateをcanonical originalとして採用する。
- source imageのlong edgeがcandidate max dimension未満の場合はupscaleしない。
- no-upscaleにより同一pixel dimensionsとなるdimension段階は重複encodeを避けるためskipしてよい。ただしquality順序は維持する。
- q0.70未満へ自動劣化しない。
- max dimension 1024px未満へ自動縮小しない。
- 最終有効candidateでも5MiB超なら`PHOTO_TOO_LARGE`。
- 採用originalからmax400px / q0.8のthumbnailを生成する。
- 実装/testでは最大16 logical candidatesという上限を前提にできる。
- 将来ladderを変更する場合はcanonical photo ingestion specification/testを同時更新する。

### 根拠
qualityを先に調整して解像度を維持しつつ、1024pxを自動縮小の下限として箱/物品の視認性と将来のVision入力品質を確保する。q0.70をquality下限とすることで過度な圧縮劣化を避け、最大16候補に限定することで処理時間とtest条件も明確になる。

## 61. thumbnail size fallback ladder — 確定

**確定:** canonical thumbnail生成後に256KiBを超える場合、qualityを先に下げ、その後max dimensionを縮小する有限9-candidate ladderをnormal ingestion/export regenerationで共通利用する。

### candidate順序
1. 400 / 0.80
2. 400 / 0.70
3. 400 / 0.60
4. 320 / 0.80
5. 320 / 0.70
6. 320 / 0.60
7. 256 / 0.80
8. 256 / 0.70
9. 256 / 0.60

- dimensionはlong edgeのmax dimension。
- first actual encoded size <= 256KiB candidateをcanonical/export thumbnailとして採用する。
- source canonical originalがcandidate max dimension未満の場合はupscaleしない。
- no-upscaleにより同一pixel dimensionsとなるdimension段階はduplicate encodeを避けてskipしてよい。ただしquality順序は維持する。
- q0.60未満へ自動劣化しない。
- max dimension 256px未満へ自動縮小しない。
- 最終有効candidateでも256KiB超なら`THUMBNAIL_TOO_LARGE`。
- normal ingestionではthumbnail生成成功前にphoto/parent Business updateをcommitしない。originalだけをBusinessへ参照させるpartial successは禁止。
- export時にthumbnail再生成が必要な場合も同じladderを使用する。
- export thumbnailのactual bytesから`thumbnailHash` / `thumbnailSize`を計算する。
- restore PREPARINGは再生成せず、backupに格納されたthumbnailをstrict validationする。
- thumbnail quality/dimensionsはBusiness contentHash/revisionへ含めない。

### 根拠
thumbnailは表示補助のderived representationなので、originalよりsize制約を優先できる。有限9候補に固定することでresource bound/test条件が明確になり、normal ingestionとbackup export regenerationで同じcanonical generation behaviorを共有できる。

## 62. photo ingestion local atomic boundary — 確定

**確定:** photo ingestionのdecode/encode/hash/validationはIndexedDB transaction外で完了させ、全binary/metadata準備成功後に1回のshort readwrite transactionでlocal canonical stateへatomic commitする。

### transaction開始前
- source image decode。
- source orientationをcanonical pixelsへ適用。
- original fallback ladderによるcandidate encode。
- original actual-format / static-only / metadata/chunk / hash / size / dimensions / decode validation。
- `photoHash`計算。
- thumbnail fallback ladderによるcandidate encode。
- thumbnail actual-format / static-only / metadata/chunk / hash / size / dimensions / decode validation。
- `thumbnailHash` / `thumbnailSize`計算。
- client-generated `photoId`確定。
- parentの新しいphoto reference/orderを構成。
- parent canonical payload / contentHashを計算。
- ここまでのどこかで失敗した場合、Business / Outbox / canonical binary stateを変更しない。

### 1回のlocal commit transaction内
- original local binary recordを保存。
- thumbnail local canonical recordを保存。
- parent Business photo references/orderを更新。
- parent `contentHash` / `updatedAt`を更新。
- parent Outbox CREATE/UPDATEを既確定fold ruleに従ってcreate/fold。
- original server uploadに必要なpending state/metadataを保存。
- 必要なreference/index metadataを同transactionで更新。
- transaction failure時は上記全てrollbackし、partial photo registrationを残さない。

### transaction後
- server original uploadはnormal sync schedulerが処理する。
- original upload成功後にparent Pushする既確定dependencyを維持する。
- remote upload/network failureはlocal Business commitをrollbackしない。Outbox/pending stateからretryする。
- 未uploadかつBusinessから参照中のoriginalがlocal唯一copyである間は、通常のevictable cacheとして削除しない。
- thumbnailもparentが参照するcanonical local representationとしてtransactionと整合させる。

### 根拠
画像decode/encode/hashはCPU/codec時間が長くIndexedDB transaction内で実行すべきではない。一方、準備完了後のbinary・Business reference・contentHash・Outbox・upload stateを短いtransactionで一括commitすれば、offline-firstでも参照切れやoriginalだけ/parentだけが残るpartial registrationを防止できる。

## 63. PhotoUploadState / eviction protection — 確定

**確定:** localに`PhotoUploadState = PENDING | UPLOADING | CONFIRMED`を持ち、serverから同一`photoId/photoHash`の保存成功を確認した後にのみ`CONFIRMED`へ遷移する。`CONFIRMED`前のBusiness参照中originalはeviction禁止とする。

### state transition
- canonical local photo commit時: `PENDING`。
- sync workerがupload処理を開始するとき: `UPLOADING`へ遷移可能。
- app/browser crash、worker interruption、timeout等で`UPLOADING`のまま残った場合はretryable stateとして扱う。
- server upload APIがsame `photoId` + same `photoHash`の保存済み状態をsuccess/UNCHANGED相当で返した場合もsuccessful confirmationとして扱う。
- exact matching server success responseを受信した後、short local transactionで`CONFIRMED`へ更新する。
- local stateをserver confirmationより先に`CONFIRMED`へしない。
- different hash / photoId collision responseでは`CONFIRMED`へ遷移せず、既確定のcollision recoveryへ進む。

### eviction
- `PENDING` / `UPLOADING`かつBusinessから参照中のoriginalはlocal唯一copy保護対象でありevict禁止。
- `CONFIRMED`後のoriginalは通常のreferenced-photo on-demand cache eviction policy対象にできる。
- parent Push成功をoriginal upload confirmationの代用にしない。
- server success後、local `CONFIRMED`保存前にcrashした場合は、次回同一upload/存在確認をidempotently再試行して`CONFIRMED`へ収束する。
- false-negativeな`PENDING`残存は許容するが、server未確認のfalse-positive `CONFIRMED`は許容しない。
- server側で後日blob missingが判明し、local copyがまだ存在する場合は`PENDING`へ戻して再upload可能とする。

### 根拠
server存在確認前にlocal唯一copyをevictすると写真を永久消失させる可能性がある。idempotent uploadを利用してfalse-negative PENDINGを安全側として許容し、false-positive CONFIRMEDを禁止すれば、network/crash境界でもdata lossを避けて単純に収束できる。

## 64. CONFIRMED後のoriginal loss / recovery — 確定

**確定:** `PhotoUploadState=CONFIRMED`後にlocal originalがevictされ、server originalもmissingになった場合は`original missing`状態を明示する。canonical originalを復旧できるsourceがあればそれを優先し、無い場合は「元写真の再登録」「backup restore」に加えて、**残存thumbnail等から新しい代替画像を再生成する操作をユーザー選択肢として許可する**。ただし再生成画像を失われたoriginalと同一identityとして扱わない。

### 自動復旧
- server `PHOTO_BLOB_NOT_AVAILABLE`検出時、clientはlocal originalの有無を確認する。
- localに同一`photoId/photoHash` originalが残っていれば`PENDING`へ戻し、同一identityで再uploadする。
- backup等から同一actual bytes / `photoHash`のcanonical originalを取得できる場合は、通常のbackup/restore validationを通して同一identityを復旧できる。
- canonical sourceが見つからない場合、自動的にthumbnailをoriginalへ昇格しない。

### canonical sourceが無い場合のユーザー選択肢
- 元写真を再登録する。
- backupから復元する。
- **残存thumbnail等から代替画像を再生成する。**
- 箱の内部写真など、物理的な再撮影が困難なケースを考慮し、再生成を明示的なrecovery optionとして提供可能とする。

### 再生成を選んだ場合
- 再生成物は失われたoriginalの復元ではなく、**新しいreplacement photo**として扱う。
- new `photoId` / new `photoHash`を発行する。
- parent Businessのphoto referenceをnormal replacementとして更新する。
- parent `contentHash` / `updatedAt` / Outboxも通常のBusiness updateとして更新する。
- 旧photoId/photoHashを再生成bytesへ流用しない。
- thumbnailをupscale/補間しただけの画像でも、actual bytesが異なる以上new identityとする。
- 将来AI super-resolution / generative restorationを導入する場合も同じくnew replacement identityとし、失われたoriginalの真正な復元とは表示しない。
- recovery UIでは「元画像そのものではなく、残っている画像から作成した代替画像」であることを明示する。
- 可能であれば旧photoIdとのrecovery provenanceをruntime/history情報として保持できるが、canonical Business photo identityを偽装しない。

### missing状態
- thumbnailが利用可能なら一覧/parent表示は継続できる。
- original表示要求時にはmissing/recovery UIを表示する。
- missing markerはBusiness contentHash/revisionを変更しないruntime/storage-health state。
- sync全体を永久停止せず、該当photo dependencyだけblock/retry reasonを明示する。
- canonical replacementが完了すればmissing markerを解消する。

### 根拠
thumbnail等から失われたoriginalと同一bytes/photoHashを再構成することはできないためidentityを偽装してはならない。一方、箱内部など再撮影が困難な記録では、残存thumbnailから得られる視覚情報にも実用価値がある。したがって「真正な復元」と「代替画像の再生成」を明確に分離し、後者をnew photo identityのnormal replacementとしてユーザーが選択できる設計がdata integrityと実用性を両立する。

## 65. missing original replacement generation scope — 確定

**確定:** v0.8では残存thumbnailをsourceとしてlocal deterministic replacementを生成し、new photoとして登録できる機能までを標準recoveryとする。AI super-resolution / generative restorationはv1.0以降のoptional recoveryへ分離する。

### v0.8 local recovery
- remaining thumbnailをsource imageとしてnormal canonical photo pipelineへ入力する。
- canonical replacement originalはthumbnailの実pixel dimensionsを維持し、情報量を増やす目的のupscaleは行わない。
- sourceが400px未満でもno-upscale。
- normal photo validation、thumbnail generation、hash計算、atomic local commitを通す。
- new `photoId` / new `photoHash`を発行する。
- parent photo referenceはnormal replacementとして更新する。
- recovery UIでは「低解像度の代替画像」であり、失われた元写真そのものではないことを明示する。
- UI表示上の拡大scaleは許可するが、canonical binaryを単純upscaleして情報が復元されたようには扱わない。
- local recoveryはnetwork/AI/provider availabilityへ依存しない。

### v1.0以降のAI recovery
- AI super-resolution / generative restorationはexplicit user actionでのみ実行する。
- outputはnew `photoId` / new `photoHash`のreplacement photo。
- generated/restored replacementであることを明示し、真正なoriginal recoveryとは呼ばない。
- provider/network/AI failure時もv0.8 local thumbnail recoveryを利用可能に保つ。
- AI-generated detailを旧`photoHash`へ関連付けてoriginal identityを偽装しない。

### 根拠
v0.8のdata recoveryをAI/network/providerに依存させず、残存する実データを最大限そのまま保存できる。AI restorationは再撮影困難時に有用だが、元画像に存在しなかったdetailを生成し得るため、Vision/LLMを含むv1.0側の明示的optional recoveryとして分離する。

## 66. replacement後に真正originalが見つかった場合 — 確定

**確定:** 低解像度/生成replacement作成後にbackup等から旧`photoId/photoHash`と一致する真正originalが見つかっても、自動的にactive parentへ復帰させない。systemは対応関係を検出して「元写真を復元する」選択肢を提示し、active photo selectionはユーザーが決定する。

### recovery provenance
- replacement作成時に旧missing photoとの対応をlocal recovery/history metadataとして保持する。
- 少なくともold `photoId` / old `photoHash`とnew replacement `photoId`の対応を判定できる情報を持つ。
- provenance metadataはBusiness payload/contentHash/revisionへ含めない。
- provenanceはoriginal identityを証明するものではなく、recovery workflow上の対応情報として扱う。

### 真正original候補の検出
- backup restore PREPARING等で旧`photoId/photoHash`に一致するactual original bytesをvalidationできた場合にのみ真正original candidateとする。
- 現在parentにその旧photoから作られたrecovery replacementが存在する場合、special recovery candidateとしてユーザーへ提示する。
- updatedAt、解像度、file size等から自動winnerを決定しない。

### ユーザーが「元写真を復元」を選択
- parent active photo referenceを旧canonical `photoId/photoHash`へ戻す。
- parent `contentHash` / `updatedAt` / Outboxをnormal Business updateとして更新する。
- truly matching original binaryをcanonical storageへpromoteする。
- replacement photoを自動削除しない。
- replacementも保持するか、parentから外して削除対象にするかはユーザー選択とする。

### ユーザーがreplacement維持を選択
- active parent referenceは変更しない。
- backup staging内の真正originalをactive canonical storageへ不要に追加しない。
- restore/session cleanup時にstaging originalをcleanup可能。
- 選択結果はそのrestore/recovery sessionにのみ適用し、将来別backupで再発見した場合の永久抑止にはしない。

### 根拠
真正originalは高品質でも、replacement作成後の現在Business状態を無断で巻き戻すべきではない。identity/hash一致で真正original候補を厳密に判定し、そのうえでactive selectionをユーザーに委ねることで、data integrityと既確定restore conflict policyの双方を維持できる。

## 67. 元写真復帰時のreplacement扱い — 確定

**確定:** 真正originalを復帰する場合は、ユーザー確認後に現在のrecovery replacementを元写真へ**置き換えるだけ**とする。originalとreplacementを同時保持する選択肢は設けない。

- systemが真正original candidateを検出しただけでは変更しない。
- ユーザーへ元写真へ戻す確認を表示する。
- 承認時、replacement photo referenceを外し、旧canonical `photoId/photoHash`を同じphoto array positionへ戻す。
- parent内の写真順序は置換位置を維持する。
- parent `contentHash` / `updatedAt` / Outboxはnormal Business updateとして更新する。
- validated original binaryをcanonical storageへpromoteする。
- 外れたreplacementはBusiness parentから参照されないため、通常のunreferenced photo GC/cache cleanup対象とする。
- replacementをorphan canonical photoとして保持しない。
- 「両方残す」選択肢はv0.8では提供しない。
- AI-generated replacementも同じrule。
- provenance/historyは必要な範囲でlocal recovery/history情報として残してよいが、replacement binaryの保持理由にはしない。

### 根拠
真正originalが見つかった場合の目的は失われた写真の復旧であり、replacementはその間の代替物である。確認付きの単純置換に限定すれば、photo ownership、10枚上限、backup/export、GCを複雑化せず、ユーザーの意図も明確に確認できる。

## 68. recovery provenance retention — 確定

**確定:** recovery provenanceは対応するreplacement photoがBusiness parentからactive参照されている間は保持し、replacementがactiveでなくなった時点で削除可能とする。

### 最小metadata
- replacement `photoId`。
- old missing `photoId`。
- old `photoHash`。
- parent entity type / parent id。
- provenance作成時刻。
- 必要ならrecovery種別（thumbnail-derived / AI-generated等）。
- binary、thumbnail、Business snapshotは保持しない。

### retention
- active replacementが存在する限りtime-based expiryしない。
- 真正originalへの確認付き置換完了時はprovenance削除可能。
- replacementを通常操作で削除した場合も削除可能。
- replacementを別photoへ通常置換した場合も削除可能。
- app startup/maintenanceでparent referenceとの整合を確認し、orphan provenanceをcleanupしてよい。

### boundary
- local-only recovery/history metadata。
- backup/export対象外。
- server sync対象外。
- Business contentHash/revision対象外。
- RestoreHistoryの最大20件retentionとは独立。
- provenanceが失われてもBusiness/photo canonical stateは壊れない。失われるのは後日真正originalをspecial recovery candidateとして自動関連付けする能力だけ。

### 根拠
provenanceの実用目的はactive recovery replacementと旧originalの対応付けであるため、replacement lifetimeに合わせるのが最も単純である。小さいmetadataでも不要な永久履歴は避け、Business/sync/backupへ新たな依存を持ち込まない。

## 69. photo ownership / parent間direct move — 確定

**確定:** v0.8ではphotoをBox / Item / BoxLocationなどのBusiness parent間で直接moveする機能を提供しない。photo ownershipは登録時のparent entityに固定する。

- Itemを別Boxへ移動してもItem.idは維持されるため、Item所有photoのparent identityは変化しない。
- ItemのBox移動ではphoto/recovery provenance更新不要。
- photoを別Business parentで利用したい場合は、新parentへ**new photoとして登録**し、必要なら旧parent側photoを削除する。
- new parent側はnew `photoId` / corresponding `photoHash`を持つnormal photo registration。
- 同じactual image bytesを再利用してもphotoIdは共有しない。既確定どおりphotoHash一致は許容する。
- recovery replacementも同じownership rule。
- provenanceのparent type/idはreplacement作成時から不変。
- parent削除でreplacement referenceが消えた場合、そのprovenanceはcleanup対象。
- 将来direct photo moveを追加する場合は、ownership/provenance/sync/backup atomicityを含む新仕様として定義する。

### 根拠
v0.8でdirect photo moveを許す必要性は低く、photo ownership・recovery provenance・backup・syncの例外を増やす。主要な「Itemを別の箱へ移す」操作ではItem identity自体が維持されるため、photo ownership固定でも実用上の制約にならない。

## 70. 複数parent登録optimization — 対象外

**整理:** 同一`photoId`の複数Business parent参照は既確定の`1 photoId = exactly 1 Business parent` ruleにより禁止されている。

section 69でいう「別parentへnew photoとして登録」は、必要時に通常の独立photo registrationを行うという意味であり、同一sourceを複数parentへ一括登録する機能を要求するものではない。

したがって、複数parent登録を前提としたencode result共有/batch optimizationはv0.8の設計対象から外す。persistent dedup/shared photo identityも導入しない。

## 71. photo削除時のpending/upload cleanup — 確定

**確定:** Business parentからphoto referenceが外れたことをownershipのauthoritative eventとし、unreferencedになったphotoのpending/upload処理は不要扱いにする。upload raceによってphoto referenceを復活させない。

### PENDING
- photo reference削除と同じlocal Business transactionでupload pending/queue stateを解除する。
- parent `contentHash` / `updatedAt` / Outboxをnormal Business updateとして更新する。
- transaction commit後、unreferenced local original/thumbnail binaryをcleanup可能。
- upload workerはparent referenceが存在しないPENDING photoを送信しない。

### UPLOADING
- in-flight requestへbest-effort abortを要求する。
- abort成功/失敗にかかわらずlocal Businessでは削除済みphotoとして扱う。
- upload success responseが後着してもparent referenceを再作成しない。
- serverにoriginal blobが保存済みとなった場合はunreferenced blobとして既確定の30日GCへ委ねる。
- local upload stateは削除済みreferenceに対応する不要stateとしてcleanupする。

### CONFIRMED
- parent reference削除後、local original/thumbnailは通常のunreferenced cleanup対象。
- server blobへ即時delete APIを要求せず、unreferenced 30日GCを利用する。

### atomicity / crash recovery
- photo reference削除、parent contentHash/updatedAt、Outbox update、pending state解除は可能な範囲で同一short IndexedDB transaction。
- binary Blob cleanupのような重い処理はtransaction commit後にidempotently行ってよい。
- crashでorphan local binary/stateが残った場合はstartup/maintenanceでparent referenceをauthoritative sourceとしてcleanupする。
- upload response/stateだけから削除済みBusiness photoを復活させない。

### 根拠
parent referenceを唯一のownership authorityにすると、network raceやcrash時にもBusiness stateが一意になる。server側は既存のunreferenced GCを再利用でき、即時remote deleteやupload cancellation成功をBusiness correctness条件にする必要がない。

## 72. photo削除直後のUI Undo — 確定

**確定:** v0.8ではphoto削除直後に10秒間のUI Undoを提供する。削除そのものは即時にnormal Business updateとしてcommitし、Undoはそのcommitを取り消す特殊rollbackではなく、新しいnormal Business updateとしてphoto referenceを戻す。

### delete
- parentからphoto referenceを削除し、parent `contentHash` / `updatedAt` / Outboxをnormal update。
- 削除前のarray position、photoId、photoHash、およびUndoに必要な最小情報を10秒間のephemeral stateとして保持してよい。
- local original/thumbnail binaryのphysical cleanupは10秒のgrace終了まで遅延。
- UIは「写真を削除しました / 元に戻す」を表示する。

### Undo
- grace内かつ必要binaryがlocalに残っている場合のみ実行可能。
- same `photoId` / `photoHash`を削除前のarray positionへ戻す。
- parent `contentHash` / `updatedAt` / Outboxを新しいnormal Business updateとして更新する。
- server未確認のoriginalは`PENDING`としてupload可能状態へ戻す。
- 削除前にserver確認済みで、その確認状態を安全に保持できている場合は`CONFIRMED`へ戻してよい。
- upload競合でserver側に既にsame photoId/hashが存在していても、PENDINGからのretryは既確定のidempotent uploadで収束できる。
- parent自体の削除などにより安全にreferenceを戻せない場合はUndo失敗を明示する。

### grace終了 / interruption
- 10秒経過後、unreferenced local original/thumbnailは通常cleanup対象。
- app終了、reload、crashを跨ぐUndoは保証しない。
- startup/maintenanceでは残ったorphan binary/ephemeral stateをcleanup可能。
- Undo専用stateはbackup/export/sync/Business contentHash対象外。

### 根拠
短時間のUndoは日常的な誤操作を低コストで救済できる。一方、Business commit自体を遅延したりpersistent undo logを導入するとsync/restoreとの整合が複雑になる。削除とUndoをそれぞれnormal Business updateにすることで既存のOutbox/sync規則をそのまま利用できる。

## 73. photo Undo中のconcurrent parent editと復元位置 — 確定

**確定:** 10秒Undo grace中もparentの通常編集をlockしない。Undoでは対象photoだけを戻し、削除後に行われた他の編集を巻き戻さない。

### ephemeral position anchor
削除時にUndo用ephemeral stateとして次を保持してよい。
- original index。
- `previousPhotoId?`。
- `nextPhotoId?`。
- section 72で定義したphotoId/photoHash等の最小情報。

### Undo insertion
Undo実行時のcurrent photo arrayに対して以下の順で挿入位置を決定する。

1. previous/nextの両方が存在し、current arrayでもpreviousがnextより前なら、可能な限りその間へ挿入する。
2. previousのみ存在する場合、その直後へ挿入する。
3. nextのみ存在する場合、その直前へ挿入する。
4. どちらも利用できない場合、保存したoriginal indexを`0..current length`へclampして挿入する。

- previous/next間に削除後追加されたphotoがある場合、それらを巻き戻さず、previous直後を基本挿入位置とする。
- current arrayの他photo順序をUndoによって変更しない。
- Undo対象photoIdが既に同じparentに存在する場合、duplicate referenceを生成しない。Business integrityを優先し、Undoはno-op/失敗としてUIへ通知する。
- parent削除などで対象parent自体が存在しない場合もUndo不能。
- Undo成功は新しいnormal Business updateであり、current stateからcontentHash/updatedAt/Outboxを生成する。

### 根拠
indexだけではgrace中の追加・削除・並べ替えで位置の意味が変わる。隣接photo identityをanchorにすれば、parent全体のlockやsnapshot rollbackを使わず、削除前の位置を可能な範囲で復元できる。また、Undo後の別編集を消さないことを保証できる。

## 74. 連続photo削除のUndo queue — 確定

**確定:** 各photo delete operationを独立したephemeral Undo entryとして10秒間保持する。UIは複数Snackbarを積まず、1つのUndo surfaceへ集約し、直近の未expire entryからLIFOで1件ずつUndoする。

### queue
- deleteごとに独立entry。
- 各entryは自身のdelete commit時点から10秒でexpire。
- 新しいdeleteによって既存entryのexpiryを延長しない。
- parentを跨いだdeleteも同じlocal ephemeral queueで扱ってよい。
- app終了/reload/crashを跨ぐqueue保持は保証しない。
- Business/sync/backup対象外。
- 固定最大件数は設けず、10秒expiryで自然にboundedとする。

### UI
- surfaceは1つに集約する。
- 例: 「写真を削除しました（3件） / 元に戻す」。
- 件数は現在Undo可能な未expire entry数。
- 「元に戻す」は最も新しい未expire entryを1件だけUndoする。
- さらにUndoしたい場合は再度操作し、次に新しいentryを戻す。
- expired/invalid entryはskip/removeし、次の有効entryへ進めてよい。

### Undo / cleanup
- 各entryはsection 73のposition anchor ruleをcurrent Business stateへ独立適用。
- 1件のUndo失敗で他entryをrollback/deleteしない。
- expireしたentryに対応するphoto binaryは、現在もunreferencedならcleanup可能。
- queue entryの存在だけを理由に10秒を超えてbinaryを保持しない。
- cleanupとexpiry raceはidempotentに扱う。

### 根拠
各deleteをnormal Business operationのまま維持しつつ、短時間の連続誤削除を救済できる。LIFOは直近操作を戻す期待と一致し、単一surfaceならmobile UIも複雑化しにくい。

## 75. photo削除Undo grace中のsync — 確定

**確定:** 10秒のUndo grace中でも通常syncを停止しない。Undoはpresentation上の短期救済であり、sync protocolの待機条件にはしない。

### delete後
- delete commit後のparent Outbox updateは通常どおりPush対象。
- Undo entryの存在を理由にsync schedulerをpauseしない。
- 10秒timerとsync retry/backoffは独立する。

### Push前にUndoされた場合
- Undoはcurrent Business stateに対するnormal update。
- 既確定のOutbox folding ruleを適用する。
- folding結果としてdelete後の中間parent stateをserverへ送らずに済む場合がある。
- correctnessは中間状態が送信されるかどうかに依存しない。

### deleteがserver APPLIED後にUndoされた場合
- Undoは次のnormal Business updateとしてphoto referenceを戻す。
- server側でunreferencedとなったphoto originalがまだ存在する場合は既存photoId/hashを利用できる。
- server blobが既にGC済みになる時間幅ではないが、一般則としてblob unavailableなら既確定のPHOTO_BLOB_NOT_AVAILABLE/reupload ruleに従う。
- upload/server responseだけからUndo entryを変更・延長しない。

### conflict
- sync conflictがgrace中に発生してもUndo timerは延長しない。
- Undo操作はlocal current stateへのnormal editとして既確定のSyncConflict規則に従う。
- Undo entryは独自のserver revision/baseRevisionを保持しない。
- Undo実行時のcurrent local sync stateを利用する。

### 根拠
Undoの一時UI stateをsync schedulerのprotocol条件にすると、network retry/conflict/offlineとの組合せが増える。既存のOutbox folding、idempotent photo upload、SyncConflict規則でdelete→Undoを通常の連続Business updateとして処理できるため、両者を独立させる方が単純で堅牢。

## 76. parent削除時のphoto Undo entry invalidation — 確定

**確定:** parent削除commit時に、そのparentを対象とする未expire photo Undo entryを即時invalidateし、Undo queueから除外する。

### invalidation
- invalidateされたentryはUIのUndo可能件数に含めない。
- そのentryだけを理由に保持していたunreferenced original/thumbnailはcleanup可能。
- parent削除操作そのものをphoto Undoから巻き戻さない。
- parent削除にUndoを設ける場合は別仕様とし、photo Undo queueへ混在させない。
- race対策としてUndo実行時にもparent existenceを再確認し、既に削除済みならfail/invalidateする。

### entity別
- Box自身をparentとするphoto Undo entryはBox削除でinvalidate。
- BoxLocation自身をparentとするphoto Undo entryはBoxLocation削除でinvalidate。
- Item自身が削除された場合、そのItemをparentとするentryをinvalidate。
- Box削除によってItemが`UNASSIGNED`へ移動する場合、Item entity自体は存続するため、そのItemをparentとするphoto Undo entryは維持する。
- Itemの通常Box間移動でもItem.idは不変なのでinvalidateしない。

### 根拠
Undo不能になったentryをUI表示やbinary retentionのためだけに残す意味がない。photo ownershipはparent entity identityに固定されているため、parent identityの存続を基準にinvalid/validを判断すれば一貫する。Box削除時のItem→UNASSIGNEDもItem identityが存続するので例外処理を増やさず扱える。

## 77. RestoreSession APPLYINGとphoto Undo expiry — 確定

**確定:** photo Undoの10秒期限はuser actionを受理した時点で判定する。期限内に受理済みのUndo attemptは、RestoreSession APPLYING等の内部Business write lock待ちによって10秒を超えても、そのattemptに限り有効とする。

### accept / claim
- Undo action handlerは受理時にentryのexpiryを確認する。
- 受理時点で未expireなら、entryを`CLAIMED`相当のephemeral実行中状態へ遷移させて二重Undoを防止する。
- 受理前にexpire済みならUndo不可。
- CLAIMEDはtimer延長ではなく、その1回のaccepted Undo intentを表す。
- CLAIMED stateはephemeralで、app終了/reload/crashを跨ぐ保証はしない。

### lock wait / revalidation
- accepted UndoはBusiness write lock取得を待ってよい。
- lock待ち中に元の10秒expiryを超えても、それだけを理由に失敗させない。
- lock取得後、少なくとも次をcurrent Business stateで再検証する:
  - parentが存在する。
  - Undo対象photoIdが既に同じparentに存在しない。
  - 必要なoriginal/thumbnail binaryが利用可能。
  - ownership ruleに違反しない。
  - section 73のposition anchorをcurrent arrayへ安全に適用可能。
- Restore APPLYING等によって前提が変わり再検証に失敗した場合、Undoは失敗する。
- 再検証失敗時にexpired entryを復活させない。
- 成功時はcurrent stateからnormal Business updateとしてcommitする。

### 根拠
期限内にuserが明示的にUndoしたにもかかわらず、内部lock待ち時間だけで失敗させるのはUI semanticsとして不自然である。一方、lock取得後にcurrent Business stateを再検証することで、Restore APPLYING後のstateを古いUndo snapshotで無条件に上書きすることを防げる。

## 78. RestoreSession RESOLVING中のphoto editとstale detection — 確定

**確定:** RESOLVING中のphoto delete/UndoからRestoreSession conflict stateを直接更新しない。photo操作はnormal Business updateとして完了させ、Restore側の既確定contentHash-based stale detectionをauthoritativeとする。

### photo側
- delete/Undoは通常どおりparent Businessを更新する。
- RestoreSession id / conflict idをphoto Undo entryへ保持しない。
- 保存済みrestore conflictのexistingSnapshot / existingContentHash / resolutionをphoto操作から書き換えない。
- RestoreSession内部stateへの双方向dependencyを作らない。

### Restore側
- conflictを再表示/再評価する時、またはfinal summary / APPLYING前revalidationでcurrent Business contentHashを比較する。
- saved existingContentHashとcurrent hashが異なれば、既確定どおりそのconflictだけstale化する。
- stale化時はresolutionをinvalidateし、existing snapshot/hashをcurrent stateへrefreshして再判断を要求する。
- current Businessがbackup snapshotと一致した場合はauto UNCHANGEDへ収束可能。
- final summary / APPLYING前revalidationがcorrectness上の最終gate。

### optional early UI update
- Business change notification等を利用してRestore UIが早期revalidationすることは許可する。
- ただし早期notification/revalidationはoptimization/UI responsivenessであり、correctness条件ではない。
- notification欠落時でもfinal revalidationで必ず検出できなければならない。

### 根拠
Restore conflictのstale判定は既にBusiness contentHashへ統一されている。photo Undo専用の連携を追加するとRestoreSessionと通常Business編集の双方向依存が増える。contentHash-based final revalidationへ統一すれば、photo以外の通常編集も同じ規則で処理できる。

## 79. Restore APPLYINGとphoto Undo binary cleanupの分離 — 確定

**確定:** Restore APPLYINGはphoto Undo用ephemeral binaryを入力sourceとして利用しない。Restore correctnessをUndo grace/cleanup timingへ依存させない。

### USE_BACKUP
- Restoreでbackup側photoを採用するために必要なoriginal/thumbnailは、PREPARINGで完全検証済みのRestoreSession stagingから取得する。
- APPLYINGで必要なbinary promotionはstaging→canonical storageとして行う。
- Undo queueに残るlocal unreferenced binaryを代替sourceとして利用しない。
- staging側binary不足/不整合はRestore errorであり、Undo binaryが偶然残っていても補完しない。

### KEEP_EXISTING / UNCHANGED
- current canonical Businessを採用/維持するため、新しいbackup binary promotionを要求しない。
- current Businessが参照しているcanonical original/thumbnailは通常のphoto/cache/upload-state規則で保護する。
- この保護はUndo queue retentionとは独立。

### conflict snapshot / stale
- Restore conflict existingSnapshotにはoriginal/thumbnail binary本体を格納しない。
- Business/photo identity metadataおよび必要なhash/reference情報だけを保持する。
- photo delete/Undo等でcurrent refsが変化した場合、APPLYING前contentHash revalidationでstaleを検出する。

### cleanup race
- photo deleteでunreferencedとなったbinaryはsection 72/74の10秒Undo grace終了後cleanup可能。
- RestoreSessionの存在だけを理由にそのephemeral binary retentionを延長しない。
- cleanupとRestore APPLYINGが並行しても、USE_BACKUPに必要なbinaryはstagingへ閉じているためRestore correctnessへ影響しない。
- canonical referenced binaryのcleanup禁止規則は従来どおり適用する。

### 根拠
Restoreの入力を検証済みstagingへ閉じれば、Undoという短期UI機能のlifecycleをrestore transactionへ持ち込まずに済む。これによりcleanup timing、app interruption、Undo expiryがRestore correctnessへ影響しない。

## 80. RestoreSession staging binary pre-promotion / cleanup — 確定

**確定:** APPLYING開始前に、最終apply snapshotで必要なUSE_BACKUP/new entity photo binaryを検証済みstagingからcanonical photo storageへpre-promoteし、canonical存在/hashを確認してからBusiness atomic commitへ進む。staging cleanupはBusiness commit後のcanonical binary verification成功をgateとする。

### pre-promotion
- final summary完了かつstale/unresolved conflictがないことを確認後、最終apply snapshotを固定する。
- そのsnapshotで最終的に参照されるUSE_BACKUP/new entity photoだけをpre-promote対象とする。
- original/thumbnailともstagingで既にPREPARING validation済みであることを前提とする。
- canonical storageへ書き込んだ後、photoId/hash/必要size等を再確認する。
- same photoId + same hashがcanonicalに存在する場合は再copyせずreuse可能。
- same photoId + different hashはPHOTO_ID_COLLISIONとしてBusiness commitへ進まない。
- pre-promoted binaryはまだBusinessから参照されないため、commit前はRestoreSessionに紐づくtemporary protected orphanとして扱う。

### Business atomic commit
pre-promotion完了後、短いIndexedDB readwrite transactionで少なくとも次をatomic commitする。
- Business entity changes。
- photo references/order。
- parent contentHash。
- required reference fixes。
- Outbox create/update。
- RestoreSession `appliedAt`。

- Blob copyそのものをこのBusiness transactionへ大量に含めない。
- transaction abort時はBusiness/Outbox/appliedAtの変更を一切残さない。

### abort / retry
- Business transaction abort時、pre-promoted binaryはunreferencedのまま残り得る。
- retryable RestoreSessionではsame photoId/hashを検証して再利用してよい。
- session cancel/nonretryable terminationが可能なstateなら、不要なpre-promoted orphanはcleanup対象。
- ordinary GCがactive RestoreSession用pre-promoted binaryを誤削除しないようtemporary protectionを持つ。

### commit後 verification / cleanup
- `appliedAt != null`となった後、final Business refsが必要なcanonical original/thumbnailをphotoId/hashどおり参照できることをverifyする。
- verification成功後にRestoreSessionをCOMPLETEDへ収束させる。
- その後stagingおよび不要なpre-promoted orphanをidempotently cleanupする。
- COMPLETED statusを書いただけではstagingを先に削除しない。canonical verification成功がcleanup gate。
- cleanup failureはRestore Business commit失敗とは扱わず、後続maintenanceでretry可能。

### crash recovery
- `APPLYING + appliedAt != null`: Business commit済み。再apply禁止。canonical binary verification → COMPLETED convergence → cleanup。
- `APPLYING + appliedAt == null`: Business未commit。既存pre-promoted binaryを検証し、safe retry/reuse可能。
- crash時にstaging/pre-promoted binaryが残ることを許容し、Business correctnessよりcleanupを優先しない。

### 根拠
大きなBlob copyをBusiness/Outbox atomic transactionから分離するとtransactionを短くできる。一方、pre-promotionをBusiness commitより先に完了させることで、canonical Business referenceだけが確定してbinaryが存在しない状態を防げる。appliedAtとBusiness commitを同一transactionに置く既確定規則とも整合し、crash後もcommit済み/未commitを一意に判定できる。

## 81. Restore pre-promoted binary temporary protection — 確定

**確定:** Business commit前にcanonical photo storageへpre-promoteしたbinaryをordinary orphan/cache cleanupから保護するため、local-only system record `RestorePromotedPhoto` を持つ。

### record
key:
- `[restoreSessionId, photoId]`

最小field:
- `restoreSessionId`
- `photoId`
- `photoHash`
- `promotedAt`

- original/thumbnailは同一photoIdのcanonical pairとして1 recordで保護する。
- protection metadata自体はBusiness entityではない。
- backup/export/sync/contentHash対象外。

### creation
- pre-promotion binary writeと`RestorePromotedPhoto`作成は、利用storage構成で可能なら同一local transactionにする。
- protectionが成立する前にordinary cleanupがbinaryを削除できるwindowを作らない。
- same session/photoId/hashの既存recordはidempotently reuse可能。
- same photoIdでhash不一致の場合はPHOTO_ID_COLLISION等の既定errorとしてBusiness commitへ進まない。

### GC / cache protection
- ordinary orphan/cache cleanupは、active/retryable RestoreSessionに属する有効なprotection recordのphotoIdを削除しない。
- protection中binaryはBusiness未参照でもtemporary protected orphanとして扱う。
- protectionはcache LRU対象から除外する。

### commit後
- Business commit後、section 80のcanonical binary verificationが成功したらprotectionを解除する。
- final Businessから参照されているbinaryは通常canonical lifecycleへ移行する。
- final Businessに参照されなかったpre-promoted binaryはprotection解除後orphan cleanup対象。
- cleanup failureはBusiness restore failureにしない。

### startup / recovery
- active/retryable RestoreSessionに属するrecordは維持する。
- `APPLYING + appliedAt == null`ではpre-promoted binaryを検証してretry/reuse可能。
- `APPLYING + appliedAt != null`では再applyせずcanonical verification後にprotection解除/COMPLETED convergenceへ進む。
- COMPLETED/CANCELLED/nonretryable terminated sessionのrecordはcanonical Business refsを確認してから解除/cleanupする。
- session自体が存在しないorphan protection recordもcanonical refsを確認し、参照中binaryを削除せずprotection metadataだけ整理するか、unreferenced binaryとともにcleanupする。

### 根拠
pre-promoted binaryはBusiness commit前には通常のreference scanだけではorphanに見える。session/photo単位の小さなlocal protection metadataを置けば、ordinary GCとのraceを防ぎつつBusiness modelやsync protocolへrestore固有stateを持ち込まずに済む。crash後も所属sessionを明確に追跡できる。

## 82. Restore staging / protected binaryのstorage pressure — 確定

**確定:** active/retryable RestoreSessionのstagingおよび`RestorePromotedPhoto`で保護されたbinaryはautomatic evictionしない。storage不足時はresume/retry可能性とrestore atomicityを優先し、必要ならuserへ明示的なresume/cancel判断を要求する。

### eviction priority
- PREPARING時に`navigator.storage.estimate()`等でadvisory capacity checkを行い、actual staging writeをauthoritativeとする既確定規則を維持する。
- active/retryable RestoreSessionのstaging/protected binaryは通常cache LRUより強く保護する。
- storage pressure時は、まず通常規則でevict可能なunreferenced/referenced-confirmed original cache等をcleanupする。
- restore staging/protected binaryを容量確保のためsilent deleteしない。
- completed Businessが参照するcanonical binaryは通常photo lifecycleの保護規則に従う。

### user action
- 通常cache cleanup後も容量不足なら、UIでactive restoreがstorageを使用していることを明示する。
- 可能な範囲でrestore使用量/必要容量/available storageを表示する。
- cancel可能stateではuserの明示cancelによりstaging/protectionをcleanupして容量を解放できる。
- cancelによってBusinessへ未commitのrestore内容を部分適用しない。
- APPLYINGは既確定どおりcancel不可。recovery/convergenceを優先する。
- automatic timeout/ageによるrestore session cancelは行わない。

### external eviction / loss detection
- browser/OS等app外の強制evictionによりstaging/protected binary欠損を検出した場合、欠損を推測・thumbnailから再生成・別binaryで代替してrestoreを続行しない。
- `appliedAt == null`でBusiness未適用なら安全なERRORへ遷移し、retryに必要な完全stagingを再構築できない場合はuserへcancel/new restoreを要求する。
- `appliedAt != null`の場合はBusiness commit済みなので再applyしない。canonical referenced binaryを検証し、欠損があれば通常のphoto recovery/storage-health問題として扱い、Restore commitを巻き戻さない。
- storage loss detectionとBusiness commit状態を混同しない。

### 根拠
resumable restoreを保証するにはstaging/protected binaryをcacheと同列にevictできない。storage pressure時にsilent data lossや部分restoreを選ぶより、通常cacheを先に解放し、それでも不足する場合はuserへ明示的な判断を委ねる方がatomicityと予測可能性を維持できる。

## 83. 長期間放置されたactive RestoreSessionの起動時提示 — 確定

**確定:** app起動時にactive/retryable RestoreSessionを検出した場合、persistent but non-blocking bannerで利用者へ明示する。通常利用は原則許可し、新しいrestore開始のみ禁止する。ageだけを理由としたautomatic cancel/deleteは行わない。

### PREPARING / RESOLVING / retryable ERROR
- 「復元作業が途中です」等のbannerを表示する。
- 通常のBox/Item閲覧・編集は既確定規則に従い許可する。
- `再開`を提示する。
- cancel可能stateでは`キャンセル`も提示する。
- storage使用量を取得可能なら併記する。
- active session中は新規restore file選択/開始をdisableする。

### APPLYING
- 起動時にrecovery/convergenceを自動開始する。
- UIは「復元処理を完了しています」等の進行状態を表示する。
- cancelは提示しない。
- write serialization等の制限は既確定APPLYING規則に従う。

### banner dismiss
- bannerを閉じてもRestoreSession自体はcancel/changeしない。
- dismissは現在のapp session内だけに有効とし、永続化しない。
- 次回app起動時にsessionがまだactive/retryableならbannerを再表示する。
- dismiss後も設定/backup画面等からactive restoreへ戻れる入口を提供する。

### age / storage pressure
- session ageは経過時間表示やwarning強調に利用してよい。
- ageだけを理由にautomatic cancel、staging削除、protection解除を行わない。
- storage pressure時はsection 82を優先し、必要なら通常bannerより強い容量不足UIへ昇格してresume/cancel判断を求める。

### 根拠
resumabilityを維持しながら通常利用を不必要にblockせず、staging/protected binaryによるstorage占有を利用者から見えない状態にしない。dismissを永続化しないことで、長期間放置されたactive sessionも次回起動時に再認識できる。single-active-session ruleにより新規restoreとの競合も防止する。

## 84. RestoreSession age表示 / warning threshold — 確定

**確定:** active/retryable RestoreSessionのbannerでは開始日時と経過時間を表示可能とするが、session ageだけを根拠とした固定warning thresholdは設けない。

### 表示
- RestoreSessionの開始日時を表示する。
- 利用者が放置期間を把握しやすいよう、「6日前」等の経過時間を併記してよい。
- storage使用量を取得可能な場合はsection 83どおり併記する。
- 経過時間表示はinformationalであり、session stateやcleanup eligibilityを変更しない。

### warning
- 「3日超過」「30日超過」等、ageだけによるwarning level変更は行わない。
- ageだけを理由にautomatic cancel、staging削除、protection解除、新たな操作制限を行わない。
- storage pressure、binary欠損、retryable ERROR等の実際の状態変化がある場合は、それぞれの既確定規則に従って警告を強める。
- 表示上の経過時間が長くても、それ自体を異常状態とは扱わない。

### 根拠
RestoreSessionが長期間activeであることだけでは異常とは判断できない。開始日時と経過時間を提示すれば利用者は放置期間を判断でき、固定thresholdによる恣意的な警告を避けられる。実際にstorage不足やデータ欠損等が発生した場合のみ、その具体的状態に基づいて警告を強める方が予測可能である。

## 85. active RestoreSessionのstorage使用量表示 — 確定

**確定:** banner等で表示する「復元データ」容量は、当該RestoreSessionに属するstaging binaryと`RestorePromotedPhoto`で保護されたpre-promoted binaryの概算合計とする。箱目録全体やbrowser origin全体のstorage使用量とは混在させない。

### 算出対象
- 当該RestoreSessionのstagingに保持されているoriginal/thumbnail binary。
- 当該RestoreSessionの`RestorePromotedPhoto`で保護され、まだ通常Business lifecycleへ移行していないpre-promoted binary。
- 同一canonical binaryを複数recordから参照しても二重加算しない。
- Businessから通常参照されているcanonical photoや通常cache、他session由来データは含めない。

### 表示
- byte sizeを取得・集計できる場合のみ、「復元データ: 約 1.2 GB」等の概算表示を行う。
- 表示値はadvisoryとし、厳密な解放可能容量を保証する値として扱わない。
- 正確または合理的な概算を取得できない場合、推測値を生成せず容量表示自体を省略する。
- browser/origin全体の使用量を併記する必要がある画面では、「復元データ」と明確に区別して表示する。

### cancelとの関係
- 表示容量を「キャンセルすると必ずこの容量が空く」と表現しない。
- cancel後もcanonical参照済みbinary、transaction/DB overhead、browser側のstorage accounting等により同量が即時解放されるとは限らない。
- cleanup failure時は既確定どおりmaintenance retry対象とする。

### 根拠
RestoreSession固有の占有量だけを示すことで、利用者が復元途中データの規模を把握できる。一方、origin全体のstorage量を混ぜるとrestore cancelによる解放量と誤認しやすい。取得不能時に推測値を出さないことで、advisory表示の信頼性も維持する。

## 86. RestoreSession storage使用量のincremental metadata — 確定

**確定:** RestoreSession固有のstorage使用量はlocal-only metadataとしてincrementalに管理し、値が欠損・不整合・疑わしい場合にbinary実体からrecountして再構築可能とする。

### metadata
RestoreSessionまたはRestoreSessionに紐づくlocal-only集計metadataとして、少なくとも次を保持可能とする。
- `stagingBytes`
- `promotedBytes`

表示上のrestore使用量は原則として両者の合計を用いる。

### update
- staging binaryの追加/削除時に`stagingBytes`を更新する。
- pre-promotion/protection追加・解除・cleanup時に`promotedBytes`を更新する。
- 同一binaryを二重加算しない。
- binary操作と集計更新は、利用storage構成で可能なら同一transactionに含める。
- transaction境界を共有できない場合は、binary実体を正としmetadataは後からreconcile可能とする。

### recount / recovery
- metadata欠損、負値、不可能な値、migration後、crash recovery等で信頼できない場合は、当該RestoreSessionに属するbinary実体を走査してrecountする。
- recount結果でmetadataを再構築する。
- 通常のapp起動/banner表示ごとに全binary scanを必須としない。
- recount中に容量表示が確定できない場合はsection 85どおり表示を省略してよい。

### authority
- `stagingBytes` / `promotedBytes`はUI・diagnostic用のadvisory metadataである。
- restore completeness、hash validation、APPLYING可否、cleanup可否、binary存在判定のauthorityには使用しない。
- restore correctnessは常に実際のrecords/binary/hash/state等の既確定情報から判定する。

### 根拠
大量photoを含むrestoreで起動ごとの全binary走査を避けながら、crashや非atomic storage操作で集計値がずれても実体から復旧できる。集計値をcorrectness判定から分離することで、容量表示最適化がrestore atomicityへ影響しない。

## 87. RestoreSession storage metadata recount trigger — 確定

**確定:** RestoreSession storage metadataの自動recountは疑義を検出した場合のみ実行し、起動ごと・日次等の定期recountは行わない。

### recount trigger
少なくとも次の場合はrecount対象とする。
- `stagingBytes` / `promotedBytes` metadataが欠損している。
- 負値、overflow、その他schema上あり得ない値を検出した。
- crash recoveryでbinary操作とmetadata更新の整合性を保証できない。
- storage/schema migration後に旧集計値の正当性を保証できない。
- binary操作成功後にmetadata更新失敗等、transaction不成立/部分成功が判明した。
- diagnostic/consistency checkで実体との不整合を具体的に検出した。

### normal operation
- app起動ごとの全binary recountは行わない。
- 日次・週次等のtime-based periodic recountは行わない。
- metadataが正常で疑義がない限りincremental値をそのままUI表示に使用する。

### recount中 / failure
- recountはstorage容量表示の再構築処理であり、restore correctness判定そのものではない。
- recount中はsection 85どおり容量表示を一時的に省略してよい。
- recount failureだけを理由にRestoreSessionをERRORへ遷移させない。
- restore処理に必要なbinary/hash/state検証は既確定規則に従い独立して行う。
- recount failureはdiagnostic情報として保持し、後続の適切な契機でretry可能とする。

### 根拠
容量metadataはadvisoryであり、正常時に全binaryを定期走査するI/Oコストを負担する必要はない。具体的な不整合可能性が生じた場合だけ実体から再構築すれば、section 86のincremental管理の利点を維持しつつ表示値の自己修復性も確保できる。

## 88. 次の設計判断候補

**RestoreSessionのstorage容量recountをforegroundで完了待ちするか、backgroundで実行して完了後にbanner表示を更新するか**を確定する必要がある。
