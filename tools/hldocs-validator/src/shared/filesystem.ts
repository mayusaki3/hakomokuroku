import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { MarkdownFile } from "../types";

const DEFAULT_DOCS_DIR = path.resolve(
  process.cwd(),
  "../../docs/ja-JP",
);

/**
 * Collect markdown files.
 */
export async function collectMarkdownFiles(
  rootDir = DEFAULT_DOCS_DIR,
): Promise<MarkdownFile[]> {
  const files = await fg("**/*.md", {
    cwd: rootDir,
    absolute: true,
  });

  const results: MarkdownFile[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");

    results.push({
      path: path.relative(process.cwd(), file).replaceAll("\\", "/"),
      content,
    });
  }

  return results;
}
