<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260518-000200Z-HLDOCS-VALIDATOR-SPEC
lang: ja-JP
canonical_title: HLDocS Validator 仕様
document_type: spec
canonical_document: true
-->

[目次](../README.md) > HLDocS検証 > HLDocS Validator 仕様

# HLDocS Validator 仕様

本書は `tools/hldocs-validator` の仕様を定義する。

---

## 1. 概要

HLDocS validator は、docs/ja-JP 配下 markdown が HLDocS 規約に従っているか検証する CLI ツールである。

---

## 2. 対象

```text
docs/ja-JP/**/*.md
```

---

## 3. validator 一覧

| validator | 用途 |
|---|---|
| validate-llm-managed | LLM-MANAGED block 検査 |
| validate-hierarchy | hierarchy link 検査 |
| validate-readme-links | README 到達可能性検査 |
| validate-spec-pairs | spec/testspec 対応検査 |

---

## 4. validate-llm-managed

### 4.1 必須項目

- HLDocS:LLM-MANAGED
- doc_id
- lang
- canonical_title
- document_type
- canonical_document

### 4.2 FAIL 条件

- block 欠落
- 必須項目欠落
- 空値

### 4.3 WARN 条件

- duplicate doc_id

---

## 5. validate-hierarchy

### 5.1 検査項目

- header hierarchy
- footer hierarchy
- header/footer 一致

---

## 6. validate-readme-links

### 6.1 検査項目

README から到達可能か確認する。

---

## 7. validate-spec-pairs

### 7.1 検査項目

```text
api_xxx.md
↔
api_xxx_testcases.md
```

---

## 8. CLI

```bash
pnpm hldocs:validate
```

---

## 9. exit code

| code | 条件 |
|---|---|
| 0 | PASS/WARN only |
| 1 | FAIL exists |

---

[目次](../README.md) > HLDocS検証 > HLDocS Validator 仕様
