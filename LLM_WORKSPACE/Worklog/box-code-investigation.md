# Box.code 現行実装調査

更新: 2026-09-12
対象ブランチ: `develop`

## 調査目的
`Box.code`の正式仕様を確定する前に、現行実装の生成方式・QR利用・重複確認の差異を整理する。

## 現行実装

### 1. `apps/web/src/lib/codegen.ts`
`newBoxCode()`は以下の形式を生成する。

```text
BX-<Base36時刻末尾5桁>-<Base36乱数5桁>
```

例:
```text
BX-2KJ6A-9XH3Q
```

特徴:
- `Date.now().toString(36)`の末尾5文字を大文字化
- `Math.random().toString(36)`由来5文字を大文字化
- 既定prefix=`BX-`
- `RegisterClient.tsx`の「箱コード発行」で使用

### 2. `apps/web/src/lib/id.ts`
`generateBoxCode()`は読み間違いにくい文字集合から暗号学的乱数で生成する。

```text
ALPHABET = ABCDEFGHJKMNPQRSTUVWXYZ23456789
format   = BX-XXXXX
```

特徴:
- `O / I / L / 0 / 1`を除外
- `crypto.getRandomValues()`使用
- 既定5文字
- `/boxes/new`で使用
- `/boxes/new`では`isBoxCodeTaken(code)`によるlocal重複確認あり

## QR関連

### 現在のQRラベル
`QrLabel24.tsx`は`makeQrSvg(code, 512)`を呼び、`Box.code`文字列そのものをQR payloadとしている。

これは確定済み方針:
```text
QR payload = Box.code only
```
と一致する。

### 旧/stale実装
`apps/web/src/lib/qrpayload.ts`の`buildQrPayload()`は`/b/<code>`を返しており、確定済み仕様と矛盾する。

実装修正段階で、QR生成側は`Box.code`のみへ統一し、この旧仕様依存を除去または整理する必要がある。

## 問題点
- Box.code生成方式が2系統あり、形式も乱数方式も異なる
- `RegisterClient`側は`Math.random()`、`/boxes/new`側は`crypto.getRandomValues()`
- `/boxes/new`にはlocal重複確認があるが、統合登録画面側には同等確認が見当たらない
- 5文字のhuman-friendly random codeは運用規模拡大時の衝突余地があるため、server側一意制約と衝突時再発行は必須
- 既存保存済みBox.codeを形式変更のためだけに自動書換えすると、印刷済みQRとの対応を壊すため避けるべき

## 次の判断候補
新規発行するBox.codeの標準形式を1つに統一する。

推奨:
```text
BX-XXXXXXXX
```

- alphabet: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
- 8文字固定
- `crypto.getRandomValues()`使用
- canonicalはASCII uppercase
- user scope内一意
- clientはlocal重複確認可能だが、最終判定はserver一意制約
- server collision時は既存Boxを上書きせず、clientが新codeを再発行して再Push
- 一度canonicalに成立したBox.codeは原則immutable
- 既存legacy codeは自動変換せず、そのまま有効として保持
- QR payloadはcanonical済みBox.codeそのもの

根拠:
- `id.ts`方式は読み間違い防止と暗号学的乱数の点で`codegen.ts`より適切
- 5文字より8文字へ拡張することで衝突余地を大きく下げられる
- legacy codeを維持することで既存ラベル/QRとの互換性を壊さない
- codeの生成形式とcodeの受理形式を分離すれば、将来の生成方式変更にも対応しやすい

## 未確定
- 新規標準を`BX-XXXXXXXX`で正式採用するか
- legacy受理形式をどこまで明文化するか
- Box.codeをcanonical成立後immutableとするか、明示的な再発行機能を将来許すか
