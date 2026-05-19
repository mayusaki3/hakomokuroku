import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { MarkdownFile } from "../types";

/**
 * Collect markdown files.
 */
export async function collectMarkdownFiles(
  rootDir = "docs/ja-JP",
): Promise<MarkdownFile[]> {
  const files = await fg("**/*.md", {
    cwd: rootDir,
    absolute: true,
  });

  const results: MarkdownFile[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");

    results.push({
      path: path.normalize(file),
      content,
    });
  }

  return results;
}
