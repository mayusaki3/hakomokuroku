import {
  extractHierarchyFooter,
  extractHierarchyHeader,
} from "../shared/hierarchy";

import type {
  MarkdownFile,
  ValidationIssue,
} from "../types";

/**
 * Validate hierarchy links.
 */
export function validateHierarchy(
  files: MarkdownFile[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const file of files) {
    const header = extractHierarchyHeader(file.content);
    const footer = extractHierarchyFooter(file.content);

    if (!header) {
      issues.push({
        level: "FAIL",
        validator: "hierarchy",
        file: file.path,
        message: "missing header hierarchy",
      });

      continue;
    }

    if (!footer) {
      issues.push({
        level: "FAIL",
        validator: "hierarchy",
        file: file.path,
        message: "missing footer hierarchy",
      });

      continue;
    }

    if (header !== footer) {
      issues.push({
        level: "FAIL",
        validator: "hierarchy",
        file: file.path,
        message: "hierarchy mismatch",
      });
    }
  }

  return issues;
}
