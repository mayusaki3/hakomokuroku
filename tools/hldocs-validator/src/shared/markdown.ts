import type { ManagedBlock } from "../types";

/**
 * Parse HLDocS managed block from markdown.
 */
export function parseManagedBlock(
  markdown: string,
): ManagedBlock | null {
  const match = markdown.match(/<!--([\s\S]*?)-->/);

  if (!match) {
    return null;
  }

  const block = match[1];

  const result: ManagedBlock = {};

  const regex = /^([a-zA-Z0-9_]+):\s*(.+)$/gm;

  for (const line of block.matchAll(regex)) {
    const key = line[1] as keyof ManagedBlock;
    const value = line[2]?.trim();

    result[key] = value;
  }

  return result;
}
