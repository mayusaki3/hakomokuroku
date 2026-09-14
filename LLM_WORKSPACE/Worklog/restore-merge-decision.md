# backup/restore merge判断

更新: 2026-09-15
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`

## 確定事項

同一`Box.id + Box.code`でbusiness contentが異なる場合、restore時に`updatedAt`で自動的な勝者決定は行わない。

- business contentが同一ならUNCHANGED相当として扱う。
- business contentが異なる場合は、利用者に「既存優先」または「backup優先」を選択させる。
- 「既存優先」では現在localにあるbusiness contentを維持し、backup側内容を反映しない。
- 「backup優先」ではbackup側business contentを通常のlocal business updateとして反映する。
- backup優先で内容が変化した場合はOutboxを生成し、通常同期経路でserverへPushする。
- backup側の`revision / syncSeq / serverUpdatedAt / cursor / SyncState / Outbox`等のsync metadataは持ち込まない。
- `Box.code`はどちらを選んでも変更しない。
- restore処理は通常sync conflictとは別の利用者判断として扱う。

## 根拠

`updatedAt`はclient business時刻であり、端末時計差やoffline期間を含むため、同期設計上も競合勝者の決定には使用しない。backup restoreでも同じ原則を維持し、内容差分がある場合は利用者の明示的判断で決定する。

backup側のsync metadataを復元すると現在のserver canonical stateやlocal SyncStateとの整合性を壊すため、backupはbusiness dataの入力として扱い、選択された内容を現在端末の通常local updateとして再構成する。

## 中断・再開

この設計作業は判断点ごとに中断可能とする。

- 確定済み判断は`LLM_WORKSPACE/Worklog`へ保存する。
- 中断時点の「次の判断点」をSavePointまたは関連Worklogへ残す。
- 再開時は最新の`LLM_WORKSPACE/Worklog/savepoint.md`と関連Worklogを確認し、その後repositoryのcanonical project stateを再確認して続行する。
- 別chat・後日再開でも、確定済み判断を再度選び直す必要はない。

## 次の判断候補

backup/restoreで複数entityに内容競合が存在する場合、利用者確認を1件ずつ行うか、まとめて適用できる「以降すべて既存優先 / backup優先」を提供するかを確定する。
