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

## 54. 次の設計判断候補

**WebP animationをcanonical stored photoとして許可するか**を確定する必要がある。

背景:
- WebP containerは静止画だけでなくanimated WebPも表現できる。
- 現在の写真用途は箱/アイテム/場所の静止写真であり、thumbnail生成・Vision・表示・hash/size/dimension validationも静止画前提で設計されている。
- browser canvas経由のcanonical ingestionは通常first/current frameを静止WebPとして再encodeするため、正常経路ではanimationを保持しない想定。
- untrusted backup/server dataでanimated WebPを許すと、frame count/duration/decode resourceの追加制約が必要になる。

推奨案:
- **v0.8/v1 backupおよびcanonical stored photoはstatic WebPのみ許可し、animated WebPをrejectする。**
- WebP container parsingで`VP8X` animation flag / `ANIM` / `ANMF` chunk等を検出した場合はinvalid canonical photoとする。
- original/thumbnailともanimation禁止。
- export/restore双方で同じvalidation。
- normal ingestionでanimated input（GIF/animated WebP等）を受ける場合は、canonical conversion時に単一静止frameへ変換して新しいstatic WebPとして保存する方針をphoto ingestion specで明示する。
- animation frame count/duration等はBusiness metadataに持たない。
- backup処理中にanimated stored originalを勝手にfirst-frame変換してphotoHashを変えない。既にcanonical storageへ入っているanimated WebPはinvalid dataとして通常のphoto replacement/re-registrationで修復する。
- 将来animationをBusiness機能として導入する場合はphoto format/spec/schema/resource limitsを別途拡張する。

根拠: 箱目録のphotoは静止記録用途であり、animationを保持する製品要件がない。static-onlyにすればdecoder resource safety、thumbnail生成、Vision、backup validationを単純かつ一貫して保てる。