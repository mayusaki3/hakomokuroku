[目次](../目次.md) > アーキテクチャ > 写真 / Blob設計

# 写真 / Blob設計

## 1. 目的

箱目録では写真を、対象を識別し、必要な物品や保管場所へ迷わずたどり着くための補助情報として使用する。

写真を持てるBusiness entity:

- Box（箱情報）
- Item（物品情報）
- BoxLocation（箱の場所情報）

用途はentityごとに異なる。

- Box写真: 実物の箱を識別する。
- Item写真: 実物の物品を識別する。
- BoxLocation写真: 部屋、棚、押入れ等のどの位置かを視覚的に識別する。

BoxLocation写真は単なる場所の代表画像ではなく、「その場所のどこへ行けばよいか」を判断する情報として使用できる。

## 2. Business dataと写真binaryの分離

写真は独立したBusiness sync entityにしない。

Box / Item / BoxLocationはordered `PhotoRef[]` をBusiness contentとして持つ。

```text
PhotoRef
  photoId    string
  photoHash  string
```

PhotoRefの配列順序を表示順とする。

写真binary、thumbnail binary、upload stateはBusiness contentへ含めない。

これにより、写真の追加・削除・並べ替えは親Business entityの変更として同期し、binary転送状態はBusiness conflict判定から分離する。

## 3. 写真枚数

各Box / Item / BoxLocationは0〜10枚の写真を持てる。

11枚目は追加できない。

枚数制約は親Business entityのvalidationとして扱う。

## 4. photoId

各写真は一意な `photoId` を持つ。

1つのphotoIdはexactly 1つのBusiness parentに所属する。

同一写真を複数entityで共有する仕組みは設けない。

同じ画像bytesが複数回登録されても、それぞれ別photoIdとして扱う。

写真binaryのdeduplicationは行わない。

## 5. photoHash

`photoHash` は保存対象となるoriginal photo bytesから算出するSHA-256。

photoHashは次の確認に使用する。

- local binaryとPhotoRefの対応確認
- upload済みbinaryとの一致確認
- corruption検出
- upload retry時の同一内容確認

photoHashが同一でもphotoIdが異なれば別写真である。

## 6. Original（原本）

登録時に写真をcanonical originalへ変換する。

```text
format       WebP
long edge    1600 px
quality      0.85
max size     5 MiB
```

EXIF orientation等、表示方向に影響する情報はcanonical化時に反映し、保存後の表示が端末依存にならないようにする。

canonical original bytesからphotoHashを算出する。

5 MiBを超える場合は登録を完了しない。

## 7. Thumbnail（サムネイル）

一覧表示等のためthumbnailを生成する。

```text
format       WebP
long edge    400 px
quality      0.8
max size     256 KiB
```

thumbnailはBusiness identityを持たない派生データ。

thumbnailが失われてもoriginalから再生成可能とする。

## 8. ローカル保存

User-local IndexedDBに少なくとも次を保持する。

### 8.1 photoOriginals

```text
photoId
blob
photoHash
byteLength
width
height
storedAt
lastAccessedAt
```

### 8.2 photoThumbnails

```text
photoId
blob
byteLength
width
height
storedAt
lastAccessedAt
```

### 8.3 photoUploadStates

```text
photoId
photoHash
state
lastAttemptAt?
confirmedAt?
lastErrorCode?
lastErrorAt?
retryable?
```

state:

```text
PENDING
UPLOADING
CONFIRMED
```

upload stateはBusiness contentではない。

## 9. 写真追加

写真追加はlocal-firstで行う。

基本フロー:

1. 入力画像をcanonical originalへ変換する。
2. thumbnailを生成する。
3. photoIdを生成する。
4. photoHashを算出する。
5. original / thumbnailをlocalへ保存する。
6. 親Business entityのthumbsへPhotoRefを追加する。
7. 親Business更新とOutboxを同一IndexedDB transactionでcommitする。
8. 通信可能時にbinaryをserver-readyにする。
9. 親Business変更を通常同期する。

Business変更をserverへPushする時点では、参照するphoto binaryがserver-readyであることを確認する。

## 10. 写真の並べ替え

`thumbs` の配列順序が写真の表示順。

並べ替えは親Business entityの通常更新として扱う。

UIではdrag操作を提供してよい。

dragを利用できない環境やaccessibilityのため、少なくとも「前へ」「後ろへ」による並べ替えを可能とする。

並べ替え後のBusiness更新とOutboxは同一IndexedDB transactionでcommitする。

## 11. 写真削除

写真削除は親Business entityの `thumbs` からPhotoRefを削除する操作。

削除操作はlocalへ即時反映する。

削除後10秒間はUndo可能とする。

Undo期間中はoriginal / thumbnail binaryをphysical deleteしない。

Undoされた場合は元のPhotoRefと表示位置を復元する。

Undo期間終了後も、server同期や他の参照状態を確認せず直ちにbinaryを削除してはならない。

## 12. 写真変更と競合

写真追加、削除、並べ替えは親Business entityのBusiness content変更である。

同じ親entityを複数Deviceで変更した場合、通常のrevision / contentHash規則で競合判定する。

写真配列だけを自動mergeする特別規則は設けない。

競合処理は [同期モデル](./50_同期モデル.md) を参照。

## 13. Offline

offlineでも次を可能とする。

- localに存在する写真の表示
- 写真追加
- 写真削除
- Undo
- 写真並べ替え

offline中に追加した写真はlocal original / thumbnailとPENDING upload stateを保持する。

通信回復後にbinary uploadとBusiness同期を継続する。

## 14. Server側binary

serverはphotoIdとphotoHashによってBusiness側PhotoRefと写真binaryの対応を確認できるようにする。

Business Pushで新しいPhotoRefを受理する前に、そのphotoId / photoHashに対応するbinaryがserver-readyであることを確認する。

binary uploadが未完了の場合、Businessだけをcanonical stateとして受理しない。

## 15. Cache / GC

thumbnailは再生成可能なcacheとして扱える。

originalはBusiness dataから参照されている間は削除してはならない。

GC対象候補:

- Businessから参照されなくなったoriginal
- Businessから参照されなくなったthumbnail
- 再生成可能な古いthumbnail cache
- 完了済みupload state
- 中断された未参照upload

GCは現在のBusiness意味を変更してはならない。

参照状態または未同期状態を安全に判定できない場合は削除しない。

## 16. Backup / Restore

BackupにはBusiness側PhotoRefだけでなく、対象となる写真binaryも含める。

Restore時はphotoId / photoHashとbinaryの整合性を検証する。

同じphotoHashを持つ写真が複数存在してもphotoId単位で復元する。

Backup / Restore全体は [バックアップ / リカバリモデル](./60_バックアップ_リカバリモデル.md) を参照。

## 17. データモデルとの関係

PhotoRef、contentHash対象、local IndexedDB store等のデータ構造は [データモデル / DBスキーマ定義](./40_DBスキーマ定義.md) を参照。

本書は写真の意味、binary lifecycle、upload、offline、GCを定義する。

[目次](../目次.md) > アーキテクチャ > 写真 / Blob設計
