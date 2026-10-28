# 箱目録 v0.8 旧UI参照基準（削除前）

記録日: 2026-10-28
対象: mayusaki3/hakomokuroku / develop

## 参照コミット

- 旧UIを含む確認済みコミット: `e9326c7`
- 参照先: https://github.com/mayusaki3/hakomokuroku/tree/e9326c7
- このコミットは旧DB/API/UI削除前の参照基準。新UI作成時の画面構成・入力項目・操作フローの参考とする。
- 旧UIの実装は新DB/APIへ移植せず、新UIを独立して実装する。

## 削除と検証の方針

1. 旧DB、旧同期API、旧互換処理はデータ移行なしで削除する。旧APIを復活させない。
2. 旧UIが旧DB/APIに依存してビルドできない場合、旧UIを一時的にビルド対象から除外するか先行削除する。
3. 新DBスキーマ、新API、同期処理の設計要求をテストで検証し、完了後に新UIを実装する。
4. 認証・設定など新システムでも必要なAPIは旧APIとみなして削除しない。
5. 旧UIの参考ソースはこの固定コミットから参照できる。旧DBのデータ移行・互換性は提供しない。

## 旧UIの代表的な参照パス（このコミット内）

- `apps/web/src/app/(authed)/register/RegisterClient.tsx`
- `apps/web/src/app/(authed)/register/box/page.tsx`
- `apps/web/src/app/(authed)/register/items/page.tsx`
- `apps/web/src/app/(authed)/register/box-photos/page.tsx`
- `apps/web/src/app/(authed)/register/label/page.tsx`
- `apps/web/src/app/(authed)/register/location/page.tsx`

注意: この記録は削除実施の証明ではない。削除コミットは別途記録する。
