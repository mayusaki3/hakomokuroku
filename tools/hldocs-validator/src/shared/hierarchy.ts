const HIERARCHY_PATTERN = /^\[目次\]\([^)]*\)\s*>\s*.+$/;

/**
 * Normalize hierarchy line for stable comparison.
 */
export function normalizeHierarchy(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract header hierarchy line.
 */
export function extractHierarchyHeader(markdown: string): string | null {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  for (const line of lines) {
    const normalized = line.trim();

    if (normalized.length === 0 || normalized.startsWith("<!--")) {
      continue;
    }

    if (normalized === "-->") {
      continue;
    }

    if (HIERARCHY_PATTERN.test(normalized)) {
      return normalizeHierarchy(normalized);
    }

    return null;
  }

  return null;
}

/**
 * Extract footer hierarchy line.
 */
export function extractHierarchyFooter(markdown: string): string | null {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const normalized = lines[index].trim();

    if (normalized.length === 0) {
      continue;
    }

    if (HIERARCHY_PATTERN.test(normalized)) {
      return normalizeHierarchy(normalized);
    }

    return null;
  }

  return null;
}
