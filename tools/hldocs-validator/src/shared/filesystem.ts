import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { MarkdownFile } from "../types";

const DEFAULT_DOCS_DIR = path.resolve(
  process.cwd(),
  "../../docs/ja-JP",
);

const TARGET_PATTERNS = [
  "04_API仕様/01_ユーザー認証API/**/*.md",
  "04_API仕様/02_設定API/**/*.md",
  "05_テストケース集/01_ユーザー認証API/**/*.md",
  "05_テストケース集/02_設定API/**/*.md",
  "06_HLDocS検証/**/*.md",
];

/**
 * Collect markdown files.
 */
export async function collectMarkdownFiles(
  rootDir = DEFAULT_DOCS_DIR,
): Promise<MarkdownFile[]> {
  const files = await fg(TARGET_PATTERNS, {
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
