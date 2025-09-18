# hakomokuroku — 箱の目録・QRラベル管理

## 目的
引っ越し・片づけ時に、箱の中身を写真＆テキストで記録し、QRで素早く参照・検索するPWA。

## 現在のMVP
- 撮影フロー: アイテム先撮り → 箱確定＆QR発行 → 箱外観撮影
- IndexedDB保存（Dexie）/ オフライン対応（PWA）
- QR(SVG)生成 / 24mmテープ向けレイアウト

## 使い方（開発）
```bash
pnpm i
pnpm dev
# http://localhost:3000
