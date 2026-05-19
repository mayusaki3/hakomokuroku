import { collectMarkdownFiles } from "./shared/filesystem";
import {
  hasFailures,
  printSummary,
  printValidationResults,
} from "./shared/report";

import { validateLLMManaged } from "./validators/validate-llm-managed";

async function main(): Promise<void> {
  const files = await collectMarkdownFiles();

  const issues = [
    ...validateLLMManaged(files),
  ];

  printValidationResults(issues);

  printSummary(issues);

  if (hasFailures(issues)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
