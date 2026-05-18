import type {
  ManagedBlock,
  MarkdownFile,
  ValidationIssue,
} from "../types";

import { parseManagedBlock } from "../shared/markdown";

const REQUIRED_FIELDS: (keyof ManagedBlock)[] = [
  "doc_id",
  "lang",
  "canonical_title",
  "document_type",
  "canonical_document",
];

/**
 * Validate HLDocS managed block.
 */
export function validateLLMManaged(
  files: MarkdownFile[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const docIds = new Map<string, string[]>();

  for (const file of files) {
    const block = parseManagedBlock(file.content);

    if (!block) {
      issues.push({
        level: "FAIL",
        validator: "llm-managed",
        file: file.path,
        message: "missing managed block",
      });

      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      const value = block[field];

      if (!value || value.trim() === "") {
        issues.push({
          level: "FAIL",
          validator: "llm-managed",
          file: file.path,
          message: `missing ${field}`,
        });
      }
    }

    if (block.doc_id) {
      const paths = docIds.get(block.doc_id) ?? [];

      paths.push(file.path);

      docIds.set(block.doc_id, paths);
    }
  }

  for (const [docId, paths] of docIds.entries()) {
    if (paths.length > 1) {
      for (const path of paths) {
        issues.push({
          level: "WARN",
          validator: "llm-managed",
          file: path,
          message: `duplicate doc_id: ${docId}`,
        });
      }
    }
  }

  return issues;
}
