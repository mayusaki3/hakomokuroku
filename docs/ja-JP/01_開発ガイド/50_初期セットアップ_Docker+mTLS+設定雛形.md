[目次](../目次.md) > 環境構築 > 初期セットアップ（Docker + mTLS + 設定雛形）

# 環境構築（初期セットアップ）

あなたのリポジトリ現状は docs のみ（README + docs/ja-JP）なので、環境構築用のファイル群を **新規追加**する。
追加先はリポジトリ直下に `deploy/docker/` を作る。

---

## 1. 追加するディレクトリ/ファイル（新規）

- deploy/
  - docker/
    - docker-compose.yml
    - .env.example
    - config/
      - svc-proxy.yaml
      - svc-web.yaml
    - certs/
      - (生成物を格納)
      - .gitkeep
    - scripts/
      - gen-certs.ps1
      - gen-certs.sh
      - smoke.ps1
      - smoke.sh

※ `certs/` の中身（秘密鍵/証明書）はコミットしない前提。後で .gitignore へ追加する。

---

## 2. 生成する証明書（mTLS）

内部API用（svc-web ⇔ svc-proxy）の mTLS をローカルで再現する。

- 内部CA
  - ca.key / ca.crt
- svc-proxy（サーバー証明書）
  - proxy.key / proxy.crt（SAN: DNS=svc-proxy, DNS=localhost）
- svc-web（クライアント証明書）
  - web.key / web.crt（用途: クライアント証明書）

生成物はすべて `deploy/docker/certs/` に出力する。

---

## 3. ファイル内容（そのまま作成）

以降、各ファイルの完全版を提示する。
（このまま新規ファイルとして作成）

---

### 3.1 deploy/docker/docker-compose.yml

```yaml
services:
  svc-proxy:
    image: safemail-proxy/svc-proxy:dev
    container_name: safemail-svc-proxy
    environment:
      - SMP_CONFIG_PATH=/app/config/svc-proxy.yaml
    volumes:
      - ./config:/app/config:ro
      - ./certs:/app/certs:ro
    ports:
      # 内部API（svc-web -> svc-proxy）
      - "9443:9443"
      # IMAPS/POPS（将来実装時に使用。今はダミーでもOK）
      - "1993:1993"
      - "1995:1995"
    networks:
      - safemail-net

  svc-web:
    image: safemail-proxy/svc-web:dev
    container_name: safemail-svc-web
    environment:
      - SMP_CONFIG_PATH=/app/config/svc-web.yaml
      # svc-web が内部APIへ接続するベースURL（mTLS）
      - SMP_INTERNAL_PROXY_BASE=https://svc-proxy:9443
    volumes:
      - ./config:/app/config:ro
      - ./certs:/app/certs:ro
    ports:
      # safe.local（ローカルでのHTTP(S)提供）
      - "8443:8443"
    depends_on:
      - svc-proxy
    networks:
      - safemail-net

networks:
  safemail-net:
    name: safemail-net
```

---

### 3.2 deploy/docker/.env.example

```env
# ここに秘密情報は置かない（例示のみ）

# 証明書配置（composeは volumes で /app/certs にマウント）
# KEK は将来ここではなく OS の秘密管理や環境変数に置くことも可能だが、
# まずは設定ファイルで進める。

# 例: ダミーKEK（16進 or Base64 を許容。実装で形式チェック）
SMP_ENCRYPTION_KEK=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

---

### 3.3 deploy/docker/config/svc-proxy.yaml

```yaml
# svc-proxy 設定（10_設定仕様 準拠）

encryption:
  # 添付暗号化用 KEK（本番は秘密管理推奨）
  # 形式: Base64 または Hex（実装で検証）
  kek: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# 社外メール接続（実装後に使用）
upstream:
  default_timeout_sec: 10
  max_message_size: 26214400 # 25MB 例

credential_cache:
  enabled: true
  # TTLは設定可。認証成功時にスライド更新（仕様確定済み）
  ttl_seconds: 10800

internal_api:
  listen:
    host: "0.0.0.0"
    port: 9443
  auth:
    type: "mtls"  # mtls / signature
    # signature 方式時のみ
    shared_secret: ""

tls:
  # svc-proxy が内部API（9443）で提示するサーバー証明書
  server_cert: "/app/certs/proxy.crt"
  server_key: "/app/certs/proxy.key"
  # svc-web クライアント証明書を検証するためのCA
  client_ca: "/app/certs/ca.crt"
```

---

### 3.4 deploy/docker/config/svc-web.yaml

```yaml
# svc-web 設定（10_設定仕様 準拠）

encryption:
  # KEKは svc-proxy と同一値を使用（再インストール後の復号性のため）
  kek: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

safe_local:
  host: "0.0.0.0"
  port: 8443
  base_url: "https://localhost:8443"

fetch:
  retry_count: 1
  retry_timeout_sec: 5

preview:
  max_inline_size: 10485760 # 10MB 例
  allowed_types:
    - "image/*"
    - "application/pdf"
    - "text/plain"

internal_api:
  proxy_base_url: "https://svc-proxy:9443"
  auth:
    type: "mtls"
    shared_secret: ""

tls:
  # svc-web が safe.local（8443）で提示するサーバー証明書（ローカル用：任意）
  # まずは http でも良いが、safe.local 前提なので将来は必須。
  # 今回は “まず内部API mTLS” が目的のため、web側サーバー証明書は後で追加でもよい。
  #
  # ただし、ここでは一旦同じCAで web 用サーバー証明書を作る運用も可能。
  #
  # ひとまず未設定としておく（実装で必須化するなら設定仕様と合わせて追加）
  server_cert: ""
  server_key: ""

mtls_client:
  # svc-web が svc-proxy 内部APIへ接続する際に提示するクライアント証明書
  client_cert: "/app/certs/web.crt"
  client_key: "/app/certs/web.key"
  server_ca: "/app/certs/ca.crt"
```

---

### 3.5 deploy/docker/certs/.gitkeep

```text
# certs/ は空ディレクトリを保持するためのファイル
```

---

## 4. 証明書生成スクリプト（新規）

前提：OpenSSL が利用できること。
（Windows では Git for Windows の openssl.exe か、OpenSSL の導入が必要）

### 4.1 deploy/docker/scripts/gen-certs.ps1

```powershell
param(
  [string]$OutDir = "$(Split-Path $PSScriptRoot -Parent)\certs"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Command not found: $name (OpenSSL is required)"
  }
}

Require-Command "openssl"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$caKey    = Join-Path $OutDir "ca.key"
$caCrt    = Join-Path $OutDir "ca.crt"
$proxyKey = Join-Path $OutDir "proxy.key"
$proxyCsr = Join-Path $OutDir "proxy.csr"
$proxyCrt = Join-Path $OutDir "proxy.crt"
$webKey   = Join-Path $OutDir "web.key"
$webCsr   = Join-Path $OutDir "web.csr"
$webCrt   = Join-Path $OutDir "web.crt"
$proxyExt = Join-Path $OutDir "proxy.ext"
$webExt   = Join-Path $OutDir "web.ext"

# 1) CA
openssl genrsa -out $caKey 4096 | Out-Null
openssl req -x509 -new -nodes -key $caKey -sha256 -days 3650 -out $caCrt -subj "/CN=SafeMailProxy-Dev-CA" | Out-Null

# 2) svc-proxy server cert (SAN: svc-proxy, localhost)
@"
subjectAltName=DNS:svc-proxy,DNS:localhost
extendedKeyUsage=serverAuth
"@ | Set-Content -Encoding ASCII $proxyExt

openssl genrsa -out $proxyKey 2048 | Out-Null
openssl req -new -key $proxyKey -out $proxyCsr -subj "/CN=svc-proxy" | Out-Null
openssl x509 -req -in $proxyCsr -CA $caCrt -CAkey $caKey -CAcreateserial -out $proxyCrt -days 825 -sha256 -extfile $proxyExt | Out-Null

# 3) svc-web client cert (clientAuth)
@"
extendedKeyUsage=clientAuth
"@ | Set-Content -Encoding ASCII $webExt

openssl genrsa -out $webKey 2048 | Out-Null
openssl req -new -key $webKey -out $webCsr -subj "/CN=svc-web" | Out-Null
openssl x509 -req -in $webCsr -CA $caCrt -CAkey $caKey -CAcreateserial -out $webCrt -days 825 -sha256 -extfile $webExt | Out-Null

Write-Host "[OK] Generated certs in: $OutDir"
Write-Host " - CA: $caCrt"
Write-Host " - svc-proxy server: $proxyCrt"
Write-Host " - svc-web client: $webCrt"
```

---

### 4.2 deploy/docker/scripts/gen-certs.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-"$(cd "$(dirname "$0")/.." && pwd)/certs"}"

command -v openssl >/dev/null 2>&1 || { echo "openssl is required"; exit 1; }

mkdir -p "$OUT_DIR"

CA_KEY="$OUT_DIR/ca.key"
CA_CRT="$OUT_DIR/ca.crt"
PROXY_KEY="$OUT_DIR/proxy.key"
PROXY_CSR="$OUT_DIR/proxy.csr"
PROXY_CRT="$OUT_DIR/proxy.crt"
WEB_KEY="$OUT_DIR/web.key"
WEB_CSR="$OUT_DIR/web.csr"
WEB_CRT="$OUT_DIR/web.crt"
PROXY_EXT="$OUT_DIR/proxy.ext"
WEB_EXT="$OUT_DIR/web.ext"

# 1) CA
openssl genrsa -out "$CA_KEY" 4096
openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 -out "$CA_CRT" -subj "/CN=SafeMailProxy-Dev-CA"

# 2) svc-proxy server cert (SAN)
cat > "$PROXY_EXT" <<EOF
subjectAltName=DNS:svc-proxy,DNS:localhost
extendedKeyUsage=serverAuth
EOF

openssl genrsa -out "$PROXY_KEY" 2048
openssl req -new -key "$PROXY_KEY" -out "$PROXY_CSR" -subj "/CN=svc-proxy"
openssl x509 -req -in "$PROXY_CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial -out "$PROXY_CRT" -days 825 -sha256 -extfile "$PROXY_EXT"

# 3) svc-web client cert
cat > "$WEB_EXT" <<EOF
extendedKeyUsage=clientAuth
EOF

openssl genrsa -out "$WEB_KEY" 2048
openssl req -new -key "$WEB_KEY" -out "$WEB_CSR" -subj "/CN=svc-web"
openssl x509 -req -in "$WEB_CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial -out "$WEB_CRT" -days 825 -sha256 -extfile "$WEB_EXT"

echo "[OK] Generated certs in: $OUT_DIR"
echo " - CA: $CA_CRT"
echo " - svc-proxy server: $PROXY_CRT"
echo " - svc-web client: $WEB_CRT"
```

---

## 5. スモーク（環境側の確認だけ：実装前にできる範囲）

実装前はサービスが存在しないため、ここでは「証明書生成・ファイル配置の整合」だけ確認する。

### 5.1 deploy/docker/scripts/smoke.ps1

```powershell
param(
  [string]$Root = "$(Split-Path $PSScriptRoot -Parent)"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$certDir = Join-Path $Root "certs"
$configDir = Join-Path $Root "config"

$required = @(
  (Join-Path $certDir "ca.crt"),
  (Join-Path $certDir "proxy.crt"),
  (Join-Path $certDir "proxy.key"),
  (Join-Path $certDir "web.crt"),
  (Join-Path $certDir "web.key"),
  (Join-Path $configDir "svc-proxy.yaml"),
  (Join-Path $configDir "svc-web.yaml")
)

$missing = @()
foreach ($p in $required) {
  if (-not (Test-Path $p)) { $missing += $p }
}

if ($missing.Count -gt 0) {
  Write-Error "[NG] Missing files:`n$($missing -join "`n")"
  exit 1
}

Write-Host "[OK] smoke check passed"
```

---

### 5.2 deploy/docker/scripts/smoke.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-"$(cd "$(dirname "$0")/.." && pwd)"}"

REQ=(
  "$ROOT/certs/ca.crt"
  "$ROOT/certs/proxy.crt"
  "$ROOT/certs/proxy.key"
  "$ROOT/certs/web.crt"
  "$ROOT/certs/web.key"
  "$ROOT/config/svc-proxy.yaml"
  "$ROOT/config/svc-web.yaml"
)

MISSING=()
for p in "${REQ[@]}"; do
  [[ -f "$p" ]] || MISSING+=("$p")
done

if [[ "${#MISSING[@]}" -gt 0 ]]; then
  echo "[NG] Missing files:"
  printf '%s\n' "${MISSING[@]}"
  exit 1
fi

echo "[OK] smoke check passed"
```

---

## 6. 実行手順（Windows / PowerShell）

1) 証明書生成  
   - deploy/docker/scripts/gen-certs.ps1

2) スモーク  
   - deploy/docker/scripts/smoke.ps1

3) 実装が入ったら起動  
   - deploy/docker/docker-compose.yml を使用

---

## 7. 次にやること（あなたの作業）

1) 上記ファイルをリポジトリへ追加（新規作成）
2) `deploy/docker/certs/` を .gitignore に追加（証明書をコミットしない）
3) gen-certs → smoke を実行してOKを確認
4) 結果（OK/NGとエラーメッセージ）を貼る

---
[目次](../目次.md) > 環境構築 > 初期セットアップ（Docker + mTLS + 設定雛形）
