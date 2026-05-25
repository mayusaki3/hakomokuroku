import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateHierarchy } from "../src/validators/validate-hierarchy";

async function loadFixture(name: string) {
  const fixturePath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    name,
  );

  return {
    path: fixturePath,
    content: await readFile(fixturePath, "utf-8"),
  };
}

describe("validateHierarchy", () => {
  it("TC-H01 valid", async () => {
    const file = await loadFixture("hierarchy-valid.md");

    const issues = validateHierarchy([file]);

    expect(issues).toHaveLength(0);
  });

  it("TC-H02 missing footer", async () => {
    const file = await loadFixture("hierarchy-missing-footer.md");

    const issues = validateHierarchy([file]);

    expect(
      issues.some((x) => x.message.includes("missing footer")),
    ).toBe(true);
  });

  it("TC-H03 mismatch", async () => {
    const file = await loadFixture("hierarchy-mismatch.md");

    const issues = validateHierarchy([file]);

    expect(
      issues.some((x) => x.message.includes("mismatch")),
    ).toBe(true);
  });
});
