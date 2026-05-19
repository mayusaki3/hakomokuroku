import type { ValidationIssue } from "../types";

/**
 * Print validation results.
 */
export function printValidationResults(
  issues: ValidationIssue[],
): void {
  for (const issue of issues) {
    const line = `[${issue.level}][${issue.validator}] ${issue.file} ${issue.message}`;

    if (issue.level === "FAIL") {
      console.error(line);
      continue;
    }

    console.log(line);
  }
}

/**
 * Return true if FAIL exists.
 */
export function hasFailures(
  issues: ValidationIssue[],
): boolean {
  return issues.some((issue) => issue.level === "FAIL");
}

/**
 * Print summary.
 */
export function printSummary(
  issues: ValidationIssue[],
): void {
  const pass = issues.filter((x) => x.level === "PASS").length;
  const warn = issues.filter((x) => x.level === "WARN").length;
  const fail = issues.filter((x) => x.level === "FAIL").length;

  console.log(`PASS: ${pass}`);
  console.log(`WARN: ${warn}`);
  console.log(`FAIL: ${fail}`);
}
