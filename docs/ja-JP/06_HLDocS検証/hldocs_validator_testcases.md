<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260518-000300Z-HLDOCS-VALIDATOR-TESTS
lang: ja-JP
canonical_title: HLDocS Validator テストケース
document_type: testspec
canonical_document: true
-->

[目次](../README.md) > HLDocS検証 > HLDocS Validator テストケース

# HLDocS Validator テストケース

本書は HLDocS validator のテストケースを定義する。

対応仕様:

- hldocs_validator_spec.md

---

## 1. validate-llm-managed

| test_id | 観点 | 期待結果 |
|---|---|---|
| HLDOCS-VALIDATOR-TC-01 | 正常 markdown | PASS |
| HLDOCS-VALIDATOR-TC-02 | block 欠落 | FAIL |
| HLDOCS-VALIDATOR-TC-03 | mandatory field 欠落 | FAIL |
| HLDOCS-VALIDATOR-TC-04 | 空値 | FAIL |
| HLDOCS-VALIDATOR-TC-05 | duplicate doc_id | WARN |

---

## 2. validate-hierarchy

| test_id | 観点 | 期待結果 |
|---|---|---|
| HLDOCS-HIERARCHY-TC-01 | header/footer 一致 | PASS |
| HLDOCS-HIERARCHY-TC-02 | footer 不一致 | FAIL |

---

## 3. validate-spec-pairs

| test_id | 観点 | 期待結果 |
|---|---|---|
| HLDOCS-PAIR-TC-01 | spec/testspec 両存在 | PASS |
| HLDOCS-PAIR-TC-02 | testspec 欠落 | WARN |

---

## 4. 実行コマンド

```bash
pnpm hldocs:validate
pnpm -C tools/hldocs-validator test
```

---

[目次](../README.md) > HLDocS検証 > HLDocS Validator テストケース
